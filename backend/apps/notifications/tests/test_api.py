"""Recipient-scoped notification reads, updates, deletion and navigation context."""

from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Notification
from .helpers import NotificationFixture


class NotificationApiTests(NotificationFixture, APITestCase):
    def test_notifications_are_limited_to_recipient(self):
        owner_notification = Notification.objects.create(
            recipient=self.owner,
            actor=self.collaborator,
            board=self.board,
            event_type=Notification.EVENT_TASK_UPDATED,
            title="Owner notification",
            message="Visible to owner.",
        )
        Notification.objects.create(
            recipient=self.outsider,
            actor=self.owner,
            board=self.board,
            event_type=Notification.EVENT_TASK_UPDATED,
            title="Outsider notification",
            message="Hidden from owner.",
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get("/api/notifications/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [task["id"] for task in response.data], [owner_notification.id]
        )

    def test_user_can_mark_own_notification_read(self):
        notification = Notification.objects.create(
            recipient=self.owner,
            actor=self.collaborator,
            board=self.board,
            event_type=Notification.EVENT_TASK_UPDATED,
            title="Owner notification",
            message="Visible to owner.",
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/notifications/{notification.id}/",
            {"is_read": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        notification.refresh_from_db()
        self.assertTrue(notification.is_read)
        self.assertIsNotNone(notification.read_at)

    def test_user_cannot_mark_another_users_notification_read(self):
        notification = Notification.objects.create(
            recipient=self.outsider,
            actor=self.owner,
            board=self.board,
            event_type=Notification.EVENT_TASK_UPDATED,
            title="Outsider notification",
            message="Hidden from owner.",
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/notifications/{notification.id}/",
            {"is_read": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.data)
        notification.refresh_from_db()
        self.assertFalse(notification.is_read)

    def test_user_can_clear_own_notification(self):
        notification = Notification.objects.create(
            recipient=self.owner,
            actor=self.collaborator,
            board=self.board,
            event_type=Notification.EVENT_TASK_UPDATED,
            title="Owner notification",
            message="Visible to owner.",
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(f"/api/notifications/{notification.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Notification.objects.filter(pk=notification.id).exists())

    def test_user_cannot_clear_another_users_notification(self):
        notification = Notification.objects.create(
            recipient=self.outsider,
            actor=self.owner,
            board=self.board,
            event_type=Notification.EVENT_TASK_UPDATED,
            title="Outsider notification",
            message="Hidden from owner.",
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(f"/api/notifications/{notification.id}/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND, response.data)
        self.assertTrue(Notification.objects.filter(pk=notification.id).exists())

    def test_notification_api_returns_navigation_context(self):
        notification = Notification.objects.create(
            recipient=self.owner,
            actor=self.collaborator,
            board=self.board,
            list=self.list,
            task=self.task,
            event_type=Notification.EVENT_TASK_COMPLETED,
            title="Task completed",
            message="Shared Task was completed.",
            target_path=f"/board/{self.board.id}/list/{self.list.id}",
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get("/api/notifications/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data[0]["id"], notification.id)
        self.assertEqual(response.data[0]["board_name"], "Shared Board")
        self.assertEqual(response.data[0]["list_name"], "Shared List")
        self.assertEqual(response.data[0]["event_type"], "task_completed")
        self.assertEqual(response.data[0]["task"], self.task.pk)
        self.assertEqual(response.data[0]["task_text"], "Shared Task")
        self.assertNotIn("note", response.data[0])
        self.assertNotIn("note_text", response.data[0])
        self.assertEqual(
            response.data[0]["target_path"],
            f"/board/{self.board.id}/list/{self.list.id}",
        )

    def test_notification_writes_reject_old_task_fields_before_changing_read_status(
        self,
    ):
        notification = Notification.objects.create(
            recipient=self.owner,
            task=self.task,
            event_type=Notification.EVENT_TASK_UPDATED,
            title="Task updated",
        )
        self.client.force_authenticate(user=self.owner)

        for payload in ({"note": self.task.pk}, {"note_text": "Old", "is_read": True}):
            with self.subTest(payload=payload):
                response = self.client.patch(
                    f"/api/notifications/{notification.pk}/", payload, format="json"
                )
                self.assertEqual(
                    response.status_code, status.HTTP_400_BAD_REQUEST, response.data
                )

        bulk_response = self.client.patch(
            "/api/notifications/mark-all-read/", {"note": self.task.pk}, format="json"
        )
        self.assertEqual(
            bulk_response.status_code, status.HTTP_400_BAD_REQUEST, bulk_response.data
        )
        notification.refresh_from_db()
        self.assertFalse(notification.is_read)
