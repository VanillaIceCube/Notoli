from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import Group, Permission

from .models import User

# I'm removeing Group and Permission, cause I have another group called authentication,
# and this group is called authentication and authorization, and I thoughts it would be
# stupid to have both those groups. So then I had a bunch of code to move what was in
# authentication and moved it to authentication and authorization, but that also felt
# dumb. So my final solution was to just unregister it, cause I don't even use Group
# in the first place.
admin.site.register(User, DjangoUserAdmin)
if admin.site.is_registered(Group):
    admin.site.unregister(Group)
if admin.site.is_registered(Permission):
    admin.site.unregister(Permission)
