from django.urls import path
from .views import AuditLogListView, FailedLoginCountView

app_name = 'logging_info'
urlpatterns = [
    path("logs/", AuditLogListView.as_view(), name="audit-log-list"),
    path("logs/failed_logins/", FailedLoginCountView.as_view(), name="failed-logins"),
]