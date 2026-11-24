from django.apps import AppConfig


class TasksConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.tasks"
    # Keep the historical app label used by migrations and existing permissions.
    label = "notes"
    verbose_name = "Tasks"

    def ready(self):
        from . import signals  # noqa: F401
