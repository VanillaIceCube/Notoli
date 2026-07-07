import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("notes", "0010_remove_note_collaborators_remove_note_owner_and_more"),
    ]

    operations = [
        migrations.RenameModel(
            old_name="Workspace",
            new_name="Board",
        ),
        migrations.RenameModel(
            old_name="TodoList",
            new_name="List",
        ),
        migrations.RenameModel(
            old_name="TodoListNote",
            new_name="ListNote",
        ),
        migrations.RenameField(
            model_name="list",
            old_name="workspace",
            new_name="board",
        ),
        migrations.RenameField(
            model_name="note",
            old_name="workspace",
            new_name="board",
        ),
        migrations.RemoveConstraint(
            model_name="listnote",
            name="unique_todolist_note_membership",
        ),
        migrations.RenameField(
            model_name="listnote",
            old_name="todolist",
            new_name="list",
        ),
        migrations.AlterModelOptions(
            name="board",
            options={"verbose_name": "Board", "verbose_name_plural": "Boards"},
        ),
        migrations.AlterModelOptions(
            name="list",
            options={
                "ordering": ["position", "created_at", "id"],
                "verbose_name": "List",
                "verbose_name_plural": "Lists",
            },
        ),
        migrations.AlterModelOptions(
            name="listnote",
            options={
                "ordering": ["position", "id"],
                "verbose_name": "List Note",
                "verbose_name_plural": "List Notes",
            },
        ),
        migrations.AlterModelTable(
            name="listnote",
            table="notes_list_notes",
        ),
        migrations.AlterField(
            model_name="board",
            name="collaborators",
            field=models.ManyToManyField(
                blank=True,
                related_name="collaborating_boards",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="board",
            name="created_by",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="created_boards",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="board",
            name="owner",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="owned_boards",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="list",
            name="board",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="lists",
                to="notes.board",
            ),
        ),
        migrations.AlterField(
            model_name="list",
            name="created_by",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="created_lists",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="list",
            name="notes",
            field=models.ManyToManyField(
                blank=True,
                related_name="lists",
                through="notes.ListNote",
                to="notes.note",
            ),
        ),
        migrations.AlterField(
            model_name="listnote",
            name="list",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="note_memberships",
                to="notes.list",
            ),
        ),
        migrations.AlterField(
            model_name="listnote",
            name="note",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="list_memberships",
                to="notes.note",
            ),
        ),
        migrations.AlterField(
            model_name="note",
            name="board",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="notes",
                to="notes.board",
            ),
        ),
        migrations.AddConstraint(
            model_name="listnote",
            constraint=models.UniqueConstraint(
                fields=("list", "note"), name="unique_list_note_membership"
            ),
        ),
    ]
