# cameras/urls.py
from . import views
from django.urls import path
from .views import (
    CameraListCreateView,
    CameraDetailView,
    camera_mjpeg_stream,
    camera_stream_status,   # ← add this
    
)

urlpatterns = [
    
    path('cameras/', CameraListCreateView.as_view(), name='camera_list_create'),
    path('cameras/<int:pk>/', CameraDetailView.as_view(), name='camera_detail'),
    path('cameras/<int:pk>/stream/mjpeg/', camera_mjpeg_stream, name='camera_mjpeg_stream'),
      path("cameras/<int:pk>/stream/mjpeg/",    views.camera_mjpeg_stream),  
     path('cameras/<int:pk>/stream/status/',   camera_stream_status,     name='camera_stream_status'),
]
