# evidence/urls.py

from django.urls import path
from .views import (
    EvidenceListView,
    EvidenceDetailView,
    evidence_download,
    evidence_stream,
    evidence_verify,
    evidence_review,
    evidence_stats,
)

urlpatterns = [
    path("evidence/", EvidenceListView.as_view(), name="evidence-list"),
    path("evidence/stats/", evidence_stats, name="evidence-stats"),
    path("evidence/<int:pk>/", EvidenceDetailView.as_view(), name="evidence-detail"),
    path("evidence/<int:pk>/download/", evidence_download, name="evidence-download"),
    path("evidence/<int:pk>/stream/", evidence_stream, name="evidence-stream"),
    path("evidence/<int:pk>/verify/", evidence_verify, name="evidence-verify"),
    path("evidence/<int:pk>/review/", evidence_review, name="evidence-review"),
]
