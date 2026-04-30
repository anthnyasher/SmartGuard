from rest_framework import serializers
from .models import Camera

class CameraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Camera
        fields = [
            "id", "name", "rtsp_url", "location", "zone",
            "is_active", "last_heartbeat", "status", "stream_mjpeg_url",
        ]
        read_only_fields = ["id", "last_heartbeat", "status"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Auto-compute the MJPEG URL if left blank
        if not ret.get("stream_mjpeg_url") and ret.get("id"):
            ret["stream_mjpeg_url"] = f"http://localhost:8001/api/cameras/{ret['id']}/stream/mjpeg/"
        return ret