# evidence/cleanup.py
# ─────────────────────────────────────────────────────────────────────────────
# Evidence Clip Auto-Cleanup
#
# Deletes evidence clips that have expired or been tagged as false positive:
#   - PENDING clips older than EVIDENCE_RETENTION_HOURS (default 48h)
#   - FALSE_POSITIVE clips (deleted immediately upon tagging, but this
#     catches any that were missed)
#
# Each deletion is audit-logged for compliance.
# ─────────────────────────────────────────────────────────────────────────────

import logging
import os

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def cleanup_expired_clips(dry_run: bool = False) -> dict:
    """
    Delete expired and false-positive evidence clips.

    Args:
        dry_run: If True, log what would be deleted without actually deleting.

    Returns:
        Dict with counts: {expired_deleted, false_positive_deleted, errors, total}
    """
    from .models import EvidenceClip

    now = timezone.now()
    stats = {
        "expired_deleted": 0,
        "false_positive_deleted": 0,
        "errors": 0,
        "total": 0,
        "bytes_freed": 0,
    }

    # ── 1. Expired PENDING clips (past expires_at) ────────────────────────────
    expired_qs = EvidenceClip.objects.filter(
        review_status="PENDING",
        expires_at__isnull=False,
        expires_at__lte=now,
    )

    for clip in expired_qs:
        stats["total"] += 1
        if dry_run:
            logger.info(
                "[DRY RUN] Would delete expired clip %s (created %s, expired %s)",
                clip.clip_id, clip.created_at, clip.expires_at,
            )
            stats["expired_deleted"] += 1
            continue

        try:
            file_size = clip.file_size_bytes or 0
            file_path = clip.file_path

            # Delete file from disk
            if file_path and os.path.exists(file_path):
                os.remove(file_path)
                logger.info("Deleted expired evidence file: %s", file_path)

            # Audit log
            _log_cleanup(clip, reason="EXPIRED")

            # Delete database record
            clip.delete()
            stats["expired_deleted"] += 1
            stats["bytes_freed"] += file_size

        except Exception as e:
            logger.error("Failed to delete expired clip %s: %s", clip.id, e)
            stats["errors"] += 1

    # ── 2. FALSE_POSITIVE clips (should have been deleted on tagging, ─────────
    #        but catch any stragglers)
    fp_qs = EvidenceClip.objects.filter(review_status="FALSE_POSITIVE")

    for clip in fp_qs:
        stats["total"] += 1
        if dry_run:
            logger.info(
                "[DRY RUN] Would delete false-positive clip %s (tagged by %s at %s)",
                clip.clip_id,
                clip.reviewed_by.username if clip.reviewed_by else "unknown",
                clip.reviewed_at,
            )
            stats["false_positive_deleted"] += 1
            continue

        try:
            file_size = clip.file_size_bytes or 0
            file_path = clip.file_path

            # Delete file from disk
            if file_path and os.path.exists(file_path):
                os.remove(file_path)
                logger.info("Deleted false-positive evidence file: %s", file_path)

            # Audit log
            _log_cleanup(clip, reason="FALSE_POSITIVE")

            # Delete database record
            clip.delete()
            stats["false_positive_deleted"] += 1
            stats["bytes_freed"] += file_size

        except Exception as e:
            logger.error("Failed to delete false-positive clip %s: %s", clip.id, e)
            stats["errors"] += 1

    # ── Summary ───────────────────────────────────────────────────────────────
    prefix = "[DRY RUN] " if dry_run else ""
    logger.info(
        "%sEvidence cleanup complete: %d expired, %d false-positive deleted, "
        "%d errors, %.1f MB freed",
        prefix,
        stats["expired_deleted"],
        stats["false_positive_deleted"],
        stats["errors"],
        stats["bytes_freed"] / (1024 * 1024) if stats["bytes_freed"] else 0,
    )

    return stats


def _log_cleanup(clip, reason: str):
    """Audit-log an evidence deletion."""
    try:
        from logging_info.utils import log_audit
        log_audit(
            action="EVIDENCE_AUTO_DELETED",
            message=(
                f"Evidence clip {clip.clip_id} auto-deleted. "
                f"Reason: {reason}. "
                f"Alert #{clip.alert_id}, Camera '{clip.alert.camera.name}'."
            ),
            category="AUDIT",
            level="INFO",
            source="Evidence Cleanup",
            extra={
                "evidence_id": clip.id,
                "alert_id": clip.alert_id,
                "reason": reason,
                "file_path": clip.file_path,
            },
        )
    except Exception:
        pass
