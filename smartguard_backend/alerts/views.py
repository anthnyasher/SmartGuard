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


class AlertDetailView(generics.RetrieveUpdateDestroyAPIView):
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


class DashboardAnalyticsView(APIView):
    """
    GET /api/alerts/analytics/
    Returns real statistics for the AI Detection Analytics dashboard.
    """
    permission_classes = [AlertPermission]

    def get(self, request):
        from django.utils import timezone
        from datetime import timedelta
        from django.db.models import Count
        
        now = timezone.now()
        last_24h = now - timedelta(hours=24)
        
        # Base queryset matching user's permissions
        role = getattr(request.user, "role", None)
        qs = Alert.objects.filter(created_at__gte=last_24h)
        if role in ("STAFF", "OPERATIONS_MANAGER"):
            qs = qs.filter(alert_category="SHOPLIFTING")

        # 1. Detections Over Time (Last 24 Hours) - bucketed every 2 hours (12 points)
        points = [0] * 12
        alerts = list(qs.values('created_at'))
        for a in alerts:
            hours_ago = (now - a['created_at']).total_seconds() / 3600
            bucket_idx = 11 - int(hours_ago / 2) # 0 to 11
            if 0 <= bucket_idx <= 11:
                points[bucket_idx] += 1

        # 2. Top Cameras (Most Active)
        top_cams = (
            qs.values('camera__name')
            .annotate(count=Count('id'))
            .order_by('-count')[:3]
        )
        
        top_cameras_data = [
            {"name": c['camera__name'] or f"Camera {c.get('camera__id', 'Unknown')}", "count": c['count']}
            for c in top_cams
        ]

        return Response({
            "points": points,
            "topCameras": top_cameras_data,
        })