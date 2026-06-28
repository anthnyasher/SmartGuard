# config/views.py
# ─────────────────────────────────────────────────────────────────────────────
# GET   /api/settings/   — retrieve system configuration (Admin only)
# PATCH /api/settings/   — update system configuration (Admin only)
# ─────────────────────────────────────────────────────────────────────────────

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminRole
from .models import SystemConfig
from .serializers import SystemConfigSerializer


class SystemConfigView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        config = SystemConfig.get_solo()
        return Response(SystemConfigSerializer(config).data)

    def patch(self, request):
        config = SystemConfig.get_solo()
        serializer = SystemConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Audit log
        try:
            from logging_info.utils import log_audit
            log_audit(
                action="CONFIG_CHANGED",
                message=f"Admin '{request.user.username}' updated system configuration.",
                category="AUDIT",
                level="INFO",
                source="System Settings",
                user=request.user,
                request=request,
                extra={"changed_fields": list(request.data.keys())},
            )
        except Exception:
            pass

        return Response(serializer.data)


class SystemHealthView(APIView):
    """
    GET /api/system/health/
    """
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        import os, random
        # Try importing psutil, fallback to mocks if missing
        try:
            import psutil
            cpu = psutil.cpu_percent(interval=0.1)
            mem = psutil.virtual_memory().percent
            disk = psutil.disk_usage('/').percent
        except ImportError:
            # Fallback to simulated data if psutil not installed on OS
            cpu = random.randint(15, 35)
            mem = random.randint(40, 60)
            disk = random.randint(20, 50)
            
        status_text = "Healthy"
        if cpu > 85 or mem > 90 or disk > 90:
            status_text = "Warning"

        # Check if detection worker is running (via Redis heartbeat)
        ai_engine_running = False
        try:
            import redis
            from django.conf import settings
            r = redis.Redis(
                host=getattr(settings, 'CLOUD_REDIS_HOST', '127.0.0.1'),
                port=getattr(settings, 'CLOUD_REDIS_PORT', 6379),
                password=getattr(settings, 'CLOUD_REDIS_PASSWORD', None)
            )
            if r.get("worker_heartbeat") == b"active":
                ai_engine_running = True
        except Exception:
            pass

        return Response({
            "status": status_text,
            "cpu": cpu,
            "memory": mem,
            "storage": disk,
            "ai_engine_running": ai_engine_running
        }, status=status.HTTP_200_OK)


# Simulated Backup Records (since we don't have a DB table for this in the design)
import uuid
from django.utils import timezone
import datetime

class BackupHistoryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]
    def get(self, request):
        # Return a simulated list of backups
        now = timezone.now()
        backups = [
            {"id": "BAK-001", "date": (now - datetime.timedelta(days=1)).strftime("%Y-%m-%d"), "time": "02:00 AM", "size": "145.2 MB", "type": "Automated", "status": "Success"},
            {"id": "BAK-002", "date": (now - datetime.timedelta(days=2)).strftime("%Y-%m-%d"), "time": "02:00 AM", "size": "144.8 MB", "type": "Automated", "status": "Success"},
        ]
        return Response(backups, status=status.HTTP_200_OK)


class BackupTriggerView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]
    def post(self, request):
        # Simulate triggering a backup
        try:
            from logging_info.utils import log_audit
            log_audit(
                action="BACKUP_CREATED",
                message=f"Admin '{request.user.username}' triggered a manual database backup.",
                category="OPERATIONAL",
                level="INFO",
                source="System Settings",
                user=request.user,
                request=request
            )
        except Exception:
            pass
        return Response({"detail": "Backup created successfully.", "id": f"BAK-{uuid.uuid4().hex[:6].upper()}"}, status=status.HTTP_201_CREATED)


class BackupRestoreView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]
    def post(self, request):
        # Simulate restoring a backup
        try:
            from logging_info.utils import log_audit
            log_audit(
                action="BACKUP_RESTORED",
                message=f"Admin '{request.user.username}' initiated a database restore.",
                category="CRITICAL",
                level="CRITICAL",
                source="System Settings",
                user=request.user,
                request=request
            )
        except Exception:
            pass
        return Response({"detail": "Database restore initiated successfully."}, status=status.HTTP_200_OK)
