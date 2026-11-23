from django.contrib.auth.models import AbstractUser
from django.db import models, router, transaction


class User(AbstractUser):
    # We subclass AbstractUser (Django's default user shape) to add a unique email field.
    # This custom User is used in place of auth.User via AUTH_USER_MODEL.
    email = models.EmailField(unique=True)

    def save(
        self, *, force_insert=False, force_update=False, using=None, update_fields=None
    ):
        # Django admin, create_user(), and createsuperuser all save the user here.
        if self._state.adding and not force_update and update_fields is None:
            self.save_with_starter_board(force_insert=force_insert, using=using)
            return
        super().save(
            force_insert=force_insert,
            force_update=force_update,
            using=using,
            update_fields=update_fields,
        )

    def save_with_starter_board(self, *, force_insert=False, using=None):
        """Save a new account and its starter board together, returning the board."""
        from apps.notes.services import create_starter_board

        database = using or router.db_for_write(type(self), instance=self)
        original_pk = self.pk
        original_state = self._state.adding, self._state.db
        try:
            with transaction.atomic(using=database):
                # A new model instance with an existing primary key can update the account.
                existing_user = (
                    self.pk is not None
                    and not force_insert
                    and type(self).objects.using(database).filter(pk=self.pk).exists()
                )
                super().save(force_insert=force_insert, using=database)
                if not existing_user:
                    return create_starter_board(self)
                return None
        except Exception:
            # The transaction rolls back the rows. Restore the instance for retries.
            self.pk = original_pk
            self._state.adding, self._state.db = original_state
            raise
