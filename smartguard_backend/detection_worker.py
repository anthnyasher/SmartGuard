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
import json
import collections
from datetime import datetime, timedelta, timezone

import cv2
import numpy as np
import torch
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)

# ── SSH Tunnel Manager (Auto-Reconnect) ───────────────────────────────────────
def start_ssh_tunnel():
    """Maintains the SSH tunnel to the AWS server for DB and Redis if running locally."""
    # Only run on Windows (the local worker laptop)
    if os.name != "nt":
        return

    import subprocess
    import threading
    import time
    
    # Set up basic logging if it hasn't been set up yet
    logger = logging.getLogger("TunnelManager")

    def tunnel_monitor():
        logger.info("Starting SSH Tunnel Manager in background...")
        while True:
            # We use ServerAliveInterval to ensure the ssh process exits if connection drops
            cmd = [
                "ssh", 
                "-i", r"C:\Users\asher\Downloads\smartguard-key.pem", 
                "-N", 
                "-o", "ServerAliveInterval=15", 
                "-o", "ServerAliveCountMax=3",
                "-o", "StrictHostKeyChecking=no",
                "-L", "5433:localhost:5432", 
                "-L", "6380:localhost:6379", 
                "ubuntu@54.206.184.54"
            ]
            
            try:
                # Run the SSH command
                process = subprocess.Popen(
                    cmd, 
                    stdout=subprocess.DEVNULL, 
                    stderr=subprocess.DEVNULL
                )
                
                # Wait for process to exit (it shouldn't normally, unless connection drops)
                process.wait()
                logger.warning("SSH tunnel disconnected (exit code %s). Reconnecting in 3 seconds...", process.returncode)
            except Exception as e:
                logger.error("Failed to start SSH tunnel process: %s", e)
            
            time.sleep(3)

    t = threading.Thread(target=tunnel_monitor, daemon=True)
    t.start()
    
    # Give the tunnel 2.5 seconds to establish local port bindings before Django attempts to connect to DB
    time.sleep(2.5)

start_ssh_tunnel()

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

# ── YOLOv8 ────────────────────────────────────────────────────────────────────
from ultralytics import YOLO
import torch

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [WORKER] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Configuration (Defaults, overridden by DB) ────────────────────────────────
MODEL_PATH           = os.path.join(os.path.dirname(os.path.abspath(__file__)), "best.pt")
CONFIDENCE_THRESHOLD = 0.4
FRAME_SKIP           = 15         # run inference every N frames
HEARTBEAT_EVERY      = 30         # seconds between heartbeat pushes
EMAIL_COOLDOWN       = 60         # seconds between emails per camera
INCIDENT_TIMEOUT     = 30         # seconds before incident is considered over
TARGET_CLASS         = "shoplifting"   # Class name in custom best.pt model
CLIP_DURATION        = 30         # MAX seconds of video to capture per evidence clip (Pre-roll buffer)
AUTO_EVIDENCE        = True
ENABLED_BEHAVIORS    = {}
# Notification toggles (Settings -> Notifications), reloaded live from the DB.
EMAIL_ALERTS_ENABLED = True
SMS_ALERTS_ENABLED   = False
NOTIFY_ON            = {"CRITICAL": True, "HIGH": True, "MEDIUM": False, "LOW": False}
SHOW_PREVIEW         = False      # local cv2 window — keep False on Windows (big FPS hit); view via web dashboard instead
JPEG_QUALITY         = 50         # JPEG quality for Redis stream (lower = less bandwidth)
PUBLISH_FPS          = 30         # live-feed frame rate pushed to Redis (decoupled from detection rate)
CAPTURE_WIDTH        = 640        # downscale webcam capture width
CAPTURE_HEIGHT       = 480        # downscale webcam capture height

# ── Multi-behavior detection (tracking-based) ──────────────────────────────────
# Ultralytics tracking (ByteTrack) assigns each person a stable ID, so we can
# reason about behavior over TIME instead of per single frame:
#   SHOPLIFTING  (== concealment) : model "shoplifting" class, confirmed across
#                                   several frames + a high-confidence opener.
#   LOITERING                     : a tracked person present longer than the
#                                   dwell threshold (Settings → loitering_duration).
#   RAPID_EXIT  (running/outburst): a tracked person moving fast (velocity) or
#                                   the model "running" class, sustained briefly.
import math
TRACKER_CFG          = "bytetrack.yaml"
SHOPLIFT_START_CONF  = 0.80       # need one hit >= this to OPEN a shoplifting alert
SHOPLIFT_WINDOW      = 5          # consider the last N inference frames per track
SHOPLIFT_MIN_HITS    = 3          # require >= this many shoplifting hits in the window
LOITERING_SECONDS    = 20         # dwell seconds before a track counts as loitering (DB-overridden)
RUN_SPEED            = 0.45       # normalized centroid speed (frame-diagonals/sec) => running
RUN_MIN_FRAMES       = 3          # sustain running this many tracked frames before alerting
TRACK_STALE_SECONDS  = 5.0        # forget a track not seen for this long
RUNNING_CLASS        = "running"  # model class name for the running pose
_SEVERITY_RANK       = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}

