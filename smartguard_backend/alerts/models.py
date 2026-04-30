from django.db import models
from django.contrib.auth import get_user_model
from cameras.models import Camera

User = get_user_model()


class Alert(models.Model):
    BEHAVIOR_CHOICES = [
        ("LOITERING", "Loitering"),
        ("CONCEALMENT", "Concealment"),
        ("RAPID_EXIT", "Rapid Exit"),
        ("SHOPLIFTING", "Shoplifting"),
    ]

    SEVERITY_CHOICES = [
        ("LOW", "Low"),
        ("MEDIUM", "Medium"),
        ("HIGH", "High"),
        ("CRITICAL", "Critical"),
    ]

    STATUS_CHOICES = [
        ("NEW", "New"),
        ("REVIEWED", "Reviewed"),
        ("ESCALATED", "Escalated"),
        ("FALSE_POSITIVE", "False Positive"),
        ("CLOSED", "Closed"),
    ]

    ALERT_CATEGORY_CHOICES = [
        ("SHOPLIFTING", "Shoplifting / Behavioral"),
        ("SYSTEM_SECURITY", "System / Cybersecurity"),
    ]

    camera = models.ForeignKey(Camera, on_delete=models.CASCADE)
    behavior_type = models.CharField(max_length=20, choices=BEHAVIOR_CHOICES)
    confidence = models.FloatField()

    severity = models.CharField(
        max_length=10,
        choices=SEVERITY_CHOICES,
        default="MEDIUM",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="NEW",
    )
    alert_category = models.CharField(
        max_length=30,
        choices=ALERT_CATEGORY_CHOICES,
        default="SHOPLIFTING",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    # Snapshot of the annotated frame when the detection occurred
    snapshot = models.ImageField(
        upload_to="snapshots/%Y/%m/%d/",
        blank=True,
        null=True,
    )

    # NEW: who this alert is assigned to
    assigned_to = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_alerts",
    )

    acknowledged = models.BooleanField(default=False)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    acknowledged_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="acknowledged_alerts",
    )

    reviewed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_alerts",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.behavior_type} - {self.camera.name} ({self.created_at})"

def create_alert_from_detection(camera, behavior_type, raw_confidence):
    severity = map_confidence_to_severity(behavior_type, raw_confidence)

    alert = Alert.objects.create(
        camera=camera,
        behavior_type=behavior_type,
        confidence=raw_confidence,
        severity=severity,
        alert_category="SHOPLIFTING",
        status="NEW",
    )
    return alert

def map_confidence_to_severity(behavior_type, c):
    if behavior_type == "CONCEALMENT":
        if c >= 0.95: return "CRITICAL"
        if c >= 0.85: return "HIGH"
        if c >= 0.70: return "MEDIUM"
        return "LOW"

    if behavior_type == "LOITERING":
        if c >= 0.90: return "HIGH"
        if c >= 0.70: return "MEDIUM"
        return "LOW"

    if behavior_type == "RAPID_EXIT":
        if c >= 0.92: return "CRITICAL"
        if c >= 0.80: return "HIGH"
        if c >= 0.65: return "MEDIUM"
        return "LOW"

    # Generic fallback for SHOPLIFTING or any unrecognised behavior
    if c >= 0.90: return "HIGH"
    if c >= 0.70: return "MEDIUM"
    return "LOW"
    # other behaviors...


