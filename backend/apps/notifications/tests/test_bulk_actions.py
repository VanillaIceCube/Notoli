"""Bulk notification updates and deletion remain recipient-scoped."""

from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Notification
from .helpers import NotificationFixture


class NotificationBulkActionTests(NotificationFixture, APITestCase):
    def test_mark_all_read_only_updates_request_users_notifications(self):
        owner_notification = Notification.objects.create(
            recipient=self.owner,
            actor=self.collaborator,
            board=self.board,
            event_type=Notification.EVENT_TASK_UPDATED,
            title="Owner notification",
            message="Visible to owner.",
        )
        outsider_notification = Notification.objects.create(
            recipient=self.outsider,
            actor=self.owner,
            board=self.board,
            event_type=Notification.EVENT_TASK_UPDATED,
            title="Outsider notification",
            message="Hidden from owner.",
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch("/api/notifications/mark-all-read/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data, {"updated": 1})
        owner_notification.refresh_from_db()
        outsider_notification.refresh_from_db()
        self.assertTrue(owner_notification.is_read)
        self.assertFalse(outsider_notification.is_read)

    def test_clear_all_only_deletes_request_users_notifications(self):
        owner_notification = Notification.objects.create(
            recipient=self.owner,
            actor=self.collaborator,
            board=self.board,
            event_type=Notification.EVENT_TASK_UPDATED,
            title="Owner notification",
            message="Visible to owner.",
        )
        outsider_notification = Notification.objects.create(
            recipient=self.outsider,
            actor=self.owner,
            board=self.board,
            event_type=Notification.EVENT_TASK_UPDATED,
            title="Outsider notification",
            message="Hidden from owner.",
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.delete("/api/notifications/clear-all/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data, {"deleted": 1})
        self.assertFalse(Notification.objects.filter(pk=owner_notification.id).exists())
        self.assertTrue(
            Notification.objects.filter(pk=outsider_notification.id).exists()
        )

    def test_mark_all_read_and_clear_all_when_empty(self):
        self.client.force_authenticate(user=self.collaborator)
        self.client.delete("/api/notifications/clear-all/")

        mark_resp = self.client.patch("/api/notifications/mark-all-read/")
        self.assertEqual(mark_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(mark_resp.data["updated"], 0)

        clear_resp = self.client.delete("/api/notifications/clear-all/")
        self.assertEqual(clear_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(clear_resp.data["deleted"], 0)

    def test_bulk_actions_unauthenticated(self):
        mark_resp = self.client.patch("/api/notifications/mark-all-read/")
        self.assertEqual(mark_resp.status_code, status.HTTP_401_UNAUTHORIZED)

        clear_resp = self.client.delete("/api/notifications/clear-all/")
        self.assertEqual(clear_resp.status_code, status.HTTP_401_UNAUTHORIZED)