# ── Motion gate (power saving) ────────────────────────────────────────────────
# When the scene is static (empty store, nobody around) the worker skips the
# expensive YOLO inference entirely and just keeps the live stream flowing.
# A cheap frame-difference check decides if "something is going on". The moment
# motion appears, full detection resumes. This is the main laptop power saver.
MOTION_GATE_ENABLED   = True      # set False to always run YOLO (old behavior)
MOTION_THRESHOLD      = 22        # per-pixel grayscale diff to count as "changed"
MOTION_MIN_AREA_RATIO = 0.004     # fraction of frame that must change to be "motion"
MOTION_IDLE_GRACE     = 4.0       # keep running inference this long after last motion
MOTION_IDLE_RECHECK   = 12.0      # safety net: run YOLO at least once every N idle seconds

# ── FIX 3 — Test mode ─────────────────────────────────────────────────────────
# Set TEST_VIDEO_PATH to a local video file to override all camera RTSP streams.
# The video will loop automatically so you can capture screenshots at any point.
# Set to None when done testing to use real camera streams from the database.
# TEST_VIDEO_PATH = r"D:\Jacob\SmartguardYOLOV5\sl5.mp4"  # ← original path
TEST_VIDEO_PATH = None   # ← set to a local video file path for testing, or None for real cameras

# ── Device selection ──────────────────────────────────────────────────────────
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"

# ── Model (loaded once, shared across threads) ────────────────────────────────
_model      = None
_model_lock = threading.Lock()

def get_model():
    global _model
    with _model_lock:
        if _model is None:
            if DEVICE != "cpu":
                gpu_name = torch.cuda.get_device_name(0)
                vram_mb  = torch.cuda.get_device_properties(0).total_memory // (1024 ** 2)
                log.info("GPU detected: %s (%d MB VRAM)", gpu_name, vram_mb)
                log.info("CUDA version: %s  |  PyTorch: %s", torch.version.cuda, torch.__version__)
            else:
                log.warning("No CUDA GPU found — falling back to CPU (inference will be slow).")

            log.info("Loading YOLO model from: %s  →  device: %s", MODEL_PATH, DEVICE)
            _model = YOLO(MODEL_PATH)
            _model.to(DEVICE)
            # YOLO doesn't use _model.conf globally, we pass conf to predict() instead
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
            
            # Sync to AWS
            try:
                import urllib.request
                import os
                aws_base = os.environ.get('AWS_API_BASE_URL', f"http://{os.environ.get('DATABASE_HOST', '54.206.184.54')}:8000")
                url = f"{aws_base}/api/alerts/upload-media/"
                req = urllib.request.Request(url, data=buf.tobytes(), method='POST')
                req.add_header('X-Relative-Path', alert.snapshot.name)
                req.add_header('X-Sync-Secret', os.environ.get('MEDIA_SYNC_SECRET', ''))
                urllib.request.urlopen(req, timeout=5)
            except Exception as sync_e:
                log.warning("[CAM %s] Failed to sync snapshot to AWS: %s", camera.id, sync_e)
                
        except Exception as e:
            log.warning("[CAM %s] Failed to save snapshot: %s", camera.id, e)

    log.info("[CAM %s] Alert saved: id=%s severity=%s conf=%.2f",
             camera.id, alert.id, severity, confidence)
    return alert.id


# ── Incident deduplication ────────────────────────────────────────────────────
# Prevents a new alert row being created every FRAME_SKIP frames.
# One Alert per incident; confidence updated if a higher value is seen.
_incidents: dict = {}   # {camera_id: {alert_id, last_seen, max_conf}}

# ── Per-camera frame buffers (for evidence clips) ────────────────────────────
# Each camera gets a rolling deque of (timestamp, frame_bgr) tuples.
# Buffer size = CLIP_DURATION * estimated_fps frames.
_frame_buffers: dict = {}   # {camera_id: deque}

# Store actual FPS per camera to pass to background threads
_camera_fps: dict = {}      # {camera_id: float}

# ── Motion gate state ─────────────────────────────────────────────────────────
# Holds the previous downscaled grayscale frame per camera for frame-differencing.
_prev_gray: dict = {}       # {camera_id: np.ndarray}

# Most recent detection state per camera, so frames where YOLO didn't run can
# still render a consistent HUD overlay on the live feed.
_last_hud_state: dict = {}   # {camera_id: (detection_dict_or_None, best_conf)}

