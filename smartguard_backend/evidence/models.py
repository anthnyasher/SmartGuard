# evidence/models.py
# ─────────────────────────────────────────────────────────────────────────────
# FRS Module 5: Evidence Management
#
# Each EvidenceClip is tied to an Alert. When the detection worker fires,
# it saves a 10-second video clip, encrypts it with AES-256-GCM, and creates
# an EvidenceClip record.  Files are hashed with SHA-256 on creation for
# tamper detection.
#
# Review workflow:
#   PENDING        → clip awaiting admin/OPS review (auto-expires in 48h)
#   CONFIRMED      → admin/OPS deemed this a positive incident (retained)
#   FALSE_POSITIVE → tagged as false positive (deleted immediately)
# ─────────────────────────────────────────────────────────────────────────────

import hashlib
import os

from django.conf import settings
from django.db import models
from alerts.models import Alert


def evidence_upload_path(instance, filename):
    """Store clips under MEDIA_ROOT/evidence/YYYY/MM/DD/<filename>"""
    from django.utils import timezone
    now = timezone.now()
    return f"evidence/{now:%Y}/{now:%m}/{now:%d}/{filename}"


class EvidenceClip(models.Model):
    STATUS_CHOICES = [
        ("PROCESSING", "Processing"),
        ("READY", "Ready"),
        ("ERROR", "Error"),
    ]

    INTEGRITY_CHOICES = [
        ("PENDING", "Pending"),
        ("VERIFIED", "Verified"),
        ("FAILED", "Failed"),
    ]

    REVIEW_CHOICES = [
        ("PENDING", "Pending Review"),
        ("CONFIRMED", "Confirmed Incident"),
        ("FALSE_POSITIVE", "False Positive"),
    ]

    alert = models.ForeignKey(
        Alert,
        on_delete=models.CASCADE,
        related_name="evidence_clips",
    )
    file = models.FileField(upload_to=evidence_upload_path, blank=True)
    file_path = models.CharField(max_length=500, blank=True)

    # ── Metadata ──────────────────────────────────────────────────────────────
    duration_seconds = models.FloatField(default=10.0)
    file_size_bytes = models.BigIntegerField(default=0)
    resolution = models.CharField(max_length=20, blank=True)  # e.g. "1280x720"
    fps = models.FloatField(default=15.0)

    # ── Integrity ─────────────────────────────────────────────────────────────
    sha256_hash = models.CharField(max_length=64, blank=True)
    integrity_status = models.CharField(
        max_length=10,
        choices=INTEGRITY_CHOICES,
        default="PENDING",
    )
    last_verified_at = models.DateTimeField(null=True, blank=True)

    # ── AES-256-GCM Encryption ────────────────────────────────────────────────
    is_encrypted = models.BooleanField(
        default=True,
        help_text="Whether the clip file is AES-256-GCM encrypted at rest.",
    )
    encryption_iv = models.CharField(
        max_length=32,
        blank=True,
        help_text="Hex-encoded 12-byte AES-GCM nonce/IV.",
    )
    encryption_tag = models.CharField(
        max_length=32,
        blank=True,
        help_text="Hex-encoded 16-byte AES-GCM authentication tag.",
    )

    # ── Review Workflow ───────────────────────────────────────────────────────
    review_status = models.CharField(
        max_length=20,
        choices=REVIEW_CHOICES,
        default="PENDING",
        help_text="Admin/OPS review status. PENDING clips auto-expire.",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_evidence",
        help_text="Admin or OPS Manager who reviewed this clip.",
    )
    reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the clip was reviewed.",
    )

    # ── Status ────────────────────────────────────────────────────────────────
    status = models.CharField(
        max_length=15,
        choices=STATUS_CHOICES,
        default="PROCESSING",
    )

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["alert"]),
            models.Index(fields=["status"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["review_status"]),
            models.Index(fields=["expires_at"]),
        ]

    def __str__(self):
        return f"EVD-{self.created_at:%Y%m%d}-{self.id:04d}"

    @property
    def clip_id(self):
        if self.created_at:
            return f"EVD-{self.created_at:%Y%m%d}-{self.id:04d}"
        return f"EVD-PENDING-{self.id:04d}"

    @property
    def camera(self):
        return self.alert.camera

    @property
    def behavior_type(self):
        return self.alert.behavior_type

    @property
    def severity(self):
        return self.alert.severity

    @property
    def file_size_mb(self):
        if self.file_size_bytes:
            return round(self.file_size_bytes / (1024 * 1024), 1)
        return 0

    @property
    def time_until_expiry(self):
        """Returns seconds until expiry, or None if no expiry set."""
        if not self.expires_at:
            return None
        from django.utils import timezone
        delta = self.expires_at - timezone.now()
        return max(0, int(delta.total_seconds()))

    @property
    def is_expired(self):
        """Check if the clip has passed its expiry time."""
        if not self.expires_at:
            return False
        from django.utils import timezone
        return timezone.now() >= self.expires_at

    def compute_hash(self):
        """Compute SHA-256 hash of the clip file (encrypted or plaintext)."""
        if not self.file_path or not os.path.exists(self.file_path):
            return ""
        sha256 = hashlib.sha256()
        with open(self.file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def verify_integrity(self):
        """Re-compute hash and compare against stored hash."""
        from django.utils import timezone
        current_hash = self.compute_hash()
        if not current_hash:
            self.integrity_status = "FAILED"
        elif current_hash == self.sha256_hash:
            self.integrity_status = "VERIFIED"
        else:
            self.integrity_status = "FAILED"
        self.last_verified_at = timezone.now()
        self.save(update_fields=["integrity_status", "last_verified_at"])
        return self.integrity_status

    def delete_file_from_disk(self):
        """Remove the physical evidence file from disk."""
        if self.file_path and os.path.exists(self.file_path):
            try:
                os.remove(self.file_path)
                return True
            except OSError:
                return False
        return False
