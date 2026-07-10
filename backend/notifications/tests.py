from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from notes.models import Board, List, Note

from .models import Notification

User = get_user_model()


class NotificationApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner_email@example.com",
            password="owner-password",
        )
        self.collaborator = User.objects.create_user(
            username="collaborator",
            email="collaborator_email@example.com",
            password="collaborator-password",
        )
        self.other_collaborator = User.objects.create_user(
            username="other_collaborator",
            email="other_collaborator@example.com",
            password="other-password",
        )
        self.outsider = User.objects.create_user(
            username="outsider",
            email="outsider_email@example.com",
            password="outsider-password",
        )
        self.board = Board.objects.create(
            name="Shared Board",
            description="Shared Board Description",
            created_by=self.owner,
        )
        self.board.collaborators.add(self.collaborator, self.other_collaborator)
        self.list = List.objects.create(
            name="Shared List",
            description="Shared List Description",
            board=self.board,
            created_by=self.owner,
        )
        self.note = Note.objects.create(
            note="Shared Note",
            description="Shared Note Description",
            board=self.board,
            created_by=self.owner,
        )
        self.list.notes.add(self.note)

    def test_notifications_are_limited_to_recipient(self):
        owner_notification = Notification.objects.create(
            recipient=self.owner,
            actor=self.collaborator,
            board=self.board,
            event_type=Notification.EVENT_NOTE_UPDATED,
            title="Owner notification",
            message="Visible to owner.",
        )
        Notification.objects.create(
            recipient=self.outsider,
            actor=self.owner,
            board=self.board,
            event_type=Notification.EVENT_NOTE_UPDATED,
            title="Outsider notification",
            message="Hidden from owner.",
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.get("/api/notifications/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [item["id"] for item in response.data], [owner_notification.id]
        )

    def test_user_can_mark_own_notification_read(self):
        notification = Notification.objects.create(
            recipient=self.owner,
            actor=self.collaborator,
            board=self.board,
            event_type=Notification.EVENT_NOTE_UPDATED,
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
            event_type=Notification.EVENT_NOTE_UPDATED,
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

    def test_mark_all_read_only_updates_request_users_notifications(self):
        owner_notification = Notification.objects.create(
            recipient=self.owner,
            actor=self.collaborator,
            board=self.board,
            event_type=Notification.EVENT_NOTE_UPDATED,
            title="Owner notification",
            message="Visible to owner.",
        )
        outsider_notification = Notification.objects.create(
            recipient=self.outsider,
            actor=self.owner,
            board=self.board,
            event_type=Notification.EVENT_NOTE_UPDATED,
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

    def test_adding_collaborator_creates_notification_for_added_user(self):
        new_collaborator = User.objects.create_user(
            username="new_collaborator",
            email="new_collaborator@example.com",
            password="new-password",
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            f"/api/boards/{self.board.id}/collaborators/",
            {"identifier": new_collaborator.email},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        notification = Notification.objects.get(recipient=new_collaborator)
        self.assertEqual(notification.actor, self.owner)
        self.assertEqual(notification.event_type, Notification.EVENT_COLLABORATOR_ADDED)
        self.assertEqual(notification.board, self.board)
        self.assertEqual(notification.board_name, self.board.name)

    def test_adding_collaborator_notifies_existing_board_members(self):
        new_collaborator = User.objects.create_user(
            username="new_collaborator",
            email="new_collaborator@example.com",
            password="new-password",
        )

        self.client.force_authenticate(user=self.owner)
        response = self.client.post(
            f"/api/boards/{self.board.id}/collaborators/",
            {"identifier": new_collaborator.email},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        notifications = Notification.objects.filter(
            event_type=Notification.EVENT_COLLABORATOR_ADDED
        )
        self.assertTrue(notifications.filter(recipient=new_collaborator).exists())
        self.assertEqual(
            set(
                notifications.exclude(recipient=new_collaborator).values_list(
                    "recipient_id", flat=True
                )
            ),
            {self.collaborator.id, self.other_collaborator.id},
        )
        self.assertIn(
            "new_collaborator",
            notifications.get(recipient=self.collaborator).message,
        )

    def test_removing_collaborator_notifies_removed_user_and_remaining_members(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(
            f"/api/boards/{self.board.id}/collaborators/{self.collaborator.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        notifications = Notification.objects.filter(
            event_type=Notification.EVENT_COLLABORATOR_REMOVED
        )
        self.assertTrue(notifications.filter(recipient=self.collaborator).exists())
        self.assertEqual(
            set(
                notifications.exclude(recipient=self.collaborator).values_list(
                    "recipient_id", flat=True
                )
            ),
            {self.other_collaborator.id},
        )
        removed_notification = notifications.get(recipient=self.collaborator)
        self.assertEqual(removed_notification.board, self.board)
        self.assertEqual(removed_notification.board_name, "Shared Board")
        self.assertIn("removed you", removed_notification.message)

    def test_collaborator_list_create_notifies_other_board_members(self):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.post(
            "/api/lists/",
            {
                "name": "Collaborator List",
                "description": "Collaborator Description",
                "board": self.board.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        notifications = Notification.objects.filter(
            event_type=Notification.EVENT_LIST_CREATED
        )
        recipient_ids = set(notifications.values_list("recipient_id", flat=True))
        self.assertEqual(recipient_ids, {self.owner.id, self.other_collaborator.id})
        self.assertFalse(notifications.filter(recipient=self.collaborator).exists())

    def test_owner_board_rename_notifies_collaborators(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/boards/{self.board.id}/",
            {"name": "Renamed Shared Board"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        notifications = Notification.objects.filter(
            event_type=Notification.EVENT_BOARD_UPDATED
        )
        self.assertEqual(
            set(notifications.values_list("recipient_id", flat=True)),
            {self.collaborator.id, self.other_collaborator.id},
        )
        notification = notifications.first()
        self.assertEqual(notification.board, self.board)
        self.assertEqual(notification.board_name, "Renamed Shared Board")
        self.assertIn("Shared Board", notification.message)
        self.assertIn("Renamed Shared Board", notification.message)

    def test_owner_board_description_update_does_not_notify(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            f"/api/boards/{self.board.id}/",
            {"description": "Updated description"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertFalse(
            Notification.objects.filter(
                event_type=Notification.EVENT_BOARD_UPDATED
            ).exists()
        )

    def test_collaborator_list_update_notifies_other_board_members(self):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.patch(
            f"/api/lists/{self.list.id}/",
            {"name": "Renamed Shared List"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        notifications = Notification.objects.filter(
            event_type=Notification.EVENT_LIST_UPDATED
        )
        self.assertEqual(
            set(notifications.values_list("recipient_id", flat=True)),
            {self.owner.id, self.other_collaborator.id},
        )
        self.assertFalse(notifications.filter(recipient=self.collaborator).exists())
        self.assertIn("Renamed Shared List", notifications.first().message)

    def test_collaborator_list_delete_notifies_other_board_members(self):
        self.client.force_authenticate(user=self.collaborator)
        response = self.client.delete(f"/api/lists/{self.list.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        notifications = Notification.objects.filter(
            event_type=Notification.EVENT_LIST_DELETED
        )
        self.assertEqual(
            set(notifications.values_list("recipient_id", flat=True)),
            {self.owner.id, self.other_collaborator.id},
        )
        self.assertFalse(notifications.filter(recipient=self.collaborator).exists())
        self.assertIn("Shared List", notifications.first().message)

    def test_collaborator_note_create_update_and_delete_notify_other_board_members(
        self,
    ):
        self.client.force_authenticate(user=self.collaborator)
        create_response = self.client.post(
            "/api/notes/",
            {
                "note": "Collaborator Note",
                "description": "Collaborator Description",
                "list": self.list.id,
            },
            format="json",
        )
        self.assertEqual(
            create_response.status_code, status.HTTP_201_CREATED, create_response.data
        )
        note_id = create_response.data["id"]

        update_response = self.client.patch(
            f"/api/notes/{note_id}/",
            {"description": "Updated by collaborator"},
            format="json",
        )

        self.assertEqual(
            update_response.status_code, status.HTTP_200_OK, update_response.data
        )
        for event_type in (
            Notification.EVENT_NOTE_CREATED,
            Notification.EVENT_NOTE_UPDATED,
        ):
            notifications = Notification.objects.filter(event_type=event_type)
            self.assertEqual(
                set(notifications.values_list("recipient_id", flat=True)),
                {self.owner.id, self.other_collaborator.id},
            )

        delete_response = self.client.delete(f"/api/notes/{note_id}/")

        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        deleted_notifications = Notification.objects.filter(
            event_type=Notification.EVENT_NOTE_DELETED
        )
        self.assertEqual(
            set(deleted_notifications.values_list("recipient_id", flat=True)),
            {self.owner.id, self.other_collaborator.id},
        )
        self.assertFalse(
            deleted_notifications.filter(recipient=self.collaborator).exists()
        )
        self.assertIn("Collaborator Note", deleted_notifications.first().message)

    def test_owner_board_delete_notifies_collaborators_and_preserves_board_name(self):
        board_id = self.board.id
        self.client.force_authenticate(user=self.owner)
        response = self.client.delete(f"/api/boards/{board_id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        notifications = Notification.objects.filter(
            event_type=Notification.EVENT_BOARD_DELETED
        )
        self.assertEqual(
            set(notifications.values_list("recipient_id", flat=True)),
            {self.collaborator.id, self.other_collaborator.id},
        )
        notification = notifications.first()
        self.assertIsNone(notification.board)
        self.assertEqual(notification.board_name, "Shared Board")
        self.assertIn("Shared Board", notification.message)
