from django.db import migrations, models


def rename_events(apps, schema_editor, source, target):
    rows = apps.get_model("notifications", "Notification").objects.using(
        schema_editor.connection.alias
    )
    for event in ("created", "updated", "completed", "deleted"):
        rows.filter(event_type=f"{source}_{event}").update(
            event_type=f"{target}_{event}"
        )


def use_task_events(apps, schema_editor):
    rename_events(apps, schema_editor, "note", "task")


def use_note_events(apps, schema_editor):
    rename_events(apps, schema_editor, "task", "note")


class Migration(migrations.Migration):
    dependencies = [
        ("notes", "0012_task_terminology"),
        ("notifications", "0005_notification_list_notification_note_and_more"),
    ]

    operations = [
        migrations.RenameField("notification", "note", "task"),
        migrations.RunPython(use_task_events, use_note_events),
        migrations.AlterField(
            model_name="notification",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("collaborator_added", "Collaborator added"),
                    ("collaborator_removed", "Collaborator removed"),
                    ("list_created", "List created"),
                    ("list_updated", "List updated"),
                    ("list_deleted", "List deleted"),
                    ("task_created", "Task created"),
                    ("task_updated", "Task updated"),
                    ("task_completed", "Task completed"),
                    ("task_deleted", "Task deleted"),
                    ("board_updated", "Board updated"),
                    ("board_deleted", "Board deleted"),
                ],
                max_length=40,
            ),
        ),
    ]
