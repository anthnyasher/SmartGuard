# cameras/views.py

import time
import logging
import threading

import cv2
import redis

from django.http import StreamingHttpResponse, Http404, JsonResponse
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .serializers import CameraSerializer
from .models import Camera

log = logging.getLogger(__name__)

# ── Redis connection (shared with the detection worker) ────────────────────────
_redis = redis.Redis(host="127.0.0.1", port=6379)

# ── Camera CRUD ────────────────────────────────────────────────────────────────

class CameraListCreateView(generics.ListCreateAPIView):
    queryset           = Camera.objects.all().order_by('id')
    serializer_class   = CameraSerializer
    permission_classes = [IsAuthenticated]

class CameraDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset           = Camera.objects.all()
    serializer_class   = CameraSerializer
    permission_classes = [IsAuthenticated]


# ── Helper ─────────────────────────────────────────────────────────────────────

def _get_source(camera: Camera):
    rtsp = (camera.rtsp_url or "").strip()
    if rtsp.isdigit():
        return int(rtsp)
    return rtsp


# ── MJPEG generator — reads JPEG frames from Redis ────────────────────────────
# The detection worker publishes annotated JPEG bytes to Redis key
# "frame:<camera_id>" with a 5-second TTL.  This generator simply reads
# that key in a loop and yields MJPEG chunks.  It never opens a
# VideoCapture itself, so there is no webcam lock conflict.

STREAM_FPS = 15   # target FPS for the MJPEG stream

def _mjpeg_from_redis(cam_id):
    """
    Yield MJPEG chunks by reading pre-encoded JPEG bytes from Redis.
    The detection worker is the sole owner of the camera hardware.
    """
    empty_waits = 0
    interval    = 1.0 / STREAM_FPS

    while True:
        try:
            frame_bytes = _redis.get(f"frame:{cam_id}")
        except Exception as e:
            log.warning("[STREAM] Redis read error for cam %s: %s", cam_id, e)
            time.sleep(0.5)
            continue

        if frame_bytes is None:
            empty_waits += 1
            if empty_waits > 200:   # ~10s with no frames
                log.warning("[STREAM] Cam %s: no frames in Redis after 10s, giving up.", cam_id)
                return
            time.sleep(0.05)
            continue

        empty_waits = 0

        try:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(frame_bytes)).encode() + b"\r\n"
                b"\r\n" +
                frame_bytes +
                b"\r\n"
            )
        except GeneratorExit:
            log.info("[STREAM] Cam %s: client disconnected.", cam_id)
            return

        time.sleep(interval)


# ── MJPEG stream view ──────────────────────────────────────────────────────────

def camera_mjpeg_stream(request, pk):
    auth = JWTAuthentication()
    try:
        result = auth.authenticate(request)
        if result is None:
            return JsonResponse({"detail": "Authentication required."}, status=401)
    except AuthenticationFailed as e:
        return JsonResponse({"detail": str(e)}, status=401)
    except Exception:
        return JsonResponse({"detail": "Auth error."}, status=401)

    try:
        camera = Camera.objects.get(pk=pk, is_active=True)
    except Camera.DoesNotExist:
        raise Http404("Camera not found or inactive")

    source = _get_source(camera)
    if source == "" or (source != 0 and not source):
        return JsonResponse(
            {"detail": "No stream source configured for this camera."},
            status=404,
        )

    response = StreamingHttpResponse(
        _mjpeg_from_redis(camera.id),
        content_type="multipart/x-mixed-replace; boundary=frame",
    )
    response["Cache-Control"]                = "no-cache, no-store, must-revalidate"
    response["Pragma"]                       = "no-cache"
    response["Expires"]                      = "0"
    response["Access-Control-Allow-Origin"]  = "http://localhost:5173"
    response["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    return response


# ── Stream status check ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def camera_stream_status(request, pk):
    try:
        camera = Camera.objects.get(pk=pk)
    except Camera.DoesNotExist:
        raise Http404

    cam_id = camera.id
    # Check if the detection worker is publishing frames for this camera
    try:
        frame_data = _redis.get(f"frame:{cam_id}")
        reachable = frame_data is not None
    except Exception:
        reachable = False

    return Response({
        "camera_id": camera.id,
        "name":      camera.name,
        "reachable": reachable,
        "source":    str(_get_source(camera)),
    })