from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        return (
            Notification.objects.filter(recipient=self.request.user)
            .select_related("actor", "board", "list", "note")
            .order_by("-created_at", "-id")
        )

    def perform_update(self, serializer):
        is_read = serializer.validated_data.get("is_read")
        notification = serializer.instance
        if is_read is True and not notification.read_at:
            serializer.save(read_at=timezone.now())
        elif is_read is False:
            serializer.save(read_at=None)
        else:
            serializer.save()

    @action(detail=False, methods=["patch"], url_path="mark-all-read")
    def mark_all_read(self, request):
        updated = (
            self.get_queryset()
            .filter(is_read=False)
            .update(is_read=True, read_at=timezone.now())
        )
        return Response({"updated": updated}, status=status.HTTP_200_OK)
