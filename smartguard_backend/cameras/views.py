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

from django.conf import settings

# ── Redis connection (shared with the detection worker) ────────────────────────
_redis = redis.Redis(
    host=getattr(settings, 'CLOUD_REDIS_HOST', '127.0.0.1'),
    port=getattr(settings, 'CLOUD_REDIS_PORT', 6379),
    password=getattr(settings, 'CLOUD_REDIS_PASSWORD', None)
)

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

STREAM_FPS = 30   # target FPS for the MJPEG stream (matches detection_worker PUBLISH_FPS)

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
    response["Access-Control-Allow-Origin"]  = "*"
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
# -- Access Requests (Staff Workflow) ------------------------------------------

from accounts.models import CameraAccessRequest
from django.utils import timezone
from datetime import timedelta

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_camera_access(request):
    """Staff requests temporary CCTV access."""
    if request.user.role != "STAFF":
        return Response({"error": "Only staff can request access"}, status=403)
    
    active = CameraAccessRequest.objects.filter(
        staff_user=request.user, 
        status__in=["PENDING", "APPROVED"]
    ).first()
    
    if active:
        if active.is_active():
            return Response({"error": "You already have active access"}, status=400)
        elif active.status == "PENDING":
            if timezone.now() > active.requested_at + timedelta(minutes=5):
                active.status = "EXPIRED"
                active.save()
            else:
                return Response({"error": "You already have a pending request"}, status=400)

    req = CameraAccessRequest.objects.create(staff_user=request.user)

    # Log the action
    from logging_info.utils import log_audit
    log_audit(
        action="CAMERA_ACCESS_REQUESTED",
        message=f"{request.user.username} requested temporary camera access",
        category="SECURITY",
        level="INFO",
        user=request.user,
        request=request,
    )

    return Response({"message": "Access requested", "id": req.id})

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_access_requests(request):
    """Manager views pending access requests."""
    if request.user.role not in ["ADMIN", "OPS_MANAGER"]:
        return Response({"error": "Unauthorized"}, status=403)
    
    expiry_time = timezone.now() - timedelta(minutes=5)
    CameraAccessRequest.objects.filter(status="PENDING", requested_at__lt=expiry_time).update(status="EXPIRED")
    
    pending = CameraAccessRequest.objects.filter(status="PENDING").order_by("-requested_at")
    data = []
    for p in pending:
        data.append({
            "id": p.id,
            "camera_id": None,
            "staff_id": p.staff_user.id,
            "staff_name": p.staff_user.username,
            "requested_at": p.requested_at,
            "status": p.status,
        })
    return Response(data)

from logging_info.utils import log_audit

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def approve_access_request(request, pk):
    """Manager approves a request, granting 30-minute access."""
    if request.user.role not in ["ADMIN", "OPS_MANAGER"]:
        return Response({"error": "Unauthorized"}, status=403)
    
    try:
        req = CameraAccessRequest.objects.get(pk=pk, status="PENDING")
    except CameraAccessRequest.DoesNotExist:
        return Response({"error": "Request not found or already processed"}, status=404)
        
    req.status = "APPROVED"
    req.expires_at = timezone.now() + timedelta(minutes=30)
    req.save()

    # Log the action
    log_audit(
        action="CAMERA_ACCESS_GRANTED",
        message=f"{request.user.username} granted 30-minute camera access to {req.staff_user.username}",
        category="SECURITY",
        level="INFO",
        user=request.user,
        request=request,
    )

    return Response({"message": "Access granted for 30 minutes"})

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def deny_access_request(request, pk):
    """Manager denies a request."""
    if request.user.role not in ["ADMIN", "OPS_MANAGER"]:
        return Response({"error": "Unauthorized"}, status=403)
    
    try:
        req = CameraAccessRequest.objects.get(pk=pk, status="PENDING")
    except CameraAccessRequest.DoesNotExist:
        return Response({"error": "Request not found or already processed"}, status=404)
        
    req.status = "DENIED"
    req.save()

    # Log the action
    log_audit(
        action="CAMERA_ACCESS_DENIED",
        message=f"{request.user.username} denied camera access to {req.staff_user.username}",
        category="SECURITY",
        level="INFO",
        user=request.user,
        request=request,
    )

    return Response({"message": "Access denied"})

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def check_my_access(request):
    """Staff checks if they have active access."""
    active = CameraAccessRequest.objects.filter(
        staff_user=request.user, 
        status="APPROVED"
    ).order_by("-expires_at").first()
    
    if active and active.is_active():
        return Response({
            "has_access": True,
            "expires_at": active.expires_at
        })
        
    pending = CameraAccessRequest.objects.filter(
        staff_user=request.user, 
        status="PENDING"
    ).first()
    
    if pending:
        if timezone.now() > pending.requested_at + timedelta(minutes=5):
            pending.status = "EXPIRED"
            pending.save()
            return Response({"has_access": False, "status": "EXPIRED"})
        return Response({"has_access": False, "status": "PENDING", "requested_at": pending.requested_at})
        
    return Response({"has_access": False, "status": "NONE"})