def detect_motion(camera_id: int, frame_bgr) -> bool:
    """
    Cheap frame-difference motion check used to gate YOLO inference.

    Downscales to a tiny grayscale image and compares against the previous one.
    Returns True if a meaningful fraction of the frame changed (something is
    going on), False if the scene is essentially static. Cost is negligible
    compared to a YOLO forward pass, so it's safe to run every cycle.
    """
    small = cv2.resize(frame_bgr, (160, 120))
    gray  = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray  = cv2.GaussianBlur(gray, (5, 5), 0)

    prev = _prev_gray.get(camera_id)
    _prev_gray[camera_id] = gray

    # No baseline yet — assume motion so we don't miss the first activity.
    if prev is None or prev.shape != gray.shape:
        return True

    delta  = cv2.absdiff(prev, gray)
    thresh = cv2.threshold(delta, MOTION_THRESHOLD, 255, cv2.THRESH_BINARY)[1]
    changed = cv2.countNonZero(thresh)
    ratio   = changed / float(gray.shape[0] * gray.shape[1])
    return ratio >= MOTION_MIN_AREA_RATIO


# ── Per-track behavior state (tracking-based behaviors) ────────────────────────
# _tracks[cam_id][track_id] = {first_seen, last_seen, centroid, frames,
#                              shoplift(deque), shoplift_open(bool), run_frames(int)}
_tracks: dict = {}

def _behavior_enabled(behavior: str) -> bool:
    """Respect the dashboard's per-behavior on/off toggles (default ON)."""
    return not (ENABLED_BEHAVIORS and ENABLED_BEHAVIORS.get(behavior) is False)

def analyze_tracks(cam_id: int, results, frame_shape, now: float):
    """
    Update per-track state from one tracked inference result and decide which
    behaviors are firing for this camera right now.

    Returns (fired, live_shoplift_conf) where `fired` is {behavior_type: confidence}
    for behaviors active THIS frame. Detection is per track; alerts are
    deduplicated per (camera, behavior) by handle_detection downstream.
    """
    cam_tracks = _tracks.setdefault(cam_id, {})
    fired: dict = {}
    live_conf = 0.0

    h, w = frame_shape[:2]
    diag = math.hypot(w, h) or 1.0

    boxes = results.boxes
    have = boxes is not None and boxes.id is not None and len(boxes) > 0

    if have:
        names = getattr(results, "names", {})
        ids   = boxes.id.int().tolist()
        clses = boxes.cls.int().tolist()
        confs = boxes.conf.tolist()
        xywh  = boxes.xywh.tolist()
        for tid, cls_id, conf, (cx, cy, bw, bh) in zip(ids, clses, confs, xywh):
            cls_name = str(names.get(cls_id, cls_id)).lower()
            st = cam_tracks.get(tid)
            if st is None:
                st = {"first_seen": now, "last_seen": now, "centroid": (cx, cy),
                      "frames": 0, "shoplift": collections.deque(maxlen=SHOPLIFT_WINDOW),
                      "shoplift_open": False, "run_frames": 0}
                cam_tracks[tid] = st

            dt = max(now - st["last_seen"], 1e-3)
            px, py = st["centroid"]
            speed = math.hypot(cx - px, cy - py) / diag / dt
            st["centroid"]  = (cx, cy)
            st["last_seen"] = now
            st["frames"]   += 1
            dwell = now - st["first_seen"]

            # SHOPLIFTING: window confirmation + high-confidence opener (hysteresis)
            if _behavior_enabled("SHOPLIFTING"):
                if cls_name == TARGET_CLASS:
                    live_conf = max(live_conf, conf)
                is_hit = (cls_name == TARGET_CLASS and conf >= CONFIDENCE_THRESHOLD)
                st["shoplift"].append((is_hit, conf if is_hit else 0.0))
                hits = [c for ok, c in st["shoplift"] if ok]
                if len(hits) >= SHOPLIFT_MIN_HITS:
                    peak = max(hits)
                    if st["shoplift_open"] or peak >= SHOPLIFT_START_CONF:
                        st["shoplift_open"] = True
                        fired["SHOPLIFTING"] = max(fired.get("SHOPLIFTING", 0.0), peak)
                elif not hits:
                    st["shoplift_open"] = False

            # RAPID_EXIT: fast movement OR running pose, sustained a few frames
            if _behavior_enabled("RAPID_EXIT") and conf >= CONFIDENCE_THRESHOLD:
                running_now = speed >= RUN_SPEED or cls_name == RUNNING_CLASS
                st["run_frames"] = st["run_frames"] + 1 if running_now else 0
                if st["run_frames"] >= RUN_MIN_FRAMES:
                    fired["RAPID_EXIT"] = max(fired.get("RAPID_EXIT", 0.0), min(0.99, conf))

            # LOITERING: continuous presence beyond the dwell threshold
            if _behavior_enabled("LOITERING") and conf >= CONFIDENCE_THRESHOLD and dwell >= LOITERING_SECONDS:
                fired["LOITERING"] = max(fired.get("LOITERING", 0.0), min(0.99, conf))

    # forget stale tracks (ByteTrack retires IDs; drop our state too)
    for tid in [t for t, s in cam_tracks.items() if now - s["last_seen"] > TRACK_STALE_SECONDS]:
        del cam_tracks[tid]

    return fired, live_conf


def handle_detection(camera: Camera, behavior_type: str, confidence: float,
                     frame_bgr=None):
    """Create or update the active incident alert for this camera."""
    now    = datetime.now(timezone.utc)
    cam_id = camera.id
    key    = (cam_id, behavior_type)   # one active incident per (camera, behavior)
    state  = _incidents.get(key)

    if state is None:
        severity = map_confidence_to_severity(behavior_type, confidence)
        alert_id = save_alert(camera, behavior_type, confidence, severity,
                              frame_bgr=frame_bgr)
        _incidents[key] = {
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
        key for key, s in _incidents.items()
        if (now - s["last_seen"]).total_seconds() > INCIDENT_TIMEOUT
    ]
    for key in expired:
        del _incidents[key]


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
            role__in=["OPS_MANAGER", "ADMIN"], is_active=True,
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

        # Respect dashboard channel toggles (Settings -> Notifications)
        if not EMAIL_ALERTS_ENABLED:
            ops_emails = staff_emails = []
        if not SMS_ALERTS_ENABLED:
            sms_numbers = []

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
    """Semi-transparent filled rectangle — ROI-only blend to avoid full-frame copy."""
    h_img, w_img = img.shape[:2]
    # Clamp to image bounds
    rx1, ry1 = max(x1, 0), max(y1, 0)
    rx2, ry2 = min(x2, w_img), min(y2, h_img)
    if rx2 <= rx1 or ry2 <= ry1:
        return
    roi = img[ry1:ry2, rx1:rx2]
    overlay_roi = roi.copy()
    cv2.rectangle(overlay_roi, (0, 0), (rx2 - rx1, ry2 - ry1), color, -1)
    cv2.addWeighted(overlay_roi, alpha, roi, 1 - alpha, 0, roi)


def draw_hud(frame: np.ndarray, cam_name: str, fps: float,
             detection: dict | None, live_conf: float = 0.0, live_behavior: str = "SHOPLIFTING") -> np.ndarray:
    """
    Draws the SmartGuard HUD on top of the frame.

    detection = None                    → idle state (no current active alert)
    detection = {
        behavior_type, confidence,
        severity, alert_id
    }                                   → active detection state
    """
    h, w = frame.shape[:2]
    out  = frame  # draw in-place — caller must pass a frame it's OK to mutate

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
        _text(out, f"Target: {live_behavior}",
              (12, h - 12), 0.40, (100, 120, 140), thickness=1)

        # Green "LIVE" pill
        cv2.rectangle(out, (w - 66, h - panel_h + 10),
                      (w - 10, h - panel_h + 32), (0, 160, 60), -1)
        cv2.rectangle(out, (w - 66, h - panel_h + 10),
                      (w - 10, h - panel_h + 32), (0, 220, 80), 1)
        _text(out, "LIVE", (w - 58, h - panel_h + 25),
              0.38, (255, 255, 255), thickness=1, shadow=False)
              
        # Set variables for the confidence bar below
        disp_sev = "LOW"
        disp_conf = live_conf
        sev_col = (100, 120, 140)
        badge_x = 220

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
              
        # Set variables for the confidence bar below
        disp_conf = conf
        
    # ── Confidence bar (Always Drawn) ──────────────────────────────────────
    bar_x     = badge_x + 100 if detection else 220
    bar_y     = h - panel_h + 16
    bar_total = 180
    bar_fill  = int(bar_total * disp_conf)
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
    conf_pct = f"{round(disp_conf * 100)}%"
    _text(out, conf_pct,
          (bar_x + bar_total + 8, bar_y + 11),
          0.42, (220, 230, 240), thickness=1)

    # Confidence label above bar
    _text(out, "CONFIDENCE",
          (bar_x, bar_y - 3),
          0.28, (100, 130, 160), thickness=1)

    if detection:
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
_redis_frame_client = None
_latest_redis_frames = {}

def _get_redis_client():
    """Return a reusable Redis connection (created once, shared across frames)."""
    global _redis_frame_client
    if _redis_frame_client is None:
        import redis
        redis_host = os.environ.get("REDIS_HOST", "127.0.0.1")
        redis_pass = os.environ.get("REDIS_PASSWORD", None)
        _redis_frame_client = redis.Redis(host=redis_host, port=int(os.environ.get("CLOUD_REDIS_PORT", 6379)), password=redis_pass)
    return _redis_frame_client

def publish_frame_to_redis(camera_id: int, frame_bgr):
    """
    Instead of publishing synchronously and blocking the AI loop on network latency,
    we just drop the latest frame into a dictionary.
    A separate background thread handles encoding and uploading.
    """
    _latest_redis_frames[camera_id] = frame_bgr

