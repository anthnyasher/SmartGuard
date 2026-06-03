from django.urls import path
from .views import AlertListView, AlertDetailView, DetectionAlertCreateView, DashboardAnalyticsView, TriggerAlarmView, WeeklyReportView

urlpatterns = [
    path('alerts/', AlertListView.as_view(), name='alert_list'),
    path('alerts/analytics/', DashboardAnalyticsView.as_view(), name='alert_analytics'),
    path('alerts/<int:pk>/', AlertDetailView.as_view(), name='alert_detail'),
    path('alerts/<int:pk>/trigger-alarm/', TriggerAlarmView.as_view(), name='trigger_alarm'),
    path('alerts/detections/', DetectionAlertCreateView.as_view(), name='detection_alert_create'),
    path('reports/weekly/', WeeklyReportView.as_view(), name='weekly_report'),
]
