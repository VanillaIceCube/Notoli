from django.contrib import admin
from .models import TodoList, Note, TodoListView


admin.site.register(TodoList)
admin.site.register(Note)
admin.site.register(TodoListView)