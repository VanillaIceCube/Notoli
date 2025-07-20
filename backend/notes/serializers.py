from rest_framework import serializers
from .models import Workspace, TodoList, Note


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = '__all__'
        # perform_create in models.py automatically sets owner & created_by upon creation
        # this is placed here to allow you to not have to pass in owner & created_by
        # but still requires them on the database level
        extra_kwargs = {
            'owner': {'required': False},
            'created_by': {'required': False}
        }


class TodoListSerializer(serializers.ModelSerializer):
    class Meta:
        model = TodoList
        fields = '__all__'
        # perform_create in models.py automatically sets owner & created_by upon creation
        # this is placed here to allow you to not have to pass in owner & created_by
        # but still requires them on the database level
        extra_kwargs = {
            'owner': {'required': False},
            'created_by': {'required': False},
        }

class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = '__all__'
