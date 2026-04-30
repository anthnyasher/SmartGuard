
from django.conf import settings
from django.db import models


class AuditLog(models.Model):

    # ── Action catalogue ───────────────────────────────────────────────────────
    ACTION_CHOICES = [
        # Authentication
        ("LOGIN_SUCCESS",      "Login Success"),
        ("LOGIN_FAILED",       "Login Failed"),
        ("LOGIN_LOCKED",       "Account Locked"),
        ("LOGIN_UNLOCKED",     "Account Unlocked"),
        ("LOGOUT",             "Logout"),
        ("OTP_SENT",           "OTP Sent"),
        ("OTP_SUCCESS",        "OTP Verified"),
        ("OTP_FAILED",         "OTP Failed"),
        ("OTP_EXPIRED",        "OTP Expired"),
        ("NEW_IP_LOGIN",       "Login from New IP"),
        ("SESSION_EXPIRED",    "Session Expired"),
        # User management
        ("USER_CREATED",       "User Created"),
        ("USER_UPDATED",       "User Updated"),
        ("USER_DELETED",       "User Deleted"),
        ("USER_ACTIVATED",     "User Activated"),
        ("USER_DEACTIVATED",   "User Deactivated"),
        ("PASSWORD_RESET",     "Password Reset"),
        ("PASSWORD_CHANGED",   "Password Changed"),
        # Camera management
        ("CAMERA_ADDED",       "Camera Added"),
        ("CAMERA_UPDATED",     "Camera Updated"),
        ("CAMERA_DELETED",     "Camera Deleted"),
        ("CAMERA_ONLINE",      "Camera Online"),
        ("CAMERA_OFFLINE",     "Camera Offline"),
        # Detection / Alert
        ("ALERT_CREATED",      "Alert Created"),
        ("ALERT_REVIEWED",     "Alert Reviewed"),
        ("ALERT_ESCALATED",    "Alert Escalated"),
        ("ALERT_FALSE_POS",    "Alert Marked False Positive"),
        ("ALERT_CLOSED",       "Alert Closed"),
        ("ALERT_ACKNOWLEDGED", "Alert Acknowledged"),
        ("EVIDENCE_ACCESSED",  "Evidence Accessed"),
        ("EVIDENCE_DOWNLOAD",  "Evidence Downloaded"),
        # System / Config
        ("CONFIG_CHANGED",     "System Configuration Changed"),
        ("BACKUP_CREATED",     "Backup Created"),
        ("BACKUP_RESTORED",    "Backup Restored"),
        # Security anomalies
        ("BRUTE_FORCE",        "Brute Force Detected"),
        ("BLOCKED_IP",         "Repeated Blocked IP"),
        ("INTEGRITY_FAIL",     "Integrity Check Failure"),
        ("SUSPICIOUS_ACCESS",  "Suspicious Access Attempt"),
    ]

    # ── Category labels (maps to LogsPage sidebar) ────────────────────────────
    CATEGORY_CHOICES = [
        ("OPERATIONAL",    "Operational"),
        ("USER_ACTIVITY",  "User Activity"),
        ("DETECTION",      "Alert & Detection"),
        ("SECURITY",       "Security Threats"),
        ("AUDIT",          "Audit"),
    ]

    # ── Severity levels ────────────────────────────────────────────────────────
    LEVEL_CHOICES = [
        ("INFO",     "Info"),
        ("WARNING",  "Warning"),
        ("MEDIUM",   "Medium"),
        ("HIGH",     "High"),
        ("CRITICAL", "Critical"),
    ]

    # ── WHO ────────────────────────────────────────────────────────────────────
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
    )
    username = models.CharField(max_length=150, blank=True)
    # ^ snapshot — preserved even if the account is later deleted

    # ── WHERE ──────────────────────────────────────────────────────────────────
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    user_agent  = models.TextField(blank=True)
    device_info = models.CharField(max_length=255, blank=True)
    # ^ parsed summary: "Chrome on Windows 10 (Desktop)"

    # ── WHAT ───────────────────────────────────────────────────────────────────
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default="OPERATIONAL")
    level    = models.CharField(max_length=10, choices=LEVEL_CHOICES,    default="INFO")
    action   = models.CharField(max_length=40, choices=ACTION_CHOICES)
    message  = models.TextField()
    source   = models.CharField(max_length=100, blank=True)
    # ^ source component label shown in the UI, e.g. "Login Security"

    # ── EXTRA metadata ─────────────────────────────────────────────────────────
    extra = models.JSONField(default=dict, blank=True)
    # ^ Examples:
    #   LOGIN_FAILED  → {"attempts_remaining": 2}
    #   LOGIN_LOCKED  → {"locked_until": "2026-03-27T10:32:00Z"}
    #   CAMERA_ADDED  → {"camera_id": 5, "camera_name": "Entrance CAM-01"}

    # ── WHEN ───────────────────────────────────────────────────────────────────
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes  = [
            models.Index(fields=["category"]),
            models.Index(fields=["level"]),
            models.Index(fields=["action"]),
            models.Index(fields=["timestamp"]),
            models.Index(fields=["user"]),
            models.Index(fields=["ip_address"]),
        ]

    def __str__(self):
        actor = self.username or "anonymous"
        return f"[{self.level}] {self.action} — {actor} @ {self.timestamp:%Y-%m-%d %H:%M:%S}"