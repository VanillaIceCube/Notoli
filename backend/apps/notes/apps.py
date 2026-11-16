from django.apps import AppConfig


class NotesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notes"
    label = "notes"

    def ready(self):
        from . import signals  # noqa: F401
