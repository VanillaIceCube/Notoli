from django.contrib.auth.models import User
from django.db import models


# Todi: Todo List (Pronounced Toe-dee)
class Todi(models.Model):
    # Attributes
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Ownership
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_todis')
    collaborators = models.ManyToManyField(User, blank=True, related_name='collaborating_todis')

    # Metadata
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_todis')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


# Noti: Notes (Pronounced No-dee)
class Noti(models.Model):
    # Attributes
    note = models.CharField(max_length=255)
    todi = models.ForeignKey(Todi, on_delete=models.CASCADE, related_name='notis')
    description = models.TextField(blank=True)

    # Ownership
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_notis')
    collaborators = models.ManyToManyField(User, blank=True, related_name='collaborating_notis')

    # Metadata
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_notis')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.note
