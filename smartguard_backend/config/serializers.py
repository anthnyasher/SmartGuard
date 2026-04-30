# config/serializers.py

from rest_framework import serializers
from .models import SystemConfig


class SystemConfigSerializer(serializers.ModelSerializer):
    """
    Serializes ALL settings page sections into a flat representation.
    The frontend can group them into tabs as needed.
    """

    class Meta:
        model = SystemConfig
        exclude = ["id"]
        read_only_fields = ["updated_at"]
