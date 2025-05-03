from django.contrib.auth.models import User
from django.db import models
from django.db.models import JSONField


# TodoList: The full TodoList
class TodoList(models.Model):
    # Attributes
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Ownership
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_todolists')
    collaborators = models.ManyToManyField(User, blank=True, related_name='collaborating_todolists')

    # Metadata
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_todolists')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Todo List"
        verbose_name_plural = "Todo Lists"


# Note: The todo items underneath the TodoList
class Note(models.Model):
    # Attributes
    note = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Scope
    todo_list = models.ForeignKey(TodoList, on_delete=models.CASCADE, related_name='notes')

    # Ownership
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_notes')
    collaborators = models.ManyToManyField(User, blank=True, related_name='collaborating_notes')

    # Metadata
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_notes')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.note

    class Meta:
        verbose_name = "Note"
        verbose_name_plural = "Notes"


# TodoListView: Saved views for the larger list
class TodoListView(models.Model):
    # Attributes
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Scope
    todo_list = models.ForeignKey(TodoList, on_delete=models.CASCADE, related_name='views')
    notes = models.ManyToManyField('Note', blank=True, related_name='todolist_views')

    # Ownership
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_todolistviews')
    collaborators = models.ManyToManyField(User, blank=True, related_name='collaborating_todolistviews')

    # Metadata
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_todolistviews')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Todo List View"
        verbose_name_plural = "Todo List Views"
