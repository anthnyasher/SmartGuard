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
