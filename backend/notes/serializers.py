from rest_framework import serializers
from .models import TodoList, Note, TodoListView


class TodoListSerializer(serializers.ModelSerializer):
    class Meta:
        model = TodoList
        fields = '__all__'


class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = '__all__'

class TodoListViewSerializer(serializers.ModelSerializer):
    class Meta:
        model = TodoListView
        fields = '__all__'
