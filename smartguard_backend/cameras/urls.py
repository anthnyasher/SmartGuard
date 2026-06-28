# cameras/urls.py
from . import views
from django.urls import path
from .views import (
    CameraListCreateView,
    CameraDetailView,
    camera_mjpeg_stream,
    camera_stream_status,
    request_camera_access,
    list_access_requests,
    approve_access_request,
    deny_access_request,
    check_my_access,
)

urlpatterns = [
    path('cameras/', CameraListCreateView.as_view(), name='camera_list_create'),
    path('cameras/<int:pk>/', CameraDetailView.as_view(), name='camera_detail'),
    path('cameras/<int:pk>/stream/mjpeg/', camera_mjpeg_stream, name='camera_mjpeg_stream'),
    path('cameras/<int:pk>/stream/status/', camera_stream_status, name='camera_stream_status'),

    path('cameras/request-access/', request_camera_access, name='request_camera_access'),
    path('cameras/access-requests/', list_access_requests, name='list_access_requests'),
    path('cameras/access-requests/<int:pk>/approve/', approve_access_request, name='approve_access_request'),
    path('cameras/access-requests/<int:pk>/deny/', deny_access_request, name='deny_access_request'),
    path('cameras/my-access/', check_my_access, name='check_my_access'),
]
