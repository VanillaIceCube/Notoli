from django.contrib import admin

from .models import Note, TodoList, Workspace

admin.site.register(Workspace)
admin.site.register(TodoList)
admin.site.register(Note)
