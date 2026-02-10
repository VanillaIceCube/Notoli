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

    def validate(self, attrs):
        # Hard boundary: TodoLists cannot move between workspaces once created.
        if self.instance is not None and "workspace" in attrs:
            if attrs["workspace"].id != self.instance.workspace_id:
                raise serializers.ValidationError(
                    {"workspace": ["Cannot change workspace of a todo list."]}
                )

        workspace = attrs.get("workspace") or getattr(self.instance, "workspace", None)
        notes = attrs.get("notes")
        if workspace is not None and notes is not None:
            bad_note_ids = [n.id for n in notes if n.workspace_id != workspace.id]
            if bad_note_ids:
                raise serializers.ValidationError(
                    {
                        "notes": [
                            "All notes must belong to the same workspace as the todo list."
                        ]
                    }
                )

        return attrs


class NoteSerializer(serializers.ModelSerializer):
    todo_list = serializers.PrimaryKeyRelatedField(
        queryset=TodoList.objects.all(),
        write_only=True,
        required=False,
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
            "workspace": {"required": False},
        }

    def validate(self, attrs):
        todo_list = attrs.get("todo_list")
        workspace = attrs.get("workspace")

        # Preserve existing API behavior: if no workspace is provided, a todo list is required.
        if todo_list is None and workspace is None:
            raise serializers.ValidationError({"todo_list": ["This field is required."]})

        if todo_list is not None and workspace is not None:
            if todo_list.workspace_id != workspace.id:
                raise serializers.ValidationError(
                    {
                        "workspace": [
                            "Workspace must match the workspace of the provided todo_list."
                        ]
                    }
                )

        # Hard boundary: Notes cannot move between workspaces once created.
        if self.instance is not None and "workspace" in attrs:
            if attrs["workspace"].id != self.instance.workspace_id:
                raise serializers.ValidationError(
                    {"workspace": ["Cannot change workspace of an existing note."]}
                )

        return attrs

    def create(self, validated_data):
        todo_list = validated_data.pop("todo_list", None)

        if validated_data.get("workspace") is None and todo_list is not None:
            validated_data["workspace"] = todo_list.workspace

        note = super().create(validated_data)

        if todo_list is not None:
            todo_list.notes.add(note)

        return note
