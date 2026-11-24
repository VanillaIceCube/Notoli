from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.tasks.views import RejectRetiredTaskFields

from . import services
from .serializers import NotificationSerializer


class NotificationViewSet(RejectRetiredTaskFields, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return services.notifications_for(self.request.user)

    def perform_update(self, serializer):
        serializer.instance = services.update_notification(
            self.request.user, serializer.validated_data, serializer.instance
        )

    def perform_destroy(self, instance):
        services.delete_notification(self.request.user, instance)

    @action(detail=False, methods=["patch"], url_path="mark-all-read")
    def mark_all_read(self, request):
        return Response({"updated": services.mark_all_read(request.user)})

    @action(detail=False, methods=["delete"], url_path="clear-all")
    def clear_all(self, request):
        return Response({"deleted": services.clear_all(request.user)})
