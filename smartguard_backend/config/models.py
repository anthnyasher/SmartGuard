# config/models.py
# ─────────────────────────────────────────────────────────────────────────────
# Singleton system configuration — persists all Settings page values.
# Uses a JSON field for flexibility: new settings can be added without
# a migration as long as defaults are handled in the serializer.
# ─────────────────────────────────────────────────────────────────────────────

from django.db import models


class SystemConfig(models.Model):
    """
    Singleton configuration record.
    Only one row should ever exist (enforced by get_solo / save override).
    """

    # ── General ───────────────────────────────────────────────────────────────
    system_name = models.CharField(max_length=100, default="SmartGuard AI")
    store_name = models.CharField(max_length=200, default="FairPrice Supermarket")
    timezone = models.CharField(max_length=50, default="Asia/Manila")
    date_format = models.CharField(max_length=20, default="YYYY-MM-DD")
    session_timeout_minutes = models.IntegerField(default=30)

    # ── Notifications ─────────────────────────────────────────────────────────
    email_alerts_enabled = models.BooleanField(default=True)
    sms_alerts_enabled = models.BooleanField(default=False)
    alert_email = models.EmailField(blank=True, default="admin@fairprice.com")
    alert_phone = models.CharField(max_length=20, blank=True, default="")
    notify_on_critical = models.BooleanField(default=True)
    notify_on_high = models.BooleanField(default=True)
    notify_on_medium = models.BooleanField(default=False)
    notify_on_low = models.BooleanField(default=False)

    # ── AI Detection ──────────────────────────────────────────────────────────
    ai_model = models.CharField(max_length=20, default="YOLOv5s")
    frame_rate = models.IntegerField(default=15)
    confidence_threshold = models.IntegerField(default=65)  # percentage (10-99)
    loitering_duration = models.IntegerField(default=60)  # seconds
    concealment_zones = models.JSONField(default=list, blank=True)
    enabled_behaviors = models.JSONField(
        default=dict,
        blank=True,
        help_text="e.g. {SHOPLIFTING: true, CONCEALMENT: true, LOITERING: true}",
    )
    auto_create_evidence = models.BooleanField(default=True)

    # ── Security ──────────────────────────────────────────────────────────────
    max_failed_logins = models.IntegerField(default=3)
    lockout_duration_minutes = models.IntegerField(default=2)
    require_strong_password = models.BooleanField(default=True)
    log_retention_days = models.IntegerField(default=30)

    # ── Backup ────────────────────────────────────────────────────────────────
    auto_backup = models.BooleanField(default=True)
    backup_frequency = models.CharField(max_length=10, default="daily")
    backup_time = models.CharField(max_length=5, default="02:00")
    backup_retention_days = models.IntegerField(default=30)

    # ── Meta ──────────────────────────────────────────────────────────────────
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "System Configuration"
        verbose_name_plural = "System Configuration"

    def save(self, *args, **kwargs):
        # Enforce singleton — always use pk=1
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"SystemConfig (updated {self.updated_at})"
