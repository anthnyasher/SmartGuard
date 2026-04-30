from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static


urlpatterns = [
    path('admin/', admin.site.urls),
    path("api-auth/", include("rest_framework.urls")),
    path('api/', include('accounts.urls')),
    path('api/', include('cameras.urls')),
    path('api/', include('alerts.urls')),
    path("api/", include("logging_info.urls")),
    path("api/", include("evidence.urls")),
    path("api/", include("config.urls")),
    path("api/", include("ir.urls")),
]

# Serve media files (snapshots, evidence clips) during development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
