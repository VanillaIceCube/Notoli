from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

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

        instance_workspace = getattr(self.instance, "workspace", None)

        # Enforce that attaching to a todo list via PATCH requires access to that list.
        # Otherwise a user who can edit a note could inject it into a list they can't access.
        if todo_list is not None:
            request = self.context.get("request")
            user = getattr(request, "user", None)
            if user is not None and getattr(user, "is_authenticated", False):
                has_todolist_access = (
                    todo_list.owner_id == user.id
                    or todo_list.created_by_id == user.id
                    or todo_list.collaborators.filter(id=user.id).exists()
                )
                if not has_todolist_access:
                    raise PermissionDenied("You cannot add notes to this todo-list.")

        # Hard boundary: Notes cannot move between workspaces once created.
        # Validate this first so clients get a clear immutability error even if they also send `todo_list`.
        if self.instance is not None and "workspace" in attrs:
            if attrs["workspace"].id != self.instance.workspace_id:
                raise serializers.ValidationError(
                    {"workspace": ["Cannot change workspace of an existing note."]}
                )

        # For updates, the note's workspace is immutable, so always validate against the instance workspace.
        effective_workspace = instance_workspace if self.instance is not None else workspace

        # Creation requires scope. Updates can omit scope as long as the instance already has it.
        if todo_list is None and workspace is None:
            if self.instance is None or instance_workspace is None:
                raise serializers.ValidationError(
                    {
                        "todo_list": [
                            "This field is required when workspace is not provided."
                        ],
                    }
                )

        if todo_list is not None and effective_workspace is not None:
            if todo_list.workspace_id != effective_workspace.id:
                raise serializers.ValidationError(
                    {
                        "todo_list": [
                            "Todo list must be in the same workspace as the note."
                        ]
                    }
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

    def update(self, instance, validated_data):
        # `todo_list` is an API convenience for attaching a note to a todo list.
        # It is not a model field, so we must handle it explicitly on update.
        todo_list = validated_data.pop("todo_list", None)

        note = super().update(instance, validated_data)

        if todo_list is not None:
            todo_list.notes.add(note)

        return note
