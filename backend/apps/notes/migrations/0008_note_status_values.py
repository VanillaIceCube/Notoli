from django.db import migrations, models


def rename_completed_status(apps, schema_editor):
    Note = apps.get_model("notes", "Note")
    Note.objects.filter(status="Completed").update(status="Complete")


def restore_completed_status(apps, schema_editor):
    Note = apps.get_model("notes", "Note")
    Note.objects.filter(status="Complete").update(status="Completed")


class Migration(migrations.Migration):
    dependencies = [
        ("notes", "0007_note_status"),
    ]

    operations = [
        migrations.RunPython(rename_completed_status, restore_completed_status),
        migrations.AlterField(
            model_name="note",
            name="status",
            field=models.CharField(
                choices=[
                    ("Not Started", "Not Started"),
                    ("In Progress", "In Progress"),
                    ("Complete", "Complete"),
                ],
                default="Not Started",
                max_length=20,
            ),
        ),
    ]
