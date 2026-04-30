"""
detection_worker.py — SmartGuard AI Detection Worker
Uses Ultralytics YOLO API (same as detect.py) for correct bounding boxes.
"""

import os
import sys
import time
import threading
import logging
import base64
from datetime import datetime, timedelta, timezone

import cv2
import numpy as np
import torch

# ── Django setup ──────────────────────────────────────────────────────────────
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "smartguard_backend.settings")
import django
django.setup()

from django.utils import timezone as dj_timezone
from django.core.mail import send_mail
from django.conf import settings
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from cameras.models import Camera
from alerts.models import Alert
from accounts.models import CustomUser

# ── Ultralytics YOLO (same as detect.py — fixes bounding boxes) ───────────────
from ultralytics import YOLO

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [WORKER] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
MODEL_PATH           = "yolov8n.pt"  # Auto-downloads generic YOLOv8 model for testing
CONFIDENCE_THRESHOLD = 0.4
FRAME_SKIP           = 3          # run inference every N frames
HEARTBEAT_EVERY      = 30         # seconds between heartbeat pushes
EMAIL_COOLDOWN       = 60         # seconds between emails per camera
INCIDENT_TIMEOUT     = 30         # seconds before incident is considered over
TARGET_CLASS         = "person"   # Generic class for testing (was "shoplifting")

# ── FIX 3 — Test mode ─────────────────────────────────────────────────────────
# Set TEST_VIDEO_PATH to a local video file to override all camera RTSP streams.
# The video will loop automatically so you can capture screenshots at any point.
# Set to None when done testing to use real camera streams from the database.
# TEST_VIDEO_PATH = r"D:\Jacob\SmartguardYOLOV5\sl5.mp4"  # ← original path
TEST_VIDEO_PATH = None   # ← set to a local video file path for testing, or None for real cameras

# ── Device selection ──────────────────────────────────────────────────────────
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# ── Model (loaded once, shared across threads) ────────────────────────────────
_model      = None
_model_lock = threading.Lock()

def get_model() -> YOLO:
    global _model
    with _model_lock:
        if _model is None:
            if DEVICE == "cuda":
                gpu_name = torch.cuda.get_device_name(0)
                vram_mb  = torch.cuda.get_device_properties(0).total_memory // (1024 ** 2)
                log.info("GPU detected: %s (%d MB VRAM)", gpu_name, vram_mb)
                log.info("CUDA version: %s  |  PyTorch: %s", torch.version.cuda, torch.__version__)
            else:
                log.warning("No CUDA GPU found — falling back to CPU (inference will be slow).")

            log.info("Loading YOLO model from: %s  →  device: %s", MODEL_PATH, DEVICE)
            _model = YOLO(MODEL_PATH)
            _model.to(DEVICE)
            log.info("Model loaded on %s. Classes: %s", DEVICE.upper(), _model.names)
    return _model


# ── Severity mapping ──────────────────────────────────────────────────────────
def map_confidence_to_severity(behavior_type: str, c: float) -> str:
    if behavior_type == "CONCEALMENT":
        if c >= 0.95: return "CRITICAL"
        if c >= 0.85: return "HIGH"
        if c >= 0.70: return "MEDIUM"
        return "LOW"
    if behavior_type == "LOITERING":
        if c >= 0.90: return "HIGH"
        if c >= 0.70: return "MEDIUM"
        return "LOW"
    if behavior_type == "RAPID_EXIT":
        if c >= 0.92: return "CRITICAL"
        if c >= 0.80: return "HIGH"
        if c >= 0.65: return "MEDIUM"
        return "LOW"
    # SHOPLIFTING + fallback
    if c >= 0.90: return "HIGH"
    if c >= 0.70: return "MEDIUM"
    return "LOW"

# convenience alias
confidence_to_severity = lambda c: map_confidence_to_severity("CONCEALMENT", c)


# ── Alert creation ────────────────────────────────────────────────────────────
def save_alert(camera: Camera, behavior_type: str, confidence: float,
               severity: str, frame_bgr=None) -> int:
    alert = Alert.objects.create(
        camera=camera,
        behavior_type=behavior_type,
        confidence=confidence,
        severity=severity,
        alert_category="SHOPLIFTING",
        status="NEW",
    )

    # Save annotated snapshot to disk if available
    if frame_bgr is not None:
        try:
            from django.core.files.base import ContentFile
            _, buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, 80])
            filename = f"alert_{alert.id}_{camera.id}.jpg"
            alert.snapshot.save(filename, ContentFile(buf.tobytes()), save=True)
        except Exception as e:
            log.warning("[CAM %s] Failed to save snapshot: %s", camera.id, e)

    log.info("[CAM %s] Alert saved: id=%s severity=%s conf=%.2f",
             camera.id, alert.id, severity, confidence)
    return alert.id


