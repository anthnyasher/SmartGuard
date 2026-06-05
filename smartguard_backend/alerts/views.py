from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

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


class TriggerAlarmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        from .models import Alert
        try:
            alert = Alert.objects.get(pk=pk)
            # Update status
            alert.status = "ESCALATED"
            alert.alarm_triggered = True
            alert.save()

            # Log audit
            from logging_info.models import AuditLog
            AuditLog.objects.create(
                user=request.user,
                action="TRIGGER_ALARM",
                target_type="Alert",
                target_id=str(alert.id),
                severity="CRITICAL",
                details=f"User triggered store alarm for Alert {alert.id}"
            )
            return Response({"message": "Alarm triggered successfully.", "status": "ESCALATED"})
        except Alert.DoesNotExist:
            return Response({"error": "Alert not found."}, status=status.HTTP_404_NOT_FOUND)

class WeeklyReportView(APIView):
    """
    GET /api/reports/weekly/
    Aggregates weekly statistics for Alerts, Evidence, and Incidents.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.utils import timezone
        from datetime import timedelta
        from .models import Alert
        from evidence.models import EvidenceClip

        now = timezone.now()
        one_week_ago = now - timedelta(days=7)
        two_weeks_ago = now - timedelta(days=14)

        # Alerts (this week vs last week)
        alerts_this_week = Alert.objects.filter(created_at__gte=one_week_ago).count()
        alerts_last_week = Alert.objects.filter(created_at__gte=two_weeks_ago, created_at__lt=one_week_ago).count()

        # Evidence (this week vs last week)
        evidence_this_week = EvidenceClip.objects.filter(created_at__gte=one_week_ago).count()
        evidence_last_week = EvidenceClip.objects.filter(created_at__gte=two_weeks_ago, created_at__lt=one_week_ago).count()

        # Alert categories breakdown (this week)
        from django.db.models import Count
        categories = Alert.objects.filter(created_at__gte=one_week_ago).values('alert_category').annotate(count=Count('id'))
        category_breakdown = {c['alert_category']: c['count'] for c in categories}

        # Status breakdown (this week)
        statuses = Alert.objects.filter(created_at__gte=one_week_ago).values('status').annotate(count=Count('id'))
        status_breakdown = {s['status']: s['count'] for s in statuses}

        return Response({
            "date_range": {
                "start": one_week_ago.isoformat(),
                "end": now.isoformat()
            },
            "alerts": {
                "this_week": alerts_this_week,
                "last_week": alerts_last_week,
                "category_breakdown": category_breakdown,
                "status_breakdown": status_breakdown
            },
            "evidence": {
                "this_week": evidence_this_week,
                "last_week": evidence_last_week
            }
        })

class ManualAlertCreateView(APIView):
    """
    POST /api/alerts/manual-override/
    Allows STAFF, OPS, ADMIN to manually trigger a detection on a camera.
    Publishes a Redis message so the detection_worker can clip the evidence.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        role = getattr(request.user, "role", None)
        if role not in ["STAFF", "OPERATIONS_MANAGER", "ADMIN"]:
            return Response({"error": "Insufficient permissions"}, status=status.HTTP_403_FORBIDDEN)
        
        camera_id = request.data.get("camera_id")
        behavior = request.data.get("behavior_type", "Suspicious - Manual")
        notes = request.data.get("notes", "")

        if not camera_id:
            return Response({"error": "camera_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Publish to Redis
        import redis
        import json
        import os
        
        redis_host = os.environ.get("REDIS_HOST", "127.0.0.1")
        redis_pass = os.environ.get("REDIS_PASSWORD", None)
        r = redis.Redis(host=redis_host, port=6379, password=redis_pass)
        
        message = {
            "camera_id": camera_id,
            "behavior_type": behavior,
            "notes": notes,
            "user": request.user.email
        }
        r.publish("manual_override", json.dumps(message))

        # Log audit
        from logging_info.models import AuditLog
        AuditLog.objects.create(
            user=request.user,
            action="ALERT_CREATED",
            category="DETECTION",
            level="HIGH",
            message=f"User manually triggered '{behavior}' alert on Camera {camera_id}. Notes: {notes}",
            source="Manual Override",
            extra={"camera_id": camera_id, "behavior_type": behavior}
        )

        return Response({"message": "Manual alert triggered successfully. Evidence clipping initiated."}, status=status.HTTP_200_OK)