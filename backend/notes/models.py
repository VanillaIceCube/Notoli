from django.db import models


class Note(models.Model):
    note = models.CharField(max_length=255)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey('auth.User', on_delete=models.CASCADE,)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title
