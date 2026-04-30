from django.urls import path
from .views import AlertListView, AlertDetailView,DetectionAlertCreateView

urlpatterns = [
    path('alerts/', AlertListView.as_view(), name='alert_list'),
    path('alerts/<int:pk>/', AlertDetailView.as_view(), name='alert_detail'),
    path('alerts/detections/', DetectionAlertCreateView.as_view(), name='detection_alert_create'),
]