# ── Incident deduplication ────────────────────────────────────────────────────
# Prevents a new alert row being created every FRAME_SKIP frames.
# One Alert per incident; confidence updated if a higher value is seen.
_incidents: dict = {}   # {camera_id: {alert_id, last_seen, max_conf}}

def handle_detection(camera: Camera, behavior_type: str, confidence: float,
                     frame_bgr=None):
    """Create or update the active incident alert for this camera."""
    now    = datetime.now(timezone.utc)
    cam_id = camera.id
    state  = _incidents.get(cam_id)

    if state is None:
        severity = map_confidence_to_severity(behavior_type, confidence)
        alert_id = save_alert(camera, behavior_type, confidence, severity,
                              frame_bgr=frame_bgr)
        _incidents[cam_id] = {
            "alert_id": alert_id,
            "last_seen": now,
            "max_conf": confidence,
        }
        return alert_id, severity, True   # (id, severity, is_new)

    # Incident still active — update last_seen and possibly severity
    state["last_seen"] = now
    is_new = False

    if confidence > state["max_conf"]:
        severity = map_confidence_to_severity(behavior_type, confidence)
        Alert.objects.filter(id=state["alert_id"]).update(
            confidence=confidence,
            severity=severity,
        )
        state["max_conf"] = confidence
    else:
        severity = map_confidence_to_severity(behavior_type, state["max_conf"])

    return state["alert_id"], severity, is_new


def cleanup_incidents():
    """Expire incidents that haven't been seen for INCIDENT_TIMEOUT seconds."""
    now = datetime.now(timezone.utc)
    expired = [
        cam_id for cam_id, s in _incidents.items()
        if (now - s["last_seen"]).total_seconds() > INCIDENT_TIMEOUT
    ]
    for cam_id in expired:
        del _incidents[cam_id]


# ── WebSocket push ────────────────────────────────────────────────────────────
def push_detection(camera_id, camera_name, behavior_type,
                   confidence, severity, alert_id, frame_bgr=None):
    channel_layer = get_channel_layer()

    frame_b64 = None
    if frame_bgr is not None:
        try:
            _, buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, 70])
            frame_b64 = base64.b64encode(buf.tobytes()).decode()
        except Exception as e:
            log.warning("Frame encode failed: %s", e)

    payload = {
        "type":          "detection.event",
        "camera_id":     camera_id,
        "camera_name":   camera_name,
        "behavior_type": behavior_type,
        "confidence":    round(float(confidence), 4),
        "severity":      severity,
        "alert_id":      alert_id,
        "timestamp":     datetime.now(timezone.utc).isoformat(),
        "frame_jpg_b64": frame_b64,
    }

    try:
        async_to_sync(channel_layer.group_send)(f"camera_{camera_id}", payload)
    except Exception as e:
        log.error("Camera channel push failed: %s", e)

    # Global alert channel
    try:
        global_payload        = dict(payload)
        global_payload["type"] = "new.alert"
        async_to_sync(channel_layer.group_send)("alerts_global", global_payload)
    except Exception as e:
        log.error("Global alert push failed: %s", e)


def push_heartbeat(camera_id: int, fps: float):
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"camera_{camera_id}",
            {
                "type":      "worker.heartbeat",
                "camera_id": camera_id,
                "fps":       round(fps, 1),
                "ts":        datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception as e:
        log.warning("Heartbeat push failed: %s", e)


# ── FIX 2 — Role-split email alerts ──────────────────────────────────────────
# OPS/ADMIN receive full technical details (severity, behavior, confidence,
# alert ID). STAFF receive location and time only — no behavior type, no
# confidence score — consistent with the Staff Portal UI and RA 10173
# data minimization requirements.



# ─────────────────────────────────────────────────────────────────────────────
# REPLACE the send_alert_email function in smartguard_backend/detection_worker.py
# with this version. It now also sends Twilio SMS to users whose phone_number
# field is set in the database.
# ─────────────────────────────────────────────────────────────────────────────

def send_alert_sms(camera_name: str, severity: str, timestamp_str: str,
                   phone_numbers: list[str]):
    """
    Sends a short SMS via Twilio to every phone_number in the list.
    Silently skips if Twilio credentials are not configured.
    """
    if not phone_numbers:
        return
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN
            and settings.TWILIO_FROM_NUMBER):
        log.warning("Twilio not configured — SMS alerts skipped.")
        return

    try:
        from twilio.rest import Client
        client  = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        message = (
            f"[SmartGuard] {severity} ALERT\n"
            f"Camera: {camera_name}\n"
            f"Time: {timestamp_str}\n"
            f"Log in to review: http://localhost:5173/admin"
        )
        for number in phone_numbers:
            try:
                client.messages.create(
                    from_=settings.TWILIO_FROM_NUMBER,
                    to=number,
                    body=message,
                )
                log.info("SMS sent to %s", number)
            except Exception as sms_err:
                log.error("SMS to %s failed: %s", number, sms_err)
    except ImportError:
        log.warning("twilio package not installed — SMS alerts skipped.")
    except Exception as e:
        log.error("Twilio client error: %s", e)


