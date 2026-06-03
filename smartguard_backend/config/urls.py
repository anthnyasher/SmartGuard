# config/urls.py

from django.urls import path
from .views import (
    SystemConfigView, SystemHealthView, 
    BackupHistoryView, BackupTriggerView, BackupRestoreView
)

urlpatterns = [
    path("settings/", SystemConfigView.as_view(), name="system-config"),
    path("system/health/", SystemHealthView.as_view(), name="system-health"),
    path("backup/history/", BackupHistoryView.as_view(), name="backup-history"),
    path("backup/trigger/", BackupTriggerView.as_view(), name="backup-trigger"),
    path("backup/restore/", BackupRestoreView.as_view(), name="backup-restore"),
]
