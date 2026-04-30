# smartguard_backend/asgi.py
#
# This file ONLY handles routing.
# The CameraDetectionConsumer lives in cameras/consumers.py — NOT here.

import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "smartguard_backend.settings")
django.setup()

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
import cameras.routing

django_asgi_app = get_asgi_application()

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(cameras.routing.websocket_urlpatterns)
    ),
})