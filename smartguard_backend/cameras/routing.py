from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(
        r"^ws/cameras/(?P<camera_id>\d+)/detections/$",
        consumers.CameraDetectionConsumer.as_asgi(),
    ),
    re_path(
        r"^ws/alerts/$",
        consumers.GlobalAlertConsumer.as_asgi(),
    ),
]   