def send_alert_email(camera_name: str, behavior_type: str,
                     confidence: float, severity: str, alert_id: int):
    """
    Sends email alerts (role-split) AND SMS alerts (via Twilio)
    to all users with a phone_number set in their account.

    Email split:
      - OPS + ADMIN  → full technical details
      - STAFF        → location and time ONLY (RA 10173 data minimisation)

    SMS (all roles with phone_number set):
      - SHORT message: severity, camera name, timestamp
    """
    try:
        timestamp_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        # ── Gather recipients ─────────────────────────────────────────────────
        ops_qs = CustomUser.objects.filter(
            role__in=["OPERATIONS_MANAGER", "ADMIN"], is_active=True,
        )
        staff_qs = CustomUser.objects.filter(role="STAFF", is_active=True)

        ops_emails   = list(ops_qs.exclude(email="").values_list("email",        flat=True))
        staff_emails = list(staff_qs.exclude(email="").values_list("email",      flat=True))

        # SMS recipients — ALL active users with a phone number
        sms_numbers  = list(
            CustomUser.objects.filter(
                is_active=True,
            ).exclude(phone_number="").values_list("phone_number", flat=True)
        )

        # ── Email: OPS + ADMIN — full technical details ───────────────────────
        if ops_emails:
            ops_subject = (
                f"[SmartGuard] {severity} Alert — "
                f"{behavior_type} Detected at {camera_name}"
            )
            ops_message = (
                f"SmartGuard AI has detected a suspicious activity.\n\n"
                f"Severity:    {severity}\n"
                f"Behavior:    {behavior_type}\n"
                f"Camera:      {camera_name}\n"
                f"Confidence:  {round(confidence * 100)}%\n"
                f"Alert ID:    #{alert_id}\n"
                f"Time:        {timestamp_str}\n\n"
                f"Log in to the SmartGuard dashboard to review and take action:\n"
                f"http://localhost:5173/admin\n"
            )
            from django.core.mail import send_mail
            send_mail(
                subject=ops_subject, message=ops_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=ops_emails, fail_silently=False,
            )
            log.info("Full alert email sent to %d OPS/ADMIN recipient(s).", len(ops_emails))

        # ── Email: STAFF — location and time ONLY ────────────────────────────
        if staff_emails:
            staff_subject = f"[SmartGuard] Incident Alert — {camera_name}"
            staff_message = (
                f"An incident has been reported in your area.\n\n"
                f"Location:  {camera_name}\n"
                f"Time:      {timestamp_str}\n\n"
                f"Please check the Staff Portal and acknowledge this alert:\n"
                f"http://localhost:5173/staff\n"
            )
            from django.core.mail import send_mail
            send_mail(
                subject=staff_subject, message=staff_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=staff_emails, fail_silently=False,
            )
            log.info("Minimal alert email sent to %d STAFF recipient(s).", len(staff_emails))

        if not ops_emails and not staff_emails:
            log.warning("No email recipients found.")

        # ── SMS — all users with a phone_number ───────────────────────────────
        send_alert_sms(camera_name, severity, timestamp_str, sms_numbers)

    except Exception as e:
        log.error("Failed to send alert notifications: %s", e)


# ── HUD overlay ──────────────────────────────────────────────────────────────
# Draws a SmartGuard-branded overlay on top of the YOLO annotated frame.
# Shows: camera name, timestamp, FPS, behavior label, severity badge,
# confidence bar, and alert ID when a detection fires.

