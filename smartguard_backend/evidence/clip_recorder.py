# evidence/clip_recorder.py
# ─────────────────────────────────────────────────────────────────────────────
# Evidence Clip Recorder
#
# Captures a 10-second video clip from the detection worker's rolling frame
# buffer, encodes it to MP4, encrypts it with AES-256-GCM, and creates the
# corresponding EvidenceClip database record.
#
# The recorder runs in a background thread so it does not block the main
# detection loop.
# ─────────────────────────────────────────────────────────────────────────────

import hashlib
import logging
import os
import threading
import time
from datetime import timedelta
from pathlib import Path

import cv2
from django.conf import settings
from django.utils import timezone

from .encryption import encrypt_file

logger = logging.getLogger(__name__)


def _ensure_clips_dir() -> Path:
    """Create the evidence clips directory structure: clips_dir/YYYY/MM/DD/"""
    now = timezone.now()
    clips_dir = Path(settings.EVIDENCE_CLIPS_DIR) / f"{now:%Y}" / f"{now:%m}" / f"{now:%d}"
    clips_dir.mkdir(parents=True, exist_ok=True)
    return clips_dir


def _compute_sha256(file_path: str) -> str:
    """Compute SHA-256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def record_evidence_clip(camera, alert, frame_buffer: list, fps: float):
    """
    Record a 10-second evidence clip from the rolling frame buffer.

    This function is intended to be called in a background thread.
    It snapshots the current frame buffer, writes it to an MP4 file,
    encrypts it, and creates the EvidenceClip database record.

    Args:
        camera: Camera model instance
        alert: Alert model instance (the triggering alert)
        frame_buffer: list of (timestamp, frame_bgr) tuples from the rolling buffer
        fps: Current camera FPS (used for VideoWriter encoding)
    """
    from .models import EvidenceClip

    clip_duration = getattr(settings, "EVIDENCE_CLIP_DURATION", 10)
    retention_hours = getattr(settings, "EVIDENCE_RETENTION_HOURS", 48)

    try:
        # ── Snapshot the buffer ───────────────────────────────────────────────
        # Take a copy so the main thread can keep appending
        frames = list(frame_buffer)

        if not frames:
            logger.warning(
                "[CAM %s] No frames in buffer — cannot record evidence clip for alert %s.",
                camera.id, alert.id,
            )
            return

        # Determine frame dimensions from the first frame
        sample_frame = frames[0][1] if isinstance(frames[0], (list, tuple)) else frames[0]
        h, w = sample_frame.shape[:2]
        resolution_str = f"{w}x{h}"

        # Use a sensible FPS (clamp between 5 and 30)
        encode_fps = max(5.0, min(float(fps) if fps > 0 else 15.0, 30.0))

        # ── Write MP4 ────────────────────────────────────────────────────────
        clips_dir = _ensure_clips_dir()
        timestamp_str = timezone.now().strftime("%Y%m%d_%H%M%S")
        filename = f"EVD_cam{camera.id}_alert{alert.id}_{timestamp_str}.mp4"
        mp4_path = str(clips_dir / filename)

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(mp4_path, fourcc, encode_fps, (w, h))

        if not writer.isOpened():
            logger.error("[CAM %s] Failed to open VideoWriter for %s", camera.id, mp4_path)
            return

        frames_written = 0
        for item in frames:
            frame = item[1] if isinstance(item, (list, tuple)) else item
            writer.write(frame)
            frames_written += 1

        writer.release()

        if frames_written == 0:
            logger.warning("[CAM %s] No frames written for evidence clip.", camera.id)
            if os.path.exists(mp4_path):
                os.remove(mp4_path)
            return

        actual_duration = frames_written / encode_fps
        file_size = os.path.getsize(mp4_path)

        logger.info(
            "[CAM %s] Evidence clip recorded: %s (%d frames, %.1fs, %.1f KB)",
            camera.id, filename, frames_written, actual_duration,
            file_size / 1024,
        )

        # ── Encrypt with AES-256-GCM ─────────────────────────────────────────
        encrypted_path, iv_hex, tag_hex = encrypt_file(mp4_path)
        encrypted_size = os.path.getsize(encrypted_path)

        # ── Compute SHA-256 of the encrypted file (for tamper detection) ──────
        sha256_hash = _compute_sha256(encrypted_path)

        # ── Create database record ───────────────────────────────────────────
        now = timezone.now()
        expires_at = now + timedelta(hours=retention_hours)

        clip = EvidenceClip.objects.create(
            alert=alert,
            file_path=encrypted_path,
            duration_seconds=round(actual_duration, 1),
            file_size_bytes=encrypted_size,
            resolution=resolution_str,
            fps=encode_fps,
            sha256_hash=sha256_hash,
            integrity_status="VERIFIED",
            last_verified_at=now,
            is_encrypted=True,
            encryption_iv=iv_hex,
            encryption_tag=tag_hex,
            review_status="PENDING",
            status="READY",
            expires_at=expires_at,
        )

        logger.info(
            "[CAM %s] EvidenceClip created: id=%s clip_id=%s encrypted=%s expires=%s",
            camera.id, clip.id, clip.clip_id, encrypted_path, expires_at,
        )

        # ── Audit log ────────────────────────────────────────────────────────
        try:
            from logging_info.utils import log_audit
            log_audit(
                action="EVIDENCE_CREATED",
                message=(
                    f"Evidence clip {clip.clip_id} recorded for alert #{alert.id} "
                    f"on camera '{camera.name}'. "
                    f"Duration: {actual_duration:.1f}s, "
                    f"Encrypted: AES-256-GCM, "
                    f"Expires: {expires_at.isoformat()}"
                ),
                category="AUDIT",
                level="INFO",
                source="Evidence Recorder",
                extra={
                    "evidence_id": clip.id,
                    "alert_id": alert.id,
                    "camera_id": camera.id,
                    "encrypted": True,
                    "file_size_bytes": encrypted_size,
                },
            )
        except Exception:
            pass

    except Exception as e:
        logger.error(
            "[CAM %s] Failed to record evidence clip for alert %s: %s",
            camera.id, alert.id, e,
            exc_info=True,
        )


def record_evidence_clip_async(camera, alert, frame_buffer: list, fps: float):
    """
    Spawn a background thread to record an evidence clip.
    This is the function that the detection worker should call.
    """
    # Snapshot the buffer immediately (copy the list reference contents)
    buffer_snapshot = list(frame_buffer)

    thread = threading.Thread(
        target=record_evidence_clip,
        args=(camera, alert, buffer_snapshot, fps),
        name=f"evidence-recorder-cam{camera.id}-alert{alert.id}",
        daemon=True,
    )
    thread.start()
    logger.info(
        "[CAM %s] Evidence recording thread started for alert %s.",
        camera.id, alert.id,
    )
    return thread
