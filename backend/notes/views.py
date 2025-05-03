from rest_framework import viewsets
from .models import TodoList, Note, TodoListView
from .serializers import TodoListSerializer, NoteSerializer, TodoListViewSerializer


class TodoListViewSet(viewsets.ModelViewSet):
    queryset = TodoList.objects.all()
    serializer_class = TodoListSerializer


class NoteViewSet(viewsets.ModelViewSet):
    queryset = Note.objects.all()
    serializer_class = NoteSerializer


class TodoListViewViewSet(viewsets.ModelViewSet):
    queryset = TodoListView.objects.all()
    serializer_class = TodoListViewSerializer
