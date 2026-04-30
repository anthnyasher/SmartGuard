# cameras/consumers.py
#
# Responsibilities:
#   - Accept WebSocket connections from the React dashboard
#   - Join a per-camera channel group
#   - Forward detection events pushed by the AI worker to the connected client
#   - Handle disconnect cleanly
#
# The consumer does NOT run YOLOv5, does NOT read RTSP, does NOT touch OpenCV.
# It only relays messages that the AI worker sends via channel_layer.group_send().

import json
import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger(__name__)


class CameraDetectionConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket endpoint: ws://localhost:8000/ws/cameras/<camera_id>/detections/

    Message format sent to the client:
    {
        "type":          "detection",
        "camera_id":     4,
        "camera_name":   "Entrance CAM-01",
        "behavior_type": "SHOPLIFTING",
        "confidence":    0.91,
        "severity":      "HIGH",
        "alert_id":      123,
        "timestamp":     "2026-02-25T10:30:00Z",
        "frame_jpg_b64": "<base64-encoded annotated JPEG>" // optional
    }
    """

    # ── Connect ────────────────────────────────────────────────────────────
    async def connect(self):
        self.camera_id  = self.scope["url_route"]["kwargs"]["camera_id"]
        self.group_name = f"camera_{self.camera_id}"

        # ── Auth check: only authenticated users may connect ──────────────
        # AuthMiddlewareStack in asgi.py populates scope["user"] via JWT
        # For simplicity in dev, allow all; in production enforce this.
        user = self.scope.get("user")
        if user is None or isinstance(user, AnonymousUser):
            # Uncomment below to enforce auth in production:
            # await self.close(code=4001)
            # return
            logger.warning("Unauthenticated WebSocket connection for camera %s", self.camera_id)

        # Join the per-camera group so the AI worker can broadcast to us
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        logger.info("WebSocket connected: camera=%s group=%s", self.camera_id, self.group_name)

        # Send a welcome/status frame so the client knows the WS is live
        await self.send_json({
            "type":      "connected",
            "camera_id": int(self.camera_id),
            "message":   f"Subscribed to detections for camera {self.camera_id}",
        })

    # ── Disconnect ─────────────────────────────────────────────────────────
    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info("WebSocket disconnected: camera=%s code=%s", self.camera_id, close_code)

    # ── Receive (messages FROM the client — not used but required) ─────────
    async def receive_json(self, content):
        # Dashboard doesn't send commands for now.
        # Could be extended to send "start_detection" / "stop_detection" commands.
        pass

    # ── Handler: called when AI worker does group_send(type="detection.event") ──
    async def detection_event(self, event):
        """
        Called by the channel layer when the AI worker sends:
            await channel_layer.group_send(
                f"camera_{camera_id}",
                {"type": "detection.event", ...payload...}
            )
        Channels converts "detection.event" → "detection_event" method name.
        """
        # Forward the payload directly to the React client
        await self.send_json({
            "type":          "detection",
            "camera_id":     event.get("camera_id"),
            "camera_name":   event.get("camera_name"),
            "behavior_type": event.get("behavior_type"),
            "confidence":    event.get("confidence"),
            "severity":      event.get("severity"),
            "alert_id":      event.get("alert_id"),
            "timestamp":     event.get("timestamp"),
            "frame_jpg_b64": event.get("frame_jpg_b64"),  # annotated frame, may be None
        })

    # ── Handler: heartbeat ping from worker ────────────────────────────────
    async def worker_heartbeat(self, event):
        """
        The AI worker sends a heartbeat every 30s so the dashboard knows
        the worker is alive even when there are no detections.
        """
        await self.send_json({
            "type":      "heartbeat",
            "camera_id": event.get("camera_id"),
            "timestamp": event.get("timestamp"),
            "fps":       event.get("fps"),
        })


class GlobalAlertConsumer(AsyncJsonWebsocketConsumer):
    """
    ws://localhost:8000/ws/alerts/
    All authenticated users connect here to receive new alert notifications
    regardless of which camera triggered them.
    """
    GROUP_NAME = "alerts_global"

    async def connect(self):
        await self.channel_layer.group_add(self.GROUP_NAME, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connected", "message": "Subscribed to global alerts"})

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.GROUP_NAME, self.channel_name)

    async def receive_json(self, content):
        pass

    async def new_alert(self, event):
        await self.send_json(event)