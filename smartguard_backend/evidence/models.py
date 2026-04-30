# evidence/models.py
# ─────────────────────────────────────────────────────────────────────────────
# FRS Module 5: Evidence Management
#
# Each EvidenceClip is tied to an Alert. When the detection worker fires,
# it saves a 30-second video clip and creates an EvidenceClip record.
# Files are hashed with SHA-256 on creation for tamper detection.
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

    alert = models.ForeignKey(
        Alert,
        on_delete=models.CASCADE,
        related_name="evidence_clips",
    )
    file = models.FileField(upload_to=evidence_upload_path, blank=True)
    file_path = models.CharField(max_length=500, blank=True)

    # ── Metadata ──────────────────────────────────────────────────────────────
    duration_seconds = models.FloatField(default=30.0)
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

    def compute_hash(self):
        """Compute SHA-256 hash of the clip file."""
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
