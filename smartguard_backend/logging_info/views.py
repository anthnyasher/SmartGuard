# logging_info/views.py
# ─────────────────────────────────────────────────────────────────────────────
# GET /api/logs/
#   Admin only. Returns paginated AuditLog entries.
#   Query params:
#     ?category=SECURITY|OPERATIONAL|USER_ACTIVITY|DETECTION|AUDIT
#     ?level=CRITICAL|HIGH|MEDIUM|WARNING|INFO
#     ?action=LOGIN_FAILED|...
#     ?search=<text>    (searches message, username, ip_address, device_info)
#     ?page=<int>       (default 1)
#     ?page_size=<int>  (default 50, max 200)
# ─────────────────────────────────────────────────────────────────────────────

from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminRole
from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogListView(APIView):
    """
    GET /api/logs/  — Admin only.
    """
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        qs = AuditLog.objects.all()

        # ── Filters ────────────────────────────────────────────────────────────
        category = request.query_params.get("category", "").strip().upper()
        if category and category != "ALL":
            qs = qs.filter(category=category)

        level = request.query_params.get("level", "").strip().upper()
        if level and level != "ALL":
            qs = qs.filter(level=level)

        action = request.query_params.get("action", "").strip().upper()
        if action:
            qs = qs.filter(action=action)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(message__icontains=search)
                | Q(username__icontains=search)
                | Q(ip_address__icontains=search)
                | Q(device_info__icontains=search)
                | Q(source__icontains=search)
            )

        # ── Pagination ─────────────────────────────────────────────────────────
        try:
            page      = max(1, int(request.query_params.get("page", 1)))
            page_size = min(200, max(10, int(request.query_params.get("page_size", 50))))
        except (ValueError, TypeError):
            page, page_size = 1, 50

        total  = qs.count()
        offset = (page - 1) * page_size
        items  = qs[offset : offset + page_size]

        data = AuditLogSerializer(items, many=True).data

        # ── Summary counts for the sidebar KPIs ────────────────────────────────
        summary = {
            "total":       total,
            "security":    AuditLog.objects.filter(category="SECURITY").count(),
            "user":        AuditLog.objects.filter(category="USER_ACTIVITY").count(),
            "detection":   AuditLog.objects.filter(category="DETECTION").count(),
            "operational": AuditLog.objects.filter(category="OPERATIONAL").count(),
            "audit":       AuditLog.objects.filter(category="AUDIT").count(),
            "critical":    AuditLog.objects.filter(level="CRITICAL").count(),
            "high":        AuditLog.objects.filter(level="HIGH").count(),
        }

        return Response({
            "count":     total,
            "page":      page,
            "page_size": page_size,
            "pages":     max(1, (total + page_size - 1) // page_size),
            "summary":   summary,
            "results":   data,
        })