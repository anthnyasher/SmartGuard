# config/urls.py

from django.urls import path
from .views import SystemConfigView

urlpatterns = [
    path("settings/", SystemConfigView.as_view(), name="system-config"),
]
