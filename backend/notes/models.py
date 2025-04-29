from django.contrib.auth.models import User
from django.db import models


# Toli: Todo List
class Toli(models.Model):
    # Attributes
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Ownership
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_tolis')
    collaborators = models.ManyToManyField(User, blank=True, related_name='collaborating_tolis')

    # Meta Data
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_tolis')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


# Noto: Notes
class Noto(models.Model):
    # Attributes
    note = models.CharField(max_length=255)
    toli = models.ForeignKey(Toli, on_delete=models.CASCADE, related_name='notes')
    description = models.TextField(blank=True)

    # Ownership
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_notos')
    collaborators = models.ManyToManyField(User, blank=True, related_name='collaborating_notos')

    # Meta Data
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_notos')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.note
