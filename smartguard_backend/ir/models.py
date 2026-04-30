# ir/models.py
# ─────────────────────────────────────────────────────────────────────────────
# FRS Module 7: Incident Response
#
# Tracks the human response to an Alert — who responded, what action was taken,
# current resolution status, and any notes or follow-up details.
# ─────────────────────────────────────────────────────────────────────────────

from django.conf import settings
from django.db import models
from alerts.models import Alert


class IncidentReport(models.Model):
    STATUS_CHOICES = [
        ("OPEN", "Open"),
        ("IN_PROGRESS", "In Progress"),
        ("RESOLVED", "Resolved"),
        ("ESCALATED", "Escalated to Authorities"),
        ("FALSE_ALARM", "False Alarm"),
    ]

    ACTION_CHOICES = [
        ("VERBAL_WARNING", "Verbal Warning"),
        ("ITEM_RECOVERED", "Item Recovered"),
        ("SUSPECT_DETAINED", "Suspect Detained"),
        ("POLICE_CALLED", "Police Called"),
        ("CCTV_REVIEWED", "CCTV Reviewed"),
        ("NO_ACTION", "No Action Required"),
        ("OTHER", "Other"),
    ]

    alert = models.ForeignKey(
        Alert,
        on_delete=models.CASCADE,
        related_name="incident_reports",
    )
    responder = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incident_responses",
    )

    # ── Response details ──────────────────────────────────────────────────────
    action_taken = models.CharField(
        max_length=30,
        choices=ACTION_CHOICES,
        default="CCTV_REVIEWED",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="OPEN",
    )
    description = models.TextField(
        blank=True,
        help_text="Detailed description of the incident and response.",
    )
    notes = models.TextField(
        blank=True,
        help_text="Additional notes or follow-up information.",
    )

    # ── External reference ────────────────────────────────────────────────────
    external_reference = models.CharField(
        max_length=100,
        blank=True,
        help_text="External reference number (e.g. police blotter, barangay report).",
    )

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["alert"]),
            models.Index(fields=["status"]),
            models.Index(fields=["responder"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        responder_name = self.responder.username if self.responder else "Unassigned"
        return f"IR-{self.id:04d} ({self.status}) — {responder_name}"
