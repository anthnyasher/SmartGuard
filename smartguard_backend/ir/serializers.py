# ir/serializers.py

from rest_framework import serializers
from .models import IncidentReport


class IncidentReportSerializer(serializers.ModelSerializer):
    responder_name = serializers.SerializerMethodField()
    alert_id = serializers.IntegerField(source="alert.id", read_only=True)
    camera_name = serializers.CharField(source="alert.camera.name", read_only=True)
    behavior_type = serializers.CharField(source="alert.behavior_type", read_only=True)
    severity = serializers.CharField(source="alert.severity", read_only=True)

    class Meta:
        model = IncidentReport
        fields = [
            "id",
            "alert",
            "alert_id",
            "camera_name",
            "behavior_type",
            "severity",
            "responder",
            "responder_name",
            "action_taken",
            "status",
            "description",
            "notes",
            "external_reference",
            "created_at",
            "updated_at",
            "resolved_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_responder_name(self, obj):
        if obj.responder:
            name = f"{obj.responder.first_name} {obj.responder.last_name}".strip()
            return name or obj.responder.username
        return "Unassigned"


class IncidentReportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = IncidentReport
        fields = [
            "alert",
            "action_taken",
            "status",
            "description",
            "notes",
            "external_reference",
        ]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["responder"] = request.user
        return super().create(validated_data)
