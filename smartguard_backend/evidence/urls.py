# evidence/urls.py

from django.urls import path
from .views import (
    EvidenceListView,
    EvidenceDetailView,
    evidence_download,
    evidence_verify,
)

urlpatterns = [
    path("evidence/", EvidenceListView.as_view(), name="evidence-list"),
    path("evidence/<int:pk>/", EvidenceDetailView.as_view(), name="evidence-detail"),
    path("evidence/<int:pk>/download/", evidence_download, name="evidence-download"),
    path("evidence/<int:pk>/verify/", evidence_verify, name="evidence-verify"),
]
