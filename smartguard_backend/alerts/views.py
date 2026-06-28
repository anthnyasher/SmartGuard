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
        import os
        secret = request.headers.get("X-Sync-Secret")
        expected_secret = os.environ.get("MEDIA_SYNC_SECRET")
        if not expected_secret or secret != expected_secret:
            return Response({"error": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN)

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
        "camera", "reviewed_by", "assigned_to"
    ).order_by("-created_at")
    serializer_class   = AlertSerializer
    permission_classes = [AlertPermission]

    def get_queryset(self):
        qs   = super().get_queryset()
        role = getattr(self.request.user, "role", None)

        if role in ("STAFF", "OPS_MANAGER"):
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
    GET    /api/alerts/<pk>/  — fetch single alert
    PATCH  /api/alerts/<pk>/  — update status, notes
    DELETE /api/alerts/<pk>/  — delete alert + evidence clips + files
    """
    queryset = Alert.objects.select_related(
        "camera", "reviewed_by", "assigned_to"
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

        if role in ("STAFF", "OPS_MANAGER"):
            qs = qs.filter(alert_category="SHOPLIFTING")

        return qs

    def perform_destroy(self, instance):
        """Delete evidence clip files from disk before CASCADE removes DB rows."""
        import os
        for clip in instance.evidence_clips.all():
            # Delete the clip file
            if clip.file and hasattr(clip.file, 'path'):
                try:
                    if os.path.exists(clip.file.path):
                        os.remove(clip.file.path)
                except Exception:
                    pass
            # Also try file_path field
            if clip.file_path:
                try:
                    if os.path.exists(clip.file_path):
                        os.remove(clip.file_path)
                except Exception:
                    pass
        # Delete snapshot if present
        if instance.snapshot and hasattr(instance.snapshot, 'path'):
            try:
                if os.path.exists(instance.snapshot.path):
                    os.remove(instance.snapshot.path)
            except Exception:
                pass
        instance.delete()


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
        if role in ("STAFF", "OPS_MANAGER"):
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

        # Behavior breakdown (this week)
        behaviors = Alert.objects.filter(created_at__gte=one_week_ago).values('behavior_type').annotate(count=Count('id'))
        behavior_breakdown = {b['behavior_type']: b['count'] for b in behaviors}

        # Top cameras (this week)
        top_cameras = Alert.objects.filter(created_at__gte=one_week_ago).values('camera__name').annotate(count=Count('id')).order_by('-count')[:5]
        top_cameras_data = [{"camera": c['camera__name'], "count": c['count']} for c in top_cameras]

        # Status breakdown (this week)
        statuses = Alert.objects.filter(created_at__gte=one_week_ago).values('status').annotate(count=Count('id'))
        status_breakdown = {s['status']: s['count'] for s in statuses}

        # Incidents (this week vs last week)
        from ir.models import IncidentReport
        incidents_this_week = IncidentReport.objects.filter(created_at__gte=one_week_ago).count()
        incidents_last_week = IncidentReport.objects.filter(created_at__gte=two_weeks_ago, created_at__lt=one_week_ago).count()

        return Response({
            "date_range": {
                "start": one_week_ago.isoformat(),
                "end": now.isoformat()
            },
            "alerts": {
                "this_week": alerts_this_week,
                "last_week": alerts_last_week,
                "category_breakdown": category_breakdown,
                "behavior_breakdown": behavior_breakdown,
                "top_cameras": top_cameras_data,
                "status_breakdown": status_breakdown
            },
            "evidence": {
                "this_week": evidence_this_week,
                "last_week": evidence_last_week
            },
            "incidents": {
                "this_week": incidents_this_week,
                "last_week": incidents_last_week
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
        if role not in ["STAFF", "OPS_MANAGER", "ADMIN"]:
            return Response({"error": "Insufficient permissions"}, status=status.HTTP_403_FORBIDDEN)
        
        camera_id = request.data.get("camera_id")
        behavior = request.data.get("behavior_type", "Suspicious - Manual")
        notes = request.data.get("notes", "")
        duration = request.data.get("duration", 10)

        if not camera_id:
            return Response({"error": "camera_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Publish to Redis
        import redis
        import json
        import os
        
        redis_host = os.environ.get("REDIS_HOST", "127.0.0.1")
        redis_port = int(os.environ.get("REDIS_PORT", "6379"))
        redis_pass = os.environ.get("REDIS_PASSWORD", None)
        
        try:
            r = redis.Redis(host=redis_host, port=redis_port, password=redis_pass, db=0)
            payload = {
                "camera_id": camera_id,
                "behavior_type": behavior,
                "confidence": 1.0,
                "severity": "CRITICAL",  # Manual alerts default to highest severity
                "notes": notes,
                "duration": duration,
                "user": request.user.email
            }
            r.publish("manual_override", json.dumps(payload))
        except Exception as e:
            return Response({"error": f"Failed to publish to Redis: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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

class UploadMediaView(APIView):
    """
    POST /api/alerts/upload-media/
    Accepts raw file bytes from the local worker to sync local media to the AWS server.
    """
    permission_classes = []

    def post(self, request):
        import os
        secret = request.headers.get("X-Sync-Secret")
        expected_secret = os.environ.get("MEDIA_SYNC_SECRET")
        if not expected_secret or secret != expected_secret:
            return Response({"error": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN)
        
        rel_path = request.headers.get("X-Relative-Path")
        if not rel_path:
            return Response({"error": "Missing X-Relative-Path header"}, status=status.HTTP_400_BAD_REQUEST)
            
        from django.conf import settings
        full_path = os.path.join(settings.MEDIA_ROOT, rel_path)
        
        # Security check
        if not os.path.abspath(full_path).startswith(os.path.abspath(settings.MEDIA_ROOT)):
            return Response({"error": "Invalid path"}, status=status.HTTP_403_FORBIDDEN)
            
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'wb') as f:
            f.write(request.body)
            
        return Response({"status": "ok", "path": rel_path}, status=status.HTTP_200_OK)
class ManualAlertTriggerView(APIView):
    """
    POST /api/alerts/manual/
    Allows STAFF to instantly trigger a critical manual alert for a specific camera.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ["STAFF", "OPS_MANAGER", "ADMIN"]:
            return Response({"error": "Unauthorized"}, status=403)
            
        camera_id = request.data.get("camera_id")
        if not camera_id:
            return Response({"error": "camera_id is required"}, status=400)
            
        from cameras.models import Camera
        try:
            camera = Camera.objects.get(pk=camera_id)
        except Camera.DoesNotExist:
            return Response({"error": "Camera not found"}, status=404)
            
        # Create a CRITICAL alert instantly
        alert = Alert.objects.create(
            camera=camera,
            behavior_type="MANUAL_TRIGGER",
            confidence=1.0,
            severity="CRITICAL",
            alert_category="SHOPLIFTING",
            status="NEW",
            notes=f"Manually triggered by {request.user.username}"
        )
        
        return Response(AlertSerializer(alert).data, status=status.HTTP_201_CREATED)

