from django.contrib import admin
from django.urls import include, path

from apps.mcp.framework.routing import urlpatterns as mcp_urlpatterns

urlpatterns = mcp_urlpatterns() + [
    path("admin/", admin.site.urls),
    path("api/", include("apps.tasks.urls")),
    path("api/", include("apps.notifications.urls")),
    path("auth/", include("apps.authentication.urls")),
]
