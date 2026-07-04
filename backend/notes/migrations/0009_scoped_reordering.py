from django.db import migrations, models


def populate_todolist_positions(apps, schema_editor):
    TodoList = apps.get_model("notes", "TodoList")

    workspace_ids = (
        TodoList.objects.order_by().values_list("workspace_id", flat=True).distinct()
    )
    for workspace_id in workspace_ids:
        todo_lists = TodoList.objects.filter(workspace_id=workspace_id).order_by(
            "created_at", "id"
        )
        for position, todo_list in enumerate(todo_lists):
            TodoList.objects.filter(pk=todo_list.pk).update(position=position)


def populate_todolist_note_positions(apps, schema_editor):
    table_name = schema_editor.quote_name("notes_todolist_notes")
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            f"SELECT id, todolist_id FROM {table_name} ORDER BY todolist_id, id"
        )
        rows = cursor.fetchall()

        current_todolist_id = None
        position = 0
        for row_id, todolist_id in rows:
            if todolist_id != current_todolist_id:
                current_todolist_id = todolist_id
                position = 0

            cursor.execute(
                f"UPDATE {table_name} SET position = %s WHERE id = %s",
                [position, row_id],
            )
            position += 1


class Migration(migrations.Migration):
    dependencies = [
        ("notes", "0008_note_status_values"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.AddField(
                    model_name="todolist",
                    name="position",
                    field=models.PositiveIntegerField(default=0),
                ),
                migrations.RunPython(
                    populate_todolist_positions, migrations.RunPython.noop
                ),
                migrations.RunSQL(
                    "ALTER TABLE notes_todolist_notes "
                    "ADD COLUMN position integer NOT NULL DEFAULT 0",
                    reverse_sql=migrations.RunSQL.noop,
                ),
                migrations.RunPython(
                    populate_todolist_note_positions, migrations.RunPython.noop
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="todolist",
                    name="position",
                    field=models.PositiveIntegerField(default=0),
                ),
                migrations.CreateModel(
                    name="TodoListNote",
                    fields=[
                        (
                            "id",
                            models.BigAutoField(
                                auto_created=True,
                                primary_key=True,
                                serialize=False,
                                verbose_name="ID",
                            ),
                        ),
                        ("position", models.PositiveIntegerField(default=0)),
                        (
                            "note",
                            models.ForeignKey(
                                on_delete=models.deletion.CASCADE,
                                related_name="todolist_memberships",
                                to="notes.note",
                            ),
                        ),
                        (
                            "todolist",
                            models.ForeignKey(
                                on_delete=models.deletion.CASCADE,
                                related_name="note_memberships",
                                to="notes.todolist",
                            ),
                        ),
                    ],
                    options={
                        "verbose_name": "Todo List Note",
                        "verbose_name_plural": "Todo List Notes",
                        "db_table": "notes_todolist_notes",
                        "ordering": ["position", "id"],
                    },
                ),
                migrations.AlterModelOptions(
                    name="todolist",
                    options={
                        "ordering": ["position", "created_at", "id"],
                        "verbose_name": "Todo List",
                        "verbose_name_plural": "Todo Lists",
                    },
                ),
                migrations.AddConstraint(
                    model_name="todolistnote",
                    constraint=models.UniqueConstraint(
                        fields=("todolist", "note"),
                        name="unique_todolist_note_membership",
                    ),
                ),
                migrations.AlterField(
                    model_name="todolist",
                    name="notes",
                    field=models.ManyToManyField(
                        blank=True,
                        related_name="todolists",
                        through="notes.TodoListNote",
                        to="notes.note",
                    ),
                ),
            ],
        ),
    ]
