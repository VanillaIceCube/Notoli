from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import Group, Permission

from .models import User

admin.site.register(User, DjangoUserAdmin)
if admin.site.is_registered(Group):
    admin.site.unregister(Group)
if admin.site.is_registered(Permission):
    admin.site.unregister(Permission)
