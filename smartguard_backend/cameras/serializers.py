from rest_framework import serializers
from django.conf import settings
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
        
        # Dynamically set status to OFFLINE if heartbeat is older than 60 seconds
        from django.utils import timezone
        import datetime
        if ret.get("status") == "ONLINE" and instance.last_heartbeat:
            now = timezone.now()
            if (now - instance.last_heartbeat).total_seconds() > 60:
                ret["status"] = "OFFLINE"
        elif ret.get("status") == "ONLINE" and not instance.last_heartbeat:
             ret["status"] = "OFFLINE"

        # Hide rtsp_url from non-admins to prevent internal IP leakage
        request = self.context.get('request')
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            if getattr(request.user, 'role', '') != 'ADMIN':
                ret.pop('rtsp_url', None)

        # Auto-compute the MJPEG URL if left blank
        if not ret.get("stream_mjpeg_url") and ret.get("id"):
            base = getattr(settings, 'STREAM_BASE_URL', 'http://localhost:8001')
            ret["stream_mjpeg_url"] = f"{base}/api/cameras/{ret['id']}/stream/mjpeg/"
        return ret