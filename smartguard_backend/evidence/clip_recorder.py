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

        # Use the actual FPS the frames were captured at to ensure real-time playback speed.
        # Clamp between 1.0 and 30.0 (allow down to 1 FPS for slow machines)
        encode_fps = max(1.0, min(float(fps) if fps > 0 else 15.0, 30.0))

        # ── Write MP4 ────────────────────────────────────────────────────────
        clips_dir = _ensure_clips_dir()
        timestamp_str = timezone.now().strftime("%Y%m%d_%H%M%S")
        filename = f"EVD_cam{camera.id}_alert{alert.id}_{timestamp_str}.mp4"
        mp4_path = str(clips_dir / filename)

        fourcc = cv2.VideoWriter_fourcc(*"avc1")
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

        # Store relative path in database so AWS can resolve it properly
        try:
            rel_path = os.path.relpath(encrypted_path, settings.MEDIA_ROOT)
        except ValueError:
            # Fallback if encrypted_path is somehow not inside MEDIA_ROOT
            rel_path = encrypted_path
            
        clip = EvidenceClip.objects.create(
            alert=alert,
            file_path=rel_path,
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
            camera.id, clip.id, clip.clip_id, rel_path, expires_at,
        )
        
        # ── Sync to AWS ────────────────────────────────────────────────────────
        try:
            import urllib.request
            aws_base = os.environ.get('AWS_API_BASE_URL', f"http://{os.environ.get('DATABASE_HOST', '54.206.184.54')}:8000")
            url = f"{aws_base}/api/alerts/upload-media/"
            with open(encrypted_path, 'rb') as f:
                file_bytes = f.read()
            req = urllib.request.Request(url, data=file_bytes, method='POST')
            req.add_header('X-Relative-Path', rel_path.replace('\\', '/'))
            req.add_header('X-Sync-Secret', os.environ.get('MEDIA_SYNC_SECRET', ''))
            urllib.request.urlopen(req, timeout=120)
            logger.info("[CAM %s] Successfully synced evidence clip to AWS.", camera.id)
        except Exception as sync_e:
            logger.warning("[CAM %s] Failed to sync evidence clip to AWS: %s", camera.id, sync_e)

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


def _delayed_record_evidence_clip(camera, alert, get_buffer_fn, fps, pre_roll_seconds=10):
    # Wait 7 seconds to capture post-roll evidence
    import time
    time.sleep(7.0)
    
    # Snapshot the buffer after the delay safely (deque might be mutating)
    import copy
    buffer_snapshot = None
    for _ in range(10):
        try:
            current_buffer = get_buffer_fn()
            if current_buffer is not None:
                buffer_snapshot = list(current_buffer)
            break
        except RuntimeError:
            time.sleep(0.05)
            
    if not buffer_snapshot:
        logger.error("[CAM %s] Failed to snapshot frame buffer due to mutation errors or empty buffer", camera.id)
        return
        
    # Slice the buffer to the requested duration (pre-roll + 7s post-roll)
    target_frames = int((pre_roll_seconds + 7.0) * fps)
    buffer_snapshot = buffer_snapshot[-target_frames:]
        
    # Run the actual recording
    record_evidence_clip(camera, alert, buffer_snapshot, fps)

def record_evidence_clip_async(camera, alert, get_buffer_fn, fps: float, pre_roll_seconds: int = 10):
    """
    Spawn a background thread to record an evidence clip.
    This is the function that the detection worker should call.
    """
    thread = threading.Thread(
        target=_delayed_record_evidence_clip,
        args=(camera, alert, get_buffer_fn, fps, pre_roll_seconds),
        name=f"evidence-recorder-cam{camera.id}-alert{alert.id}",
        daemon=True,
    )
    thread.start()
    logger.info(
        "[CAM %s] Evidence recording thread started for alert %s (waiting for post-roll).",
        camera.id, alert.id,
    )
    return thread
