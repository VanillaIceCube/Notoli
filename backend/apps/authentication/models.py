from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    # We subclass AbstractUser (Django's default user shape) to add a unique email field.
    # This custom User is used in place of auth.User via AUTH_USER_MODEL.
    email = models.EmailField(unique=True)
