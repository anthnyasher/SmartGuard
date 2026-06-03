from django.urls import path
from .views import AlertListView, AlertDetailView, DetectionAlertCreateView, DashboardAnalyticsView, TriggerAlarmView, WeeklyReportView, ManualAlertCreateView

urlpatterns = [
    path('alerts/', AlertListView.as_view(), name='alert_list'),
    path('alerts/<int:pk>/', AlertDetailView.as_view(), name='alert_detail'),
    path('alerts/create-from-detection/', DetectionAlertCreateView.as_view(), name='alert_create_detection'),
    path('alerts/manual-override/', ManualAlertCreateView.as_view(), name='alert_manual_override'),
    path('alerts/analytics/', DashboardAnalyticsView.as_view(), name='alert_analytics'),
    path('alerts/<int:pk>/trigger-alarm/', TriggerAlarmView.as_view(), name='alert_trigger_alarm'),
    path('reports/weekly/', WeeklyReportView.as_view(), name='weekly_report'),
]
