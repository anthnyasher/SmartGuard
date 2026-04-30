# ir/views.py
# ─────────────────────────────────────────────────────────────────────────────
# FRS Module 7: Incident Response API
#
# GET    /api/incidents/           — list all incident reports
# POST   /api/incidents/           — create a new incident report
# GET    /api/incidents/<id>/      — retrieve single report
# PATCH  /api/incidents/<id>/      — update report (status, notes, etc.)
# ─────────────────────────────────────────────────────────────────────────────

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import IncidentReport
from .serializers import IncidentReportSerializer, IncidentReportCreateSerializer


class IncidentReportListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/incidents/  — list (filtered by role: Staff see own, Admin sees all)
    POST /api/incidents/  — create new incident report
    """
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = IncidentReport.objects.select_related(
            "alert", "alert__camera", "responder"
        ).all()

        user = self.request.user
        if user.role == "STAFF":
            qs = qs.filter(responder=user)

        # Filters
        status_filter = self.request.query_params.get("status")
        if status_filter and status_filter.upper() != "ALL":
            qs = qs.filter(status=status_filter.upper())

        alert_id = self.request.query_params.get("alert_id")
        if alert_id:
            qs = qs.filter(alert_id=alert_id)

        return qs

    def get_serializer_class(self):
        if self.request.method == "POST":
            return IncidentReportCreateSerializer
        return IncidentReportSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ir = serializer.save()

        # Audit log
        try:
            from logging_info.utils import log_audit
            log_audit(
                action="ALERT_REVIEWED",
                message=(
                    f"User '{request.user.username}' created incident report "
                    f"IR-{ir.id:04d} for alert #{ir.alert_id}."
                ),
                category="DETECTION",
                level="INFO",
                source="Incident Response",
                user=request.user,
                request=request,
                extra={"ir_id": ir.id, "alert_id": ir.alert_id},
            )
        except Exception:
            pass

        return Response(
            IncidentReportSerializer(ir).data,
            status=status.HTTP_201_CREATED,
        )


class IncidentReportDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/incidents/<id>/  — detail
    PATCH /api/incidents/<id>/  — update status, notes, etc.
    """
    queryset = IncidentReport.objects.select_related(
        "alert", "alert__camera", "responder"
    )
    serializer_class = IncidentReportSerializer
    permission_classes = [IsAuthenticated]

    def perform_update(self, serializer):
        instance = serializer.save()

        # Auto-set resolved_at when status changes to RESOLVED
        if instance.status == "RESOLVED" and not instance.resolved_at:
            instance.resolved_at = timezone.now()
            instance.save(update_fields=["resolved_at"])

        # Also update the parent alert status
        if instance.status == "RESOLVED":
            instance.alert.status = "CLOSED"
            instance.alert.reviewed_by = self.request.user
            instance.alert.reviewed_at = timezone.now()
            instance.alert.save(update_fields=["status", "reviewed_by", "reviewed_at"])
        elif instance.status == "ESCALATED":
            instance.alert.status = "ESCALATED"
            instance.alert.save(update_fields=["status"])
        elif instance.status == "FALSE_ALARM":
            instance.alert.status = "FALSE_POSITIVE"
            instance.alert.save(update_fields=["status"])
