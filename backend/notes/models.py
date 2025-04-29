from django.contrib.auth.models import User
from django.db import models


# Toli: Todo List
class Toli(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


# Noto: Notes
class Noto(models.Model):
    note = models.CharField(max_length=255)
    toli = models.ForeignKey(Toli, on_delete=models.CASCADE, related_name='notes')
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.note
