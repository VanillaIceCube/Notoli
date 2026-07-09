from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
# To be honest, I'm still having trouble understanding what the basename does exactly other than "provide clarity"
# Reverse URL Lookups:
#   The basename is used when generating URL patterns for the registered viewset.
#   It allows you to perform reverse URL lookups with Django's reverse function or the {% url %} template tag.
#   Without specifying a basename, the router might not be able to generate URL names predictably since it falls back to
#   using the queryset's model name for the base or may generate ambiguous names.
router.register(r"boards", views.BoardViewSet, basename="board")
router.register(r"lists", views.ListViewSet, basename="list")
router.register(r"notes", views.NoteViewSet, basename="note")
router.register(r"notifications", views.NotificationViewSet, basename="notification")

urlpatterns = [
    path("", include(router.urls)),
]