SEVERITY_COLORS = {
    "CRITICAL": (0,   0,   220),   # red
    "HIGH":     (0,   100, 220),   # orange-red
    "MEDIUM":   (0,   165, 255),   # amber
    "LOW":      (180, 130, 70),    # muted blue
}

FONT       = cv2.FONT_HERSHEY_DUPLEX
FONT_SMALL = cv2.FONT_HERSHEY_SIMPLEX


def _text(img, text, pos, scale, color, thickness=1, shadow=True):
    """Draw text with optional drop shadow for readability on any background."""
    x, y = pos
    if shadow:
        cv2.putText(img, text, (x + 1, y + 1), FONT, scale, (0, 0, 0), thickness + 1, cv2.LINE_AA)
    cv2.putText(img, text, pos, FONT, scale, color, thickness, cv2.LINE_AA)


def _filled_rect(img, x1, y1, x2, y2, color, alpha=0.55):
    """Semi-transparent filled rectangle."""
    overlay = img.copy()
    cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
    cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)


def draw_hud(frame: np.ndarray, cam_name: str, fps: float,
             detection: dict | None) -> np.ndarray:
    """
    Draws the SmartGuard HUD on top of the YOLO-annotated frame.

    detection = None                    → idle state (no current detection)
    detection = {
        behavior_type, confidence,
        severity, alert_id
    }                                   → active detection state
    """
    h, w = frame.shape[:2]
    out  = frame.copy()

    # ── Top bar — camera name + timestamp + FPS ──────────────────────────────
    bar_h = 38
    _filled_rect(out, 0, 0, w, bar_h, (15, 20, 30), alpha=0.75)

    # SmartGuard logo text
    _text(out, "SMART", (10, 26), 0.55, (255, 255, 255), thickness=1)
    _text(out, "GUARD", (65, 26), 0.55, (59, 130, 246), thickness=1)

    # Camera name
    _text(out, f"  |  {cam_name}", (115, 26), 0.45, (180, 200, 220), thickness=1)

    # Timestamp + FPS on right
    ts  = datetime.now().strftime("%Y-%m-%d  %H:%M:%S")
    fps_str = f"{fps:.1f} FPS"
    _text(out, fps_str, (w - 90, 26), 0.44, (100, 200, 100), thickness=1)
    _text(out, ts,      (w - 220, 26), 0.38, (140, 160, 180), thickness=1)

    # ── Bottom panel ─────────────────────────────────────────────────────────
    panel_h = 56
    _filled_rect(out, 0, h - panel_h, w, h, (10, 14, 22), alpha=0.80)

    if detection is None:
        # ── Idle state ────────────────────────────────────────────────────────
        _text(out, "MONITORING", (12, h - 33), 0.50, (80, 140, 200), thickness=1)
        _text(out, "No suspicious behavior detected",
              (12, h - 12), 0.40, (100, 120, 140), thickness=1)

        # Green "LIVE" pill
        cv2.rectangle(out, (w - 66, h - panel_h + 10),
                      (w - 10, h - panel_h + 32), (0, 160, 60), -1)
        cv2.rectangle(out, (w - 66, h - panel_h + 10),
                      (w - 10, h - panel_h + 32), (0, 220, 80), 1)
        _text(out, "LIVE", (w - 58, h - panel_h + 25),
              0.38, (255, 255, 255), thickness=1, shadow=False)

    else:
        # ── Active detection state ────────────────────────────────────────────
        btype    = detection["behavior_type"]
        conf     = detection["confidence"]
        sev      = detection["severity"]
        alert_id = detection["alert_id"]
        sev_col  = SEVERITY_COLORS.get(sev, (200, 200, 200))

        # Behavior label
        _text(out, btype, (12, h - 33), 0.62, (255, 255, 255), thickness=1)

        # Alert ID small
        _text(out, f"Alert #{alert_id}", (12, h - 11),
              0.38, (140, 160, 180), thickness=1)

        # ── Severity badge ────────────────────────────────────────────────────
        badge_x = 220
        badge_w = len(sev) * 11 + 18
        cv2.rectangle(out,
                      (badge_x, h - panel_h + 12),
                      (badge_x + badge_w, h - panel_h + 34),
                      sev_col, -1)
        cv2.rectangle(out,
                      (badge_x, h - panel_h + 12),
                      (badge_x + badge_w, h - panel_h + 34),
                      (255, 255, 255), 1)
        _text(out, sev,
              (badge_x + 8, h - panel_h + 27),
              0.38, (255, 255, 255), thickness=1, shadow=False)

        # ── Confidence bar ────────────────────────────────────────────────────
        bar_x     = badge_x + badge_w + 16
        bar_y     = h - panel_h + 16
        bar_total = 180
        bar_fill  = int(bar_total * conf)
        bar_color = sev_col

        # Track
        cv2.rectangle(out,
                      (bar_x, bar_y),
                      (bar_x + bar_total, bar_y + 12),
                      (40, 50, 65), -1)
        # Fill
        if bar_fill > 0:
            cv2.rectangle(out,
                          (bar_x, bar_y),
                          (bar_x + bar_fill, bar_y + 12),
                          bar_color, -1)
        # Border
        cv2.rectangle(out,
                      (bar_x, bar_y),
                      (bar_x + bar_total, bar_y + 12),
                      (80, 100, 120), 1)

        # Confidence percentage
        conf_pct = f"{round(conf * 100)}%"
        _text(out, conf_pct,
              (bar_x + bar_total + 8, bar_y + 11),
              0.42, (220, 230, 240), thickness=1)

        # Confidence label above bar
        _text(out, "CONFIDENCE",
              (bar_x, bar_y - 3),
              0.28, (100, 130, 160), thickness=1)

        # ── Flashing ALERT pill (pulses via frame time) ───────────────────────
        pulse = int(time.time() * 2) % 2 == 0
        pill_color = (0, 0, 200) if pulse else (0, 0, 160)
        cv2.rectangle(out,
                      (w - 90, h - panel_h + 10),
                      (w - 10, h - panel_h + 32),
                      pill_color, -1)
        cv2.rectangle(out,
                      (w - 90, h - panel_h + 10),
                      (w - 10, h - panel_h + 32),
                      (80, 80, 255), 1)
        _text(out, "ALERT",
              (w - 80, h - panel_h + 25),
              0.38, (255, 255, 255), thickness=1, shadow=False)

    # ── Border frame — red when detecting, dark blue when idle ───────────────
    border_col = SEVERITY_COLORS.get(
        detection["severity"] if detection else None,
        (30, 50, 80)
    )
    cv2.rectangle(out, (0, 0), (w - 1, h - 1), border_col, 3)

    return out


