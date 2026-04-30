# accounts/models.py
# ─────────────────────────────────────────────────────────────────────────────
# Key changes from v2:
#   - Lockout is PERMANENT until admin manually unlocks (no LOCKOUT_MINUTES timer)
#   - OTPToken is now dual-purpose: type="LOGIN" (2FA) or type="RESET" (password reset)
#   - last_login_ip field added for new-device detection
#   - phone_number field retained for SMS alerts
# ─────────────────────────────────────────────────────────────────────────────

import random
from datetime import timedelta

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class CustomUser(AbstractUser):
    ROLE_CHOICES = [
        ('ADMIN',       'Admin'),
        ('OPS_MANAGER', 'Operations Manager'),
        ('STAFF',       'Staff'),
    ]

    role                  = models.CharField(max_length=20, choices=ROLE_CHOICES, default='STAFF')
    is_locked             = models.BooleanField(default=False)
    failed_login_attempts = models.IntegerField(default=0)
    last_failed_login     = models.DateTimeField(null=True, blank=True)

    # ── Contact ────────────────────────────────────────────────────────────────
    phone_number = models.CharField(
        max_length=20, blank=True, default='',
        help_text='E.164 format (+63XXXXXXXXXX). Used by Twilio for SMS alerts.',
    )

    # ── New-device detection ───────────────────────────────────────────────────
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)

    # ── FRS 1.B: 3 failed attempts → permanent lock (admin must unlock) ────────
    MAX_ATTEMPTS = 3

    def __str__(self):
        return f"{self.email} ({self.get_role_display()})"

    # ── Lockout helpers ────────────────────────────────────────────────────────

    def is_locked_out(self):
        """
        Returns True when the account is locked.
        Lock is PERMANENT — no auto-expiry.  Admin must use the Unlock action
        in Access Control to restore access.
        """
        return self.is_locked

    def seconds_until_unlock(self):
        """Kept for API compatibility.  Always returns 0 (lock is permanent)."""
        return 0

    def record_failed_attempt(self):
        """
        Increment failure counter.
        Locks the account permanently once MAX_ATTEMPTS is reached.
        """
        self.failed_login_attempts += 1
        self.last_failed_login     = timezone.now()
        if self.failed_login_attempts >= self.MAX_ATTEMPTS:
            self.is_locked = True
        self.save(update_fields=['failed_login_attempts', 'last_failed_login', 'is_locked'])

    def record_successful_login(self, ip_address=None):
        """
        Reset lockout fields on a successful login.
        Returns True if the IP address has changed (new-device alert needed).
        """
        was_new_ip = (
            ip_address is not None
            and self.last_login_ip is not None
            and self.last_login_ip != ip_address
        )
        self._clear_lockout(save=False)
        if ip_address:
            self.last_login_ip = ip_address
        self.save(update_fields=[
            'is_locked', 'failed_login_attempts',
            'last_failed_login', 'last_login_ip',
        ])
        return was_new_ip

    def attempts_remaining(self):
        return max(0, self.MAX_ATTEMPTS - self.failed_login_attempts)

    def _clear_lockout(self, save=True):
        self.is_locked             = False
        self.failed_login_attempts = 0
        self.last_failed_login     = None
        if save:
            self.save(update_fields=['is_locked', 'failed_login_attempts', 'last_failed_login'])


# ── OTPToken — Admin 2FA login AND password reset for all roles ───────────────
# type="LOGIN"  — 6-digit code emailed to Admin after correct password (2FA)
# type="RESET"  — 6-digit code emailed to any user for password reset
#
# FRS 1.B: 2FA for Admin; FRS 1.C: password reset via OTP

class OTPToken(models.Model):
    TYPE_CHOICES = [
        ('LOGIN', '2FA Login'),
        ('RESET', 'Password Reset'),
    ]

    OTP_LIFETIME_MINUTES = 10   # generous to avoid UX frustration

    user       = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name='otp_tokens',
    )
    token_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='LOGIN')
    token      = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used       = models.BooleanField(default=False)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    def is_valid(self):
        return not self.used and timezone.now() < self.expires_at

    @classmethod
    def create_for_user(cls, user, token_type='LOGIN', ip_address=None):
        """
        Invalidates all existing pending tokens of the same type for this user,
        then generates a fresh 6-digit code.
        """
        cls.objects.filter(user=user, token_type=token_type, used=False).update(used=True)
        code       = f"{random.randint(0, 999999):06d}"
        expires_at = timezone.now() + timedelta(minutes=cls.OTP_LIFETIME_MINUTES)
        return cls.objects.create(
            user=user, token_type=token_type,
            token=code, expires_at=expires_at, ip_address=ip_address,
        )

    def mark_used(self):
        self.used = True
        self.save(update_fields=['used'])

    def __str__(self):
        status = 'used' if self.used else ('expired' if not self.is_valid() else 'valid')
        return f"OTP({self.user.username}, {self.token_type}, {status})"