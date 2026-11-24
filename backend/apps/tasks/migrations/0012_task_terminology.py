from django.conf import settings
from django.db import migrations, models
from django.db.models import deletion

MODEL_NAMES = (
    ("note", "task", "Note", "Task"),
    ("listnote", "listtask", "List Note", "List Task"),
)


def move_permissions(apps, database, *, reverse=False):
    # Django renames the content types alongside RenameModel. Preserve the
    # existing permission rows (including user/group assignments) as well.
    permissions = apps.get_model("auth", "Permission").objects.using(database)
    for old, new, old_label, new_label in MODEL_NAMES:
        source, target, label = (
            (new, old, old_label) if reverse else (old, new, new_label)
        )
        for action in ("add", "change", "delete", "view"):
            current = permissions.filter(
                content_type__app_label="notes",
                content_type__model=new,
                codename=f"{action}_{source}",
            ).first()
            if current is None:
                continue
            codename = f"{action}_{target}"
            existing = permissions.filter(
                content_type_id=current.content_type_id, codename=codename
            ).first()
            if existing is None:
                current.codename = codename
                current.name = f"Can {action} {label}"
                current.save(using=database, update_fields=["codename", "name"])
            else:
                existing.group_set.add(*current.group_set.all())
                existing.user_set.add(*current.user_set.all())
                current.delete(using=database)


def rename_permissions(apps, schema_editor):
    move_permissions(apps, schema_editor.connection.alias)


def restore_permissions(apps, schema_editor):
    move_permissions(apps, schema_editor.connection.alias, reverse=True)


class Migration(migrations.Migration):
    dependencies = [
        ("notes", "0011_rename_boards_lists"),
        ("notifications", "0005_notification_list_notification_note_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RenameModel("Note", "Task"),
        migrations.RenameModel("ListNote", "ListTask"),
        migrations.RemoveConstraint(
            model_name="listtask", name="unique_list_note_membership"
        ),
        migrations.RenameField("list", "notes", "tasks"),
        migrations.RenameField("task", "note", "text"),
        migrations.RenameField("listtask", "note", "task"),
        migrations.AlterModelOptions(
            name="task",
            options={"verbose_name": "Task", "verbose_name_plural": "Tasks"},
        ),
        migrations.AlterModelOptions(
            name="listtask",
            options={
                "verbose_name": "List Task",
                "verbose_name_plural": "List Tasks",
                "ordering": ["position", "id"],
            },
        ),
        migrations.AlterModelTable("listtask", "notes_list_tasks"),
        migrations.AlterField(
            model_name="task",
            name="board",
            field=models.ForeignKey(
                on_delete=deletion.CASCADE, related_name="tasks", to="notes.board"
            ),
        ),
        migrations.AlterField(
            model_name="task",
            name="created_by",
            field=models.ForeignKey(
                on_delete=deletion.CASCADE,
                related_name="created_tasks",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="listtask",
            name="list",
            field=models.ForeignKey(
                on_delete=deletion.CASCADE,
                related_name="task_memberships",
                to="notes.list",
            ),
        ),
        migrations.AddConstraint(
            model_name="listtask",
            constraint=models.UniqueConstraint(
                fields=("list", "task"), name="unique_list_task_membership"
            ),
        ),
        migrations.RunPython(rename_permissions, restore_permissions),
    ]
