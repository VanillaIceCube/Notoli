from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("notes", "0006_note_workspace_boundary"),
    ]

    operations = [
        migrations.AddField(
            model_name="note",
            name="status",
            field=models.CharField(
                choices=[
                    ("Not Started", "Not Started"),
                    ("Completed", "Completed"),
                ],
                default="Not Started",
                max_length=20,
            ),
        ),
    ]
