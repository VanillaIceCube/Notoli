from django.conf import settings
from django.db import migrations, models
from django.db.models import deletion

MODEL_NAMES = (
    ("note", "task", "Note", "Task"),
    ("listnote", "listtask", "List Note", "List Task"),
)


def move_permissions(apps, database, *, reverse=False):
    content_types = (
        apps.get_model("contenttypes", "ContentType")
        .objects.using(database)
        .filter(app_label="notes")
    )
    permissions = apps.get_model("auth", "Permission").objects.using(database)
    for old, new, old_label, new_label in MODEL_NAMES:
        source, target, label = (
            (new, old, old_label) if reverse else (old, new, new_label)
        )
        target_type = content_types.filter(model=target).first()
        if target_type is None:
            # The content type can still have the old name during rollback or
            # when running without Django's injected RenameContentType operation.
            target_type = content_types.filter(model=source).first()
            if target_type is None:
                continue
            target_type.model = target
            target_type.save(using=database, update_fields=["model"])

        for action in ("add", "change", "delete", "view"):
            # A preexisting target content type can prevent Django's automatic
            # rename. The old grants may then be on either content type.
            original = permissions.filter(
                content_type__app_label="notes",
                content_type__model__in=(source, target),
                codename=f"{action}_{source}",
            )
            codename = f"{action}_{target}"
            existing = permissions.filter(
                content_type=target_type, codename=codename
            ).first()
            for permission in original:
                if existing is None:
                    permission.content_type = target_type
                    permission.codename = codename
                    permission.name = f"Can {action} {label}"
                    permission.save(
                        using=database,
                        update_fields=["content_type", "codename", "name"],
                    )
                    existing = permission
                else:
                    existing.group_set.add(*permission.group_set.all())
                    existing.user_set.add(*permission.user_set.all())
                    permission.delete(using=database)


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
