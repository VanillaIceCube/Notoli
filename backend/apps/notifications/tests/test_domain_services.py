from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.exceptions import PermissionDenied

from apps.notifications import services
from apps.notifications.models import Notification


class NotificationDomainServiceTests(TestCase):
    def setUp(self):
        users = get_user_model()
        self.actor = users.objects.create_user(
            username="recipient", email="recipient@example.com"
        )
        self.other = users.objects.create_user(
            username="other-recipient", email="other-recipient@example.com"
        )
        self.own = Notification.objects.create(
            recipient=self.actor, title="Own", event_type="test"
        )
        self.foreign = Notification.objects.create(
            recipient=self.other, title="Foreign", event_type="test"
        )

    def test_foreign_notification_cannot_be_changed_or_deleted_directly(self):
        with self.assertRaises(PermissionDenied):
            services.update_notification(self.actor, {"is_read": True}, self.foreign)
        with self.assertRaises(PermissionDenied):
            services.delete_notification(self.actor, self.foreign)
        self.foreign.refresh_from_db()
        self.assertFalse(self.foreign.is_read)

    def test_read_flags_and_bulk_actions_are_recipient_scoped(self):
        read = services.update_notification(self.actor, {"is_read": True}, self.own)
        self.assertIsNotNone(read.read_at)
        unread = services.update_notification(self.actor, {"is_read": False}, read)
        self.assertIsNone(unread.read_at)
        self.assertEqual(services.mark_all_read(self.actor), 1)
        self.assertEqual(services.clear_all(self.actor), 1)
        self.assertTrue(
            Notification.objects.filter(pk=self.foreign.pk, is_read=False).exists()
        )
