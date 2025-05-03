from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views


router = DefaultRouter()
router.register(r'todolists', views.TodoListViewSet)
router.register(r'notes', views.NoteViewSet)
router.register(r'todolistviews', views.TodoListViewViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
