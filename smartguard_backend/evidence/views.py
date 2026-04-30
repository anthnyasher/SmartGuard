# evidence/views.py
# ─────────────────────────────────────────────────────────────────────────────
# FRS Module 5: Evidence Management API
#
# GET    /api/evidence/              — list all evidence clips
# GET    /api/evidence/<id>/         — retrieve single clip detail
# GET    /api/evidence/<id>/download/ — download the clip file
# POST   /api/evidence/<id>/verify/  — re-verify SHA-256 integrity
# ─────────────────────────────────────────────────────────────────────────────

import os
import logging

from django.http import FileResponse, Http404
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from .models import EvidenceClip
from .serializers import EvidenceClipSerializer

logger = logging.getLogger(__name__)


class EvidenceListView(generics.ListAPIView):
    """
    GET /api/evidence/
    Returns all evidence clips. Supports filtering by severity, alert_status.
    Staff see SHOPLIFTING-category clips only.
    """
    serializer_class = EvidenceClipSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = EvidenceClip.objects.select_related(
            "alert", "alert__camera"
        ).filter(status="READY")

        role = getattr(self.request.user, "role", None)
        if role == "STAFF":
            qs = qs.filter(alert__alert_category="SHOPLIFTING")

        # Filters
        severity = self.request.query_params.get("severity")
        if severity:
            qs = qs.filter(alert__severity=severity.upper())

        alert_status = self.request.query_params.get("alert_status")
        if alert_status and alert_status.upper() != "ALL":
            qs = qs.filter(alert__status=alert_status.upper())

        search = self.request.query_params.get("search", "").strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(alert__camera__name__icontains=search)
                | Q(alert__behavior_type__icontains=search)
            )

        return qs


class EvidenceDetailView(generics.RetrieveAPIView):
    """
    GET /api/evidence/<id>/
    """
    queryset = EvidenceClip.objects.select_related("alert", "alert__camera")
    serializer_class = EvidenceClipSerializer
    permission_classes = [IsAuthenticated]


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminRole])
def evidence_download(request, pk):
    """
    GET /api/evidence/<id>/download/
    Admin-only file download.
    """
    try:
        clip = EvidenceClip.objects.get(pk=pk)
    except EvidenceClip.DoesNotExist:
        raise Http404

    file_path = clip.file_path
    if not file_path or not os.path.exists(file_path):
        return Response(
            {"detail": "Evidence file not found on disk."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Log the download
    try:
        from logging_info.utils import log_audit
        log_audit(
            action="EVIDENCE_DOWNLOAD",
            message=f"Admin '{request.user.username}' downloaded evidence clip {clip.clip_id}.",
            category="AUDIT",
            level="INFO",
            source="Evidence Vault",
            user=request.user,
            request=request,
            extra={"evidence_id": clip.id, "clip_id": clip.clip_id},
        )
    except Exception:
        pass

    filename = os.path.basename(file_path)
    response = FileResponse(
        open(file_path, "rb"),
        content_type="video/mp4",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def evidence_verify(request, pk):
    """
    POST /api/evidence/<id>/verify/
    Re-computes SHA-256 hash and compares to stored value.
    """
    try:
        clip = EvidenceClip.objects.get(pk=pk)
    except EvidenceClip.DoesNotExist:
        raise Http404

    result = clip.verify_integrity()

    # Log the access
    try:
        from logging_info.utils import log_audit
        log_audit(
            action="EVIDENCE_ACCESSED",
            message=f"User '{request.user.username}' verified integrity of {clip.clip_id}: {result}.",
            category="AUDIT",
            level="INFO",
            source="Evidence Vault",
            user=request.user,
            request=request,
            extra={"evidence_id": clip.id, "integrity": result},
        )
    except Exception:
        pass

    return Response({
        "id": clip.id,
        "clip_id": clip.clip_id,
        "integrity_status": result,
        "sha256_hash": clip.sha256_hash,
        "last_verified_at": clip.last_verified_at,
    })
