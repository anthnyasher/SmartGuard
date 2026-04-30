# evidence/serializers.py

from rest_framework import serializers
from .models import EvidenceClip


class EvidenceClipSerializer(serializers.ModelSerializer):
    clip_id = serializers.CharField(read_only=True)
    camera_id = serializers.IntegerField(source="alert.camera.id", read_only=True)
    camera_name = serializers.CharField(source="alert.camera.name", read_only=True)
    camera_location = serializers.CharField(source="alert.camera.location", read_only=True)
    behavior_type = serializers.CharField(read_only=True)
    severity = serializers.CharField(read_only=True)
    confidence = serializers.FloatField(source="alert.confidence", read_only=True)
    alert_status = serializers.CharField(source="alert.status", read_only=True)
    alert_id = serializers.IntegerField(source="alert.id", read_only=True)
    file_size_mb = serializers.FloatField(read_only=True)

    class Meta:
        model = EvidenceClip
        fields = [
            "id",
            "clip_id",
            "alert_id",
            "camera_id",
            "camera_name",
            "camera_location",
            "behavior_type",
            "severity",
            "confidence",
            "alert_status",
            "duration_seconds",
            "file_size_bytes",
            "file_size_mb",
            "resolution",
            "fps",
            "sha256_hash",
            "integrity_status",
            "last_verified_at",
            "status",
            "created_at",
            "expires_at",
        ]
        read_only_fields = fields
