import base64
import os

from rest_framework import serializers
from django.utils import timezone
from .models import Alert
from cameras.models import Camera


class DetectionAlertInputSerializer(serializers.Serializer):
    camera_id = serializers.IntegerField()
    behavior_type = serializers.CharField()
    confidence = serializers.FloatField()
    severity = serializers.ChoiceField(choices=["LOW", "MEDIUM", "HIGH", "CRITICAL"])
    alert_category = serializers.CharField()  # e.g., "SHOPLIFTING"

    def create(self, validated_data):
        camera_id = validated_data.pop("camera_id")
        camera = Camera.objects.get(id=camera_id)

        alert = Alert.objects.create(
            camera=camera,
            **validated_data,
            status="NEW",
        )
        return alert
class AlertSerializer(serializers.ModelSerializer):
    frame_jpg_b64 = serializers.SerializerMethodField()
    camera_name   = serializers.CharField(source='camera.name', read_only=True)
    camera_location = serializers.CharField(source='camera.location', read_only=True)
    camera_zone   = serializers.CharField(source='camera.zone', read_only=True)

    class Meta:
        model = Alert
        fields = [
            'id',
            'camera',
            'camera_name',
            'camera_location',
            'camera_zone',
            'behavior_type',
            'confidence',
            'severity',
            'status',
            'alert_category',
            'created_at',
            'reviewed_by',
            'reviewed_at',
            'notes',
            'assigned_to',
            'frame_jpg_b64',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'reviewed_by',
            'reviewed_at',
        ]

    def get_frame_jpg_b64(self, obj):
        """Read the snapshot JPEG from disk and return as base64 string."""
        if not obj.snapshot:
            return None
        try:
            path = obj.snapshot.path
            if not os.path.exists(path):
                return None
            with open(path, "rb") as f:
                return base64.b64encode(f.read()).decode()
        except Exception:
            return None

    def update(self, instance, validated_data):
        request = self.context.get("request")
        if request is None or not hasattr(request, "user"):
            raise serializers.ValidationError(
                {"detail": "Request user is required."}
            )

        user = request.user

        # If Staff, only allow notes
        if user.role == "STAFF":
            allowed_fields = {'notes'}
            for field in list(validated_data.keys()):
                if field not in allowed_fields:
                    raise serializers.ValidationError(
                        {"detail": "Staff can only add notes to alerts."}
                    )

            if 'notes' in validated_data:
                instance.notes = validated_data['notes']

            instance.save()
            return instance

        # Non‑Staff (Admin / Operations Manager) – full update

        return super().update(instance, validated_data)
