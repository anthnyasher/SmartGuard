# evidence/views.py
# ─────────────────────────────────────────────────────────────────────────────
# FRS Module 5: Evidence Management API
#
# GET    /api/evidence/              — list all evidence clips
# GET    /api/evidence/<id>/         — retrieve single clip detail
# GET    /api/evidence/<id>/download/ — download the clip file (decrypted)
# GET    /api/evidence/<id>/stream/  — stream clip for in-browser playback
# POST   /api/evidence/<id>/verify/  — re-verify SHA-256 integrity
# POST   /api/evidence/<id>/review/  — mark as CONFIRMED or FALSE_POSITIVE
# GET    /api/evidence/stats/        — clip counts and size statistics
# ─────────────────────────────────────────────────────────────────────────────

import io
import os
import logging

from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminRole, IsAdminOrOpsManager
from .models import EvidenceClip
from .serializers import EvidenceClipSerializer

logger = logging.getLogger(__name__)


class EvidenceListView(generics.ListAPIView):
    """
    GET /api/evidence/
    Returns all evidence clips. Supports filtering by severity, alert_status,
    and review_status. Staff see SHOPLIFTING-category clips only.
    """
    serializer_class = EvidenceClipSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = EvidenceClip.objects.select_related(
            "alert", "alert__camera", "reviewed_by"
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

        review_status = self.request.query_params.get("review_status")
        if review_status and review_status.upper() != "ALL":
            qs = qs.filter(review_status=review_status.upper())

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
    queryset = EvidenceClip.objects.select_related(
        "alert", "alert__camera", "reviewed_by"
    )
    serializer_class = EvidenceClipSerializer
    permission_classes = [IsAuthenticated]


from accounts.authentication import QueryParameterTokenAuthentication
from rest_framework.decorators import authentication_classes

@api_view(["GET"])
@authentication_classes([QueryParameterTokenAuthentication])
@permission_classes([IsAuthenticated, IsAdminOrOpsManager])
def evidence_download(request, pk):
    """
    GET /api/evidence/<id>/download/
    Admin-only file download. Decrypts AES-256-GCM encrypted clips on-the-fly.
    """
    try:
        clip = EvidenceClip.objects.get(pk=pk)
    except EvidenceClip.DoesNotExist:
        raise Http404

    file_path = clip.get_absolute_file_path()

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

    # ── Decrypt if encrypted ──────────────────────────────────────────────────
    if clip.is_encrypted and clip.encryption_iv and clip.encryption_tag:
        try:
            from .encryption import decrypt_file
            decrypted_bytes = decrypt_file(
                file_path, clip.encryption_iv, clip.encryption_tag,
            )
            # Serve from memory buffer
            buffer = io.BytesIO(decrypted_bytes)
            # Generate a clean filename without .enc extension
            base_name = os.path.basename(file_path)
            if base_name.endswith(".enc"):
                base_name = base_name[:-4]

            response = FileResponse(
                buffer,
                content_type="video/mp4",
            )
            response["Content-Disposition"] = f'attachment; filename="{base_name}"'
            return response

        except Exception as e:
            logger.error("Failed to decrypt evidence clip %s: %s", clip.id, e)
            return Response(
                {"detail": "Failed to decrypt evidence file. The file may have been tampered with."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ── Unencrypted fallback (legacy clips) ───────────────────────────────────
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


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminOrOpsManager])
def evidence_review(request, pk):
    """
    POST /api/evidence/<id>/review/
    Admin or OPS Manager marks a clip as CONFIRMED or FALSE_POSITIVE.

    Body: { "review_status": "CONFIRMED" | "FALSE_POSITIVE" }

    - CONFIRMED: removes the expiry (clip is retained indefinitely)
    - FALSE_POSITIVE: deletes the file from disk immediately
    """
    try:
        clip = EvidenceClip.objects.select_related("alert", "alert__camera").get(pk=pk)
    except EvidenceClip.DoesNotExist:
        raise Http404

    new_status = request.data.get("review_status", "").upper()
    if new_status not in ("CONFIRMED", "FALSE_POSITIVE"):
        return Response(
            {"detail": "review_status must be 'CONFIRMED' or 'FALSE_POSITIVE'."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    now = timezone.now()
    clip.review_status = new_status
    clip.reviewed_by = request.user
    clip.reviewed_at = now

    if new_status == "CONFIRMED":
        # Retain indefinitely — clear the expiry
        clip.expires_at = None
        clip.save(update_fields=[
            "review_status", "reviewed_by", "reviewed_at", "expires_at",
        ])
        action_msg = f"confirmed as a positive incident (retained indefinitely)"

    elif new_status == "FALSE_POSITIVE":
        # Delete the file from disk immediately
        clip.delete_file_from_disk()
        clip.save(update_fields=[
            "review_status", "reviewed_by", "reviewed_at",
        ])
        action_msg = f"tagged as false positive (file deleted)"

        # Also delete the database record after a brief save for audit trail
        # We keep the record briefly so the audit log captures it
        logger.info(
            "Evidence clip %s marked FALSE_POSITIVE by %s — file deleted.",
            clip.clip_id, request.user.username,
        )

    # Audit log
    try:
        from logging_info.utils import log_audit
        log_audit(
            action="EVIDENCE_REVIEWED",
            message=(
                f"Evidence clip {clip.clip_id} {action_msg} "
                f"by '{request.user.username}'."
            ),
            category="AUDIT",
            level="INFO",
            source="Evidence Vault",
            user=request.user,
            request=request,
            extra={
                "evidence_id": clip.id,
                "review_status": new_status,
                "alert_id": clip.alert_id,
            },
        )
    except Exception:
        pass

    return Response({
        "id": clip.id,
        "clip_id": clip.clip_id,
        "review_status": clip.review_status,
        "reviewed_by": request.user.username,
        "reviewed_at": clip.reviewed_at,
        "expires_at": clip.expires_at,
        "message": f"Clip {action_msg}.",
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def evidence_stats(request):
    """
    GET /api/evidence/stats/
    Returns summary statistics about evidence clips.
    """
    from django.db.models import Sum, Count, Q

    now = timezone.now()
    qs = EvidenceClip.objects.filter(status="READY")

    stats = qs.aggregate(
        total_clips=Count("id"),
        total_size=Sum("file_size_bytes"),
        pending_count=Count("id", filter=Q(review_status="PENDING")),
        confirmed_count=Count("id", filter=Q(review_status="CONFIRMED")),
        false_positive_count=Count("id", filter=Q(review_status="FALSE_POSITIVE")),
        encrypted_count=Count("id", filter=Q(is_encrypted=True)),
        verified_count=Count("id", filter=Q(integrity_status="VERIFIED")),
    )

    # Count clips expiring within the next 6 hours
    from datetime import timedelta
    expiring_soon = qs.filter(
        expires_at__isnull=False,
        expires_at__lte=now + timedelta(hours=6),
        expires_at__gt=now,
        review_status="PENDING",
    ).count()

    return Response({
        "total_clips": stats["total_clips"] or 0,
        "total_size_bytes": stats["total_size"] or 0,
        "total_size_mb": round((stats["total_size"] or 0) / (1024 * 1024), 1),
        "pending_review": stats["pending_count"] or 0,
        "confirmed": stats["confirmed_count"] or 0,
        "false_positive": stats["false_positive_count"] or 0,
        "encrypted": stats["encrypted_count"] or 0,
        "verified": stats["verified_count"] or 0,
        "expiring_soon": expiring_soon,
    })


@api_view(["GET"])
@authentication_classes([QueryParameterTokenAuthentication])
@permission_classes([IsAuthenticated])
def evidence_stream(request, pk):
    """
    GET /api/evidence/<id>/stream/
    Stream the decrypted evidence clip for in-browser <video> playback.
    Returns video/mp4 content inline (not as attachment).
    """
    try:
        clip = EvidenceClip.objects.get(pk=pk)
    except EvidenceClip.DoesNotExist:
        raise Http404

    file_path = clip.get_absolute_file_path()

    if not file_path or not os.path.exists(file_path):
        return Response(
            {"detail": "Evidence file not found on disk."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Log the access
    try:
        from logging_info.utils import log_audit
        log_audit(
            action="EVIDENCE_ACCESSED",
            message=f"User '{request.user.username}' viewed evidence clip {clip.clip_id}.",
            category="AUDIT",
            level="INFO",
            source="Evidence Vault",
            user=request.user,
            request=request,
            extra={"evidence_id": clip.id, "clip_id": clip.clip_id},
        )
    except Exception:
        pass

    # Decrypt if encrypted
    if clip.is_encrypted and clip.encryption_iv and clip.encryption_tag:
        try:
            from .encryption import decrypt_file
            import tempfile
            decrypted_bytes = decrypt_file(
                file_path, clip.encryption_iv, clip.encryption_tag,
            )
            
            # Write to a temp file so Django FileResponse can handle HTTP Range requests properly
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
            temp_file.write(decrypted_bytes)
            temp_file.close()
            
            file_obj = open(temp_file.name, "rb")
            original_close = file_obj.close
            
            def close_and_remove():
                original_close()
                try:
                    os.remove(temp_file.name)
                except Exception:
                    pass
                    
            file_obj.close = close_and_remove
            
            response = FileResponse(
                file_obj,
                content_type="video/mp4",
            )
            response["Content-Disposition"] = 'inline'
            return response
        except Exception as e:
            logger.error("Failed to decrypt evidence clip %s: %s", clip.id, e)
            return Response(
                {"detail": "Failed to decrypt evidence file."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # Unencrypted fallback
    response = FileResponse(
        open(file_path, "rb"),
        content_type="video/mp4",
    )
    response["Content-Disposition"] = 'inline'
    return response
