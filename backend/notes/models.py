from django.db import models


# Toli: Todo List
class Toli(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey('auth.User', on_delete=models.CASCADE,)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


# Noto: Notes
class Noto(models.Model):
    note = models.CharField(max_length=255)
    toli = models.ForeignKey(Toli, on_delete=models.CASCADE, related_name='notes')
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey('auth.User', on_delete=models.CASCADE,)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.note