# ── Redis frame sharing (for MJPEG stream) ────────────────────────────────────
def publish_frame_to_redis(camera_id: int, frame_bgr):
    try:
        import redis
        r = redis.Redis(host="127.0.0.1", port=6379)
        _, buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, 70])
        r.set(f"frame:{camera_id}", buf.tobytes(), ex=5)
    except Exception as e:
        log.warning("Redis frame publish failed: %s", e)


# ── Camera worker thread ──────────────────────────────────────────────────────
def camera_worker(camera: Camera):
    cam_id   = camera.id
    cam_name = camera.name
    rtsp_url = camera.rtsp_url

    log.info("[CAM %s] Starting worker for '%s' — %s", cam_id, cam_name, rtsp_url)
    model = get_model()

    frame_count         = 0
    inference_count     = 0       # ← separate counter for FRAME_SKIP
    fps_timer           = time.time()
    fps                 = 0.0
    last_heartbeat      = time.time()
    last_alert_email_ts = 0

    while True:
        source = int(rtsp_url) if rtsp_url.isdigit() else rtsp_url

        cap = cv2.VideoCapture(source)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)   # ← fix C

        if not cap.isOpened():
            log.warning("[CAM %s] Cannot open stream '%s'. Retrying in 10s…", cam_id, source)
            time.sleep(10)
            continue

        log.info("[CAM %s] Stream opened. Resolution: %dx%d",
                 cam_id,
                 int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                 int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))

        Camera.objects.filter(pk=cam_id).update(
            status="ONLINE", last_heartbeat=dj_timezone.now(),
        )

        read_errors     = 0
        MAX_READ_ERRORS = 10

        while True:
            ret, frame = cap.read()
            if not ret:
                if TEST_VIDEO_PATH:
                    log.info("[CAM %s] Test video ended — looping.", cam_id)
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                read_errors += 1
                if read_errors >= MAX_READ_ERRORS:
                    log.error("[CAM %s] Too many read errors — reconnecting.", cam_id)
                    break
                time.sleep(0.1)
                continue

            read_errors  = 0
            frame_count += 1

            # FPS tracking
            elapsed = time.time() - fps_timer
            if elapsed >= 5.0:
                fps         = frame_count / elapsed
                frame_count = 0
                fps_timer   = time.time()

            # Heartbeat
            if time.time() - last_heartbeat >= HEARTBEAT_EVERY:
                Camera.objects.filter(pk=cam_id).update(last_heartbeat=dj_timezone.now())
                push_heartbeat(cam_id, fps)
                last_heartbeat = time.time()

            # ── FRAME_SKIP — only run inference every N frames ────────────────
            inference_count += 1                        # ← fix A
            if inference_count % FRAME_SKIP != 0:
                # Still publish raw frame to Redis for the live MJPEG stream
                publish_frame_to_redis(cam_id, frame)
                continue

            cleanup_incidents()

            # ── Inference ─────────────────────────────────────────────────────
            try:
                results         = model(frame, conf=CONFIDENCE_THRESHOLD, verbose=False, device=DEVICE)
                r               = results[0]
                boxes           = r.boxes
                annotated_frame = r.plot()
            except Exception as e:
                log.error("[CAM %s] Inference error: %s", cam_id, e)
                continue

            # ── Publish annotated frame to Redis for the live MJPEG stream ────
            publish_frame_to_redis(cam_id, annotated_frame)

            # ── Parse detections ──────────────────────────────────────────────
            shoplifting_detected = False
            best_conf            = 0.0

            if boxes is not None and len(boxes) > 0:
                clses = boxes.cls.cpu().numpy().astype(int)
                confs = boxes.conf.cpu().numpy()
                for cls_id, conf in zip(clses, confs):
                    class_name = model.names[int(cls_id)].lower()
                    if class_name == TARGET_CLASS and conf >= CONFIDENCE_THRESHOLD:
                        shoplifting_detected = True
                        if conf > best_conf:
                            best_conf = float(conf)

            current_detection = None

            if shoplifting_detected:
                alert_id, severity, is_new = handle_detection(
                    camera, "CONCEALMENT", best_conf,
                    frame_bgr=annotated_frame,
                )
                current_detection = {
                    "behavior_type": "CONCEALMENT",
                    "confidence":    best_conf,
                    "severity":      severity,
                    "alert_id":      alert_id,
                }
                push_detection(
                    camera_id=cam_id, camera_name=cam_name,
                    behavior_type="CONCEALMENT", confidence=best_conf,
                    severity=severity, alert_id=alert_id,
                    frame_bgr=annotated_frame,
                )
                now = time.time()
                if severity in ("HIGH", "CRITICAL") and \
                        now - last_alert_email_ts >= EMAIL_COOLDOWN:
                    send_alert_email(cam_name, "CONCEALMENT", best_conf, severity, alert_id)
                    last_alert_email_ts = now

            # ── Preview window ────────────────────────────────────────────────
            display_frame = draw_hud(annotated_frame, cam_name, fps, current_detection)
            cv2.imshow(f"SmartGuard - {cam_name}", display_frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                log.info("[CAM %s] Preview closed by user.", cam_id)
                cap.release()
                cv2.destroyAllWindows()
                return

        cap.release()
        cv2.destroyAllWindows()
        Camera.objects.filter(pk=cam_id).update(status="OFFLINE")
        log.warning("[CAM %s] Stream closed. Reconnecting in 10s…", cam_id)
        time.sleep(10)  


# ── Main ──────────────────────────────────────────────────────────────────────
def main():

    log.info("=" * 60)
    log.info("SmartGuard AI Detection Worker starting...")
    log.info("=" * 60)
    # Pre-load model before spawning threads
    get_model()

    cameras = list(
        Camera.objects.filter(is_active=True).exclude(rtsp_url="")
    )

    if not cameras:
        log.warning("No active cameras found in the database.")
        log.warning("Add a camera via the dashboard and restart this worker.")
        return

    log.info("Found %d active camera(s). Starting detection threads…", len(cameras))

    threads = []
    for cam in cameras:
        t = threading.Thread(
            target=camera_worker,
            args=(cam,),
            name=f"worker-cam-{cam.id}",
            daemon=True,
        )
        t.start()
        threads.append(t)
        log.info("  Started thread for camera: [%s] %s", cam.id, cam.name)

    log.info("All workers started. Press Ctrl+C to stop.")
    if TEST_VIDEO_PATH:
        log.info("Video is looping — press Q in the preview window or Ctrl+C to stop.")

    try:
        while True:
            alive = [t.name for t in threads if t.is_alive()]
            if alive:
                log.info("Alive workers: %s", alive)
            else:
                log.warning("All worker threads have stopped.")
                break
            time.sleep(60)
    except KeyboardInterrupt:
        log.info("Shutdown requested. Stopping workers…")


if __name__ == "__main__":
    main()