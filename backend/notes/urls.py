from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views


router = DefaultRouter()
router.register(r'workspaces', views.WorkspaceViewSet)
router.register(r'todolists', views.TodoListViewSet)
router.register(r'notes', views.NoteViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
