"""Explicit local account links; the authorization service owns OAuth grants."""

from django.conf import settings
from django.db import models


class MCPIdentityLink(models.Model):
    issuer = models.URLField(max_length=255)
    subject = models.CharField(max_length=128)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["issuer", "subject"], name="unique_notoli_mcp_identity"
            )
        ]
