from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import time

channel_layer = get_channel_layer()

def publish_fake_detection(camera_id=4):
    data = {
        "camera_id": camera_id,
        "timestamp": time.time(),
        "detections": [
            { "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4, "label": "person", "conf": 0.92 },
        ],
    }

    async_to_sync(channel_layer.group_send)(
        f"camera_{camera_id}",      # must match self.group_name
        {
            "type": "detection_message",
            "data": data,
        },
    )
