from django.contrib import admin
from .models import Workspace, TodoList, Note


admin.site.register(Workspace)
admin.site.register(TodoList)
admin.site.register(Note)