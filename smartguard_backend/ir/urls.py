# ir/urls.py

from django.urls import path
from .views import IncidentReportListCreateView, IncidentReportDetailView, IncidentCountsView

urlpatterns = [
    path("incidents/counts/", IncidentCountsView.as_view(), name="incident-counts"),
    path("incidents/", IncidentReportListCreateView.as_view(), name="incident-list-create"),
    path("incidents/<int:pk>/", IncidentReportDetailView.as_view(), name="incident-detail"),
]
