from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Alert
from .serializers import AlertSerializer, DetectionAlertInputSerializer
from .permissions import AlertPermission


class DetectionAlertCreateView(APIView):
    """
    POST /api/alerts/create/
    Called by detection_worker.py to persist a new alert.
    No auth required — worker runs on the same machine.
    """
    permission_classes = []

    def post(self, request, *args, **kwargs):
        serializer = DetectionAlertInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        alert = serializer.save()
        return Response(AlertSerializer(alert).data, status=status.HTTP_201_CREATED)


class AlertListView(generics.ListAPIView):
    """
    GET /api/alerts/
    Staff / Ops see SHOPLIFTING only; Admin sees everything.
    Supports ?severity=HIGH and ?status=NEW query params.
    """
    queryset = Alert.objects.select_related(
        "camera", "acknowledged_by", "reviewed_by", "assigned_to"
    ).order_by("-created_at")
    serializer_class   = AlertSerializer
    permission_classes = [AlertPermission]

    def get_queryset(self):
        qs   = super().get_queryset()
        role = getattr(self.request.user, "role", None)

        if role in ("STAFF", "OPERATIONS_MANAGER"):
            qs = qs.filter(alert_category="SHOPLIFTING")

        severity = self.request.query_params.get("severity")
        if severity:
            qs = qs.filter(severity=severity.upper())

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter.upper())

        return qs


class AlertDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/alerts/<pk>/  — fetch single alert
    PATCH /api/alerts/<pk>/  — update status, notes, acknowledgement
    """
    queryset = Alert.objects.select_related(
        "camera", "acknowledged_by", "reviewed_by", "assigned_to"
    )
    serializer_class   = AlertSerializer
    permission_classes = [AlertPermission]

    def get_serializer_context(self):
        # Ensures request is passed into AlertSerializer.update()
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    def get_queryset(self):
        qs   = super().get_queryset()
        role = getattr(self.request.user, "role", None)

        if role in ("STAFF", "OPERATIONS_MANAGER"):
            qs = qs.filter(alert_category="SHOPLIFTING")

        return qs