from rest_framework import serializers

from .models import Note, TodoList, Workspace


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = "__all__"
        # perform_create in models.py automatically sets owner & created_by upon creation
        # this is placed here to allow you to not have to pass in owner & created_by
        # but still requires them on the database level
        extra_kwargs = {"owner": {"required": False}, "created_by": {"required": False}}


class TodoListSerializer(serializers.ModelSerializer):
    class Meta:
        model = TodoList
        fields = "__all__"
        # perform_create in models.py automatically sets owner & created_by upon creation
        # this is placed here to allow you to not have to pass in owner & created_by
        # but still requires them on the database level
        extra_kwargs = {
            "owner": {"required": False},
            "created_by": {"required": False},
        }


class NoteSerializer(serializers.ModelSerializer):
    todo_list = serializers.PrimaryKeyRelatedField(
        queryset=TodoList.objects.all(),
        write_only=True,
        required=True,
    )

    class Meta:
        model = Note
        fields = "__all__"
        # perform_create in models.py automatically sets owner & created_by upon creation
        # this is placed here to allow you to not have to pass in owner & created_by
        # but still requires them on the database level
        extra_kwargs = {
            "owner": {"required": False},
            "created_by": {"required": False},
        }

    def create(self, validated_data):
        todo_list = validated_data.pop("todo_list")
        note = super().create(validated_data)
        todo_list.notes.add(note)
        return note