def redis_publisher_thread():
    """Background thread that continuously grabs the latest frames and uploads them to Redis."""
    while True:
        # Create a snapshot of keys so we don't hold the dict lock
        cam_ids = list(_latest_redis_frames.keys())
        for cam_id in cam_ids:
            frame_bgr = _latest_redis_frames.get(cam_id)
            if frame_bgr is None:
                continue
            try:
                r = _get_redis_client()
                _, buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
                r.set(f"frame:{cam_id}", buf.tobytes(), ex=5)
                # Optional: Clear it after sending so we don't resend the exact same frame if inference is slow
                # but leaving it is fine too (MJPEG stream will just show the last frame until a new one arrives).
            except Exception as e:
                log.warning("Redis background publish failed for Cam %s: %s", cam_id, e)
        
        # Pace the publisher to PUBLISH_FPS. This is the frame rate the dashboard
        # live feed actually shows, independent of how often YOLO runs.
        time.sleep(1.0 / PUBLISH_FPS)

# ── Threaded Camera ───────────────────────────────────────────────────────────
class ThreadedCamera:
    def __init__(self, source, width, height, test_video=False):
        # Check if source is a local USB camera (e.g., '0' or '1')
        if isinstance(source, int) or (isinstance(source, str) and source.isdigit()):
            # Use DirectShow backend on Windows for better hardware control
            self.cap = cv2.VideoCapture(int(source), cv2.CAP_DSHOW)
            # Force MJPEG compression to bypass the strict USB 2.0 bandwidth limits
            self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
            # Try to force a high framerate
            self.cap.set(cv2.CAP_PROP_FPS, 30.0)
        else:
            self.cap = cv2.VideoCapture(source)
            
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self.test_video = test_video
        self.ret = False
        self.frame = None
        self.fresh = False
        self.stopped = False
        self.read_errors = 0
        if self.cap.isOpened():
            self.ret, self.frame = self.cap.read()
            self.fresh = True
            self.thread = threading.Thread(target=self.update, args=(), daemon=True)
            self.thread.start()

    def update(self):
        while not self.stopped:
            ret, frame = self.cap.read()
            if not ret:
                if self.test_video:
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                self.read_errors += 1
                if self.read_errors >= 10:
                    self.stopped = True
                    break
                time.sleep(0.1)
                continue
            self.read_errors = 0
            self.ret = ret
            self.frame = frame
            self.fresh = True
            # Small sleep to prevent CPU pegging if source is faster than needed
            time.sleep(0.01)

    def read(self):
        # Only return True if it's a new frame we haven't read yet
        if not self.fresh:
            return False, None
        self.fresh = False
        return self.ret, self.frame.copy() if self.frame is not None else None

    def release(self):
        self.stopped = True
        if hasattr(self, 'thread'):
            self.thread.join(timeout=1.0)
        self.cap.release()

    def isOpened(self):
        return self.cap.isOpened()
    
    def get(self, propId):
        return self.cap.get(propId)

