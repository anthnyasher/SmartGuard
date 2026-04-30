# cameras/models.py
from django.db import models


class Camera(models.Model):
    STATUS_CHOICES = [
        ("ONLINE",  "Online"),
        ("OFFLINE", "Offline"),
        ("ERROR",   "Error"),
    ]

    name            = models.CharField(max_length=255)
    rtsp_url        = models.CharField(max_length=500, blank=True)
    location        = models.CharField(max_length=255, blank=True)
    zone            = models.CharField(max_length=255, blank=True)
    is_active       = models.BooleanField(default=True)
    last_heartbeat  = models.DateTimeField(null=True, blank=True)
    status          = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="OFFLINE",
    )

    # ── Stream URLs ───────────────────────────────────────────────────────────
    # stream_mjpeg_url: URL that the React <img> tag points to for live video.
    # This is served by the WSGI server on port 8001 (not Daphne on 8000).
    #
    # For the local webcam camera, set this to:
    #   http://localhost:8001/api/cameras/<id>/stream/mjpeg/
    #
    # Leave blank for cameras that have no live stream configured.
    stream_mjpeg_url = models.CharField(max_length=500, blank=True, default="")

    def __str__(self):
        return f"{self.name} ({self.location})"