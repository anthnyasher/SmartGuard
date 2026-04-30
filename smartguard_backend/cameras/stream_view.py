# cameras/stream_view.py
#
# Serves a live MJPEG stream from a camera's RTSP URL (or webcam index).
# The browser's <img src="http://localhost:8000/api/cameras/<id>/stream/" />
# will display a live video feed using this endpoint.
#
# This is a SEPARATE connection from detection_worker.py.
# Two things read the camera simultaneously:
#   1. detection_worker.py  — for YOLOv5 inference
#   2. This view            — for browser display
# Most IP cameras and webcams support multiple concurrent readers.

import cv2
import logging
from django.http import StreamingHttpResponse, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from .models import Camera

logger = logging.getLogger(__name__)


def _parse_source(rtsp_url: str):
    """
    Returns the correct OpenCV capture source.
    - If rtsp_url is a digit string like "0" or "1" → webcam index (int)
    - Otherwise → treat as RTSP/HTTP URL string
    """
    if rtsp_url and rtsp_url.strip().isdigit():
        return int(rtsp_url.strip())
    return rtsp_url


def _mjpeg_generator(source, quality: int = 70):
    """
    Generator that yields MJPEG frames as a multipart HTTP stream.
    Runs inside the Django response — one generator per connected browser tab.
    """
    cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        logger.error("MJPEG stream: cannot open source: %s", source)
        return

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                logger.warning("MJPEG stream: frame read failed for source: %s", source)
                break

            # Encode frame as JPEG
            encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
            ret_enc, jpeg = cv2.imencode(".jpg", frame, encode_params)
            if not ret_enc:
                continue

            # Yield as one MJPEG part
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + jpeg.tobytes()
                + b"\r\n"
            )
    except GeneratorExit:
        # Browser disconnected — clean up
        logger.info("MJPEG stream: client disconnected from source: %s", source)
    finally:
        cap.release()


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def camera_stream(request, camera_id):
    """
    GET /api/cameras/<camera_id>/stream/

    Returns a live MJPEG stream for the given camera.
    Used as the src for <img> in the Live Monitoring dashboard.

    The camera's rtsp_url field can be:
      - "0"                          → laptop/USB webcam (index 0)
      - "1"                          → second webcam
      - "rtsp://user:pass@192.168.x.x:554/stream1"  → IP camera RTSP
    """
    camera = get_object_or_404(Camera, pk=camera_id, is_active=True)

    if not camera.rtsp_url:
        return HttpResponse("No stream URL configured for this camera.", status=404)

    source = _parse_source(camera.rtsp_url)

    response = StreamingHttpResponse(
        _mjpeg_generator(source),
        content_type="multipart/x-mixed-replace; boundary=frame",
    )
    # Prevent caching
    response["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response["Pragma"]        = "no-cache"
    response["Expires"]       = "0"
    return response