# ── Camera worker thread ──────────────────────────────────────────────────────
def camera_worker(camera: Camera):
    # CLIP_DURATION is both read (buffer sizing, below) and written (live config
    # reload), so it must be declared global before its first use in this scope.
    global CLIP_DURATION
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
    last_motion_ts      = time.time()   # last time motion was seen (motion gate)
    last_inference_ts   = 0.0           # last time YOLO actually ran (idle re-check)

    # ── Rolling frame buffer for evidence clips ───────────────────────────────
    # Buffer holds ~CLIP_DURATION seconds of frames. Initial guess at 15 FPS;
    # resized dynamically once real FPS is measured.
    buffer_max = int(CLIP_DURATION * 15)
    frame_buffer = collections.deque(maxlen=buffer_max)
    _frame_buffers[cam_id] = frame_buffer

    while True:
        source = int(rtsp_url) if rtsp_url.isdigit() else rtsp_url

        cap = ThreadedCamera(source, CAPTURE_WIDTH, CAPTURE_HEIGHT, test_video=bool(TEST_VIDEO_PATH))

        if not cap.isOpened():
            log.warning("[CAM %s] Cannot open stream '%s'. Retrying in 10s…", cam_id, source)
            cap.release()
            time.sleep(10)
            continue

        log.info("[CAM %s] Stream opened. Resolution: %dx%d",
                 cam_id,
                 int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                 int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))

        Camera.objects.filter(pk=cam_id).update(
            status="ONLINE", last_heartbeat=dj_timezone.now(),
        )

        last_config_check = 0

        while not cap.stopped:
            # ── 0. Fetch live settings from DB periodically ───────────────────────
            now = time.time()
            if now - last_config_check > 5.0:
                from config.models import SystemConfig
                try:
                    sc = SystemConfig.get_solo()
                    global CONFIDENCE_THRESHOLD, FRAME_SKIP, LOITERING_SECONDS, AUTO_EVIDENCE, ENABLED_BEHAVIORS, MOTION_GATE_ENABLED, EMAIL_ALERTS_ENABLED, SMS_ALERTS_ENABLED, NOTIFY_ON
                    CONFIDENCE_THRESHOLD = sc.confidence_threshold / 100.0
                    if sc.frame_rate > 0:
                        FRAME_SKIP = max(1, 30 // sc.frame_rate)
                    # loitering_duration now drives actual loitering dwell time
                    LOITERING_SECONDS = sc.loitering_duration
                    AUTO_EVIDENCE = sc.auto_create_evidence
                    ENABLED_BEHAVIORS = sc.enabled_behaviors
                    MOTION_GATE_ENABLED = sc.motion_gated_detection
                    EMAIL_ALERTS_ENABLED = sc.email_alerts_enabled
                    SMS_ALERTS_ENABLED = sc.sms_alerts_enabled
                    NOTIFY_ON = {
                        "CRITICAL": sc.notify_on_critical, "HIGH": sc.notify_on_high,
                        "MEDIUM": sc.notify_on_medium, "LOW": sc.notify_on_low,
                    }
                    if sc.clip_duration > 0:
                        CLIP_DURATION = sc.clip_duration
                except Exception as e:
                    log.warning("Failed to load SystemConfig: %s", e)
                last_config_check = now

            ret, frame = cap.read()
            if not ret or frame is None:
                time.sleep(0.02)
                continue

            frame_count += 1

            # ── Append frame to rolling evidence buffer (every 3rd frame to save CPU)
            if frame_count % 3 == 0:
                frame_buffer.append((time.time(), frame.copy()))

            # FPS tracking
            elapsed = time.time() - fps_timer
            if elapsed >= 5.0:
                fps         = frame_count / elapsed
                frame_count = 0
                fps_timer   = time.time()
                _camera_fps[cam_id] = fps
                # Dynamically resize buffer to hold exactly CLIP_DURATION seconds
                new_max = max(int(CLIP_DURATION * fps), 30)
                if new_max != frame_buffer.maxlen:
                    old_frames = list(frame_buffer)
                    frame_buffer = collections.deque(old_frames, maxlen=new_max)
                    _frame_buffers[cam_id] = frame_buffer

            # Heartbeat
            if time.time() - last_heartbeat >= HEARTBEAT_EVERY:
                from django.db import close_old_connections
                close_old_connections()
                Camera.objects.filter(pk=cam_id).update(last_heartbeat=dj_timezone.now())
                push_heartbeat(cam_id, fps)
                last_heartbeat = time.time()

            # ── FRAME_SKIP — only run inference every N frames ────────────────
            inference_count += 1                        # ← fix A
            if inference_count % FRAME_SKIP != 0:
                # Detection runs every FRAME_SKIP frames, but render the live feed
                # on EVERY frame so it stays smooth. Reuse the latest detection
                # state for the HUD overlay.
                det, lconf = _last_hud_state.get(cam_id, (None, 0.0))
                publish_frame_to_redis(
                    cam_id,
                    draw_hud(frame, cam_name, fps, det,
                             live_conf=lconf, live_behavior=TARGET_CLASS),
                )
                continue

            # ── Motion gate — skip YOLO when nothing is going on ──────────────
            # Saves power: an empty/static scene runs no inference and records
            # nothing. The moment something moves, full detection resumes.
            if MOTION_GATE_ENABLED:
                now_ts = time.time()
                if detect_motion(cam_id, frame):
                    last_motion_ts = now_ts
                idle_for        = now_ts - last_motion_ts
                recheck_due     = (now_ts - last_inference_ts) >= MOTION_IDLE_RECHECK
                active_incident = cam_id in _incidents
                if idle_for > MOTION_IDLE_GRACE and not active_incident and not recheck_due:
                    # Nothing happening — skip the expensive YOLO pass.
                    # Keep the live dashboard stream alive with an idle HUD frame.
                    _last_hud_state[cam_id] = (None, 0.0)
                    idle_frame = draw_hud(frame, cam_name, fps, None,
                                          live_conf=0.0, live_behavior=TARGET_CLASS)
                    publish_frame_to_redis(cam_id, idle_frame)
                    continue

            cleanup_incidents()
            last_inference_ts = time.time()

            # ── Inference ─────────────────────────────────────────────────────
            try:
                # Optimized inference: FP16 precision, 416 resolution
                results_list    = model.track(frame, persist=True, tracker=TRACKER_CFG,
                                              imgsz=416, half=True, verbose=False)
                if not results_list:
                    continue
                results         = results_list[0]
                
                # By default, skip the heavy CPU bounding box drawing to save massive FPS
                annotated_frame = frame
            except Exception as e:
                log.error("[CAM %s] Inference error: %s", cam_id, e, exc_info=True)
                continue

            # ── Parse detections ──────────────────────────────────────────────
            # ── Behavior analysis (per tracked person) ────────────────────────
            now_evt = time.time()
            fired, best_conf = analyze_tracks(cam_id, results, frame.shape, now_evt)

            current_detection = None

            if fired:
                # Lightweight manual box drawing instead of expensive results.plot()
                annotated_frame = frame.copy()
                if results.boxes is not None and results.boxes.id is not None:
                    for xyxy, tid in zip(results.boxes.xyxy.int().tolist(),
                                         results.boxes.id.int().tolist()):
                        x1, y1, x2, y2 = xyxy
                        cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                        cv2.putText(annotated_frame, str(tid), (x1, y1 - 6),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)

                for behavior, conf in fired.items():
                    alert_id, severity, is_new = handle_detection(
                        camera, behavior, conf, frame_bgr=frame,
                    )
                    # Push detection in background thread to avoid blocking inference loop
                    threading.Thread(
                        target=push_detection,
                        args=(cam_id, cam_name, behavior, conf, severity, alert_id),
                        kwargs={"frame_bgr": frame.copy()},
                        daemon=True,
                    ).start()

                    # Keep the most severe active behavior on the HUD readout.
                    if (current_detection is None or
                            _SEVERITY_RANK.get(severity, 0) >
                            _SEVERITY_RANK.get(current_detection["severity"], 0)):
                        current_detection = {
                            "behavior_type": behavior,
                            "confidence":    conf,
                            "severity":      severity,
                            "alert_id":      alert_id,
                        }

                    # Record an evidence clip once per NEW incident.
                    if is_new and AUTO_EVIDENCE:
                        try:
                            from evidence.clip_recorder import record_evidence_clip_async
                            alert_obj = Alert.objects.get(id=alert_id)
                            record_evidence_clip_async(
                                camera, alert_obj, lambda: _frame_buffers.get(cam_id), fps, pre_roll_seconds=10
                            )
                        except Exception as ev_err:
                            log.error("[CAM %s] Evidence clip recording failed: %s", cam_id, ev_err)

                    # Notify per dashboard settings (severity toggle + a channel on), throttled per camera.
                    if (NOTIFY_ON.get(severity, False)
                            and (EMAIL_ALERTS_ENABLED or SMS_ALERTS_ENABLED)
                            and now_evt - last_alert_email_ts >= EMAIL_COOLDOWN):
                        threading.Thread(
                            target=send_alert_email,
                            args=(cam_name, behavior, conf, severity, alert_id),
                            daemon=True,
                        ).start()
                        last_alert_email_ts = now_evt

            # ── Draw HUD & Publish ────────────────────────────────────────────
            # Cache detection state so frames where YOLO didn't run show the same HUD.
            _last_hud_state[cam_id] = (current_detection, best_conf)
            # Create a clean HUD frame over the YOLO boxes
            hud_frame = draw_hud(annotated_frame, cam_name, fps, current_detection, live_conf=best_conf, live_behavior=TARGET_CLASS)

            # Publish to Redis for the live MJPEG stream
            publish_frame_to_redis(cam_id, hud_frame)

            # ── Preview window (optional — disable to reduce CPU/GPU usage) ──
            if SHOW_PREVIEW:
                window_name = f"SmartGuard - {cam_name}"
                cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
                cv2.imshow(window_name, hud_frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    log.info("[CAM %s] Preview closed by user.", cam_id)
                    cap.release()
                    cv2.destroyAllWindows()
                    return

        cap.release()
        if SHOW_PREVIEW:
            cv2.destroyAllWindows()
        Camera.objects.filter(pk=cam_id).update(status="OFFLINE")
        log.warning("[CAM %s] Stream closed. Reconnecting in 10s…", cam_id)
        time.sleep(10)  


def worker_heartbeat_thread():
    """Continuously pings Redis to indicate the AI Detection Engine is running."""
    import redis
    redis_host = os.environ.get("REDIS_HOST", "127.0.0.1")
    redis_pass = os.environ.get("REDIS_PASSWORD", None)
    
    while True:
        try:
            r = redis.Redis(host=redis_host, port=int(os.environ.get("CLOUD_REDIS_PORT", 6379)), password=redis_pass)
            # Set the heartbeat with a 15-second expiration
            r.set("worker_heartbeat", "active", ex=15)
        except Exception as e:
            log.warning("Heartbeat failed: %s", e)
        time.sleep(5)


def manual_override_listener():
    """Listens on Redis for manual override triggers from the dashboard."""
    import redis
    redis_host = os.environ.get("REDIS_HOST", "127.0.0.1")
    redis_pass = os.environ.get("REDIS_PASSWORD", None)
    
    while True:
        try:
            r = redis.Redis(host=redis_host, port=int(os.environ.get("CLOUD_REDIS_PORT", 6379)), password=redis_pass)
            pubsub = r.pubsub()
            pubsub.subscribe("manual_override")
            log.info("Subscribed to Redis channel 'manual_override'.")
            
            for message in pubsub.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    cam_id = int(data["camera_id"])
                    behavior = data["behavior_type"]
                    user = data.get("user", "Unknown")
                    log.info(f"Received MANUAL OVERRIDE for Camera {cam_id}: {behavior} by {user}")
                    
                    try:
                        camera = Camera.objects.get(id=cam_id)
                        # Inject the detection with 100% confidence
                        # If a frame exists in the buffer, grab the latest one
                        frame_bgr = None
                        log.info(f"[DEBUG] _frame_buffers keys: {list(_frame_buffers.keys())}")
                        if cam_id in _frame_buffers:
                            log.info(f"[DEBUG] _frame_buffers[{cam_id}] len: {len(_frame_buffers[cam_id])}")
                            if len(_frame_buffers[cam_id]) > 0:
                                _, frame_bgr = _frame_buffers[cam_id][-1]
                                log.info(f"[DEBUG] frame_bgr acquired successfully (shape: {frame_bgr.shape if hasattr(frame_bgr, 'shape') else 'None'})")
                        else:
                            log.warning(f"[DEBUG] cam_id {cam_id} NOT IN _frame_buffers")
                        # Force a new alert by clearing any existing incident dedup state for this behavior
                        _incidents.pop((cam_id, behavior), None)
                        alert_id, sev, is_new = handle_detection(camera, behavior, 1.0, frame_bgr)
                        
                        if is_new:
                            # Push websocket event instantly so frontend sees it
                            push_detection(cam_id, camera.name, behavior, 1.0, sev, alert_id, frame_bgr)
                            
                            # Dispatch email in background
                            threading.Thread(
                                target=send_alert_email,
                                args=(camera.name, behavior, 1.0, sev, alert_id),
                                daemon=True
                            ).start()
                        
                        if is_new and cam_id in _frame_buffers:
                            from evidence.clip_recorder import record_evidence_clip_async
                            alert_obj = Alert.objects.get(id=alert_id)
                            duration = data.get("duration", 10)
                            real_fps = _camera_fps.get(cam_id, 15.0)
                            # Call the async clip recorder with a lambda to fetch the current buffer
                            record_evidence_clip_async(camera, alert_obj, lambda: _frame_buffers.get(cam_id), real_fps, pre_roll_seconds=duration)
                    except Camera.DoesNotExist:
                        log.warning(f"Manual override requested for unknown Camera ID {cam_id}")
        except Exception as e:
            log.error(f"Redis manual_override listener error: {e}")
            time.sleep(5)

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    import argparse
    parser = argparse.ArgumentParser(description="SmartGuard AI Detection Worker")
    parser.add_argument("--camera-id", type=int, default=None, help="Specific camera ID to process (runs all if not set)")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("SmartGuard AI Detection Worker starting...")
    if args.camera_id:
        log.info(f"TARGETING ONLY CAMERA ID: {args.camera_id}")
    log.info("=" * 60)
    # Pre-load model before spawning threads
    get_model()

    # Start Redis manual override listener thread
    rt = threading.Thread(target=manual_override_listener, daemon=True, name="redis-manual-override")
    rt.start()

    # Start Worker Heartbeat thread
    hb_t = threading.Thread(target=worker_heartbeat_thread, daemon=True, name="redis-heartbeat")
    hb_t.start()

    # Start Async Redis Publisher thread
    pub_t = threading.Thread(target=redis_publisher_thread, daemon=True, name="redis-async-publisher")
    pub_t.start()

    log.info("Detection worker is running! It will automatically detect new cameras added to the dashboard.")
    if TEST_VIDEO_PATH:
        log.info("Video is looping — press Q in the preview window or Ctrl+C to stop.")

    active_threads = {}

    try:
        while True:
            # Query the database for active cameras
            qs = Camera.objects.filter(is_active=True).exclude(rtsp_url="")
            if args.camera_id:
                qs = qs.filter(id=args.camera_id)
            
            current_cameras = {cam.id: cam for cam in qs}

            # Spawn threads for any NEW cameras that don't have a running thread
            for cam_id, cam in current_cameras.items():
                if cam_id not in active_threads or not active_threads[cam_id].is_alive():
                    t = threading.Thread(
                        target=camera_worker,
                        args=(cam,),
                        name=f"worker-cam-{cam.id}",
                        daemon=True,
                    )
                    t.start()
                    active_threads[cam_id] = t
                    log.info("Started new detection thread for camera: [%s] %s", cam.id, cam.name)

            # Optional: Clean up dead threads from the tracking dictionary
            dead_cams = [cid for cid, t in active_threads.items() if not t.is_alive()]
            for cid in dead_cams:
                del active_threads[cid]

            time.sleep(10)  # Check for new cameras every 10 seconds

    except KeyboardInterrupt:
        log.info("Shutdown requested. Stopping workers…")


if __name__ == "__main__":
    main()