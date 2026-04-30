# logging_info/serializers.py

from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    # Surface the display labels (not just the raw codes)
    action_display   = serializers.CharField(source="get_action_display",   read_only=True)
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    level_display    = serializers.CharField(source="get_level_display",    read_only=True)

    class Meta:
        model  = AuditLog
        fields = [
            "id",
            "user",
            "username",
            "ip_address",
            "user_agent",
            "device_info",
            "category",
            "category_display",
            "level",
            "level_display",
            "action",
            "action_display",
            "message",
            "source",
            "extra",
            "timestamp",
        ]
        read_only_fields = fields