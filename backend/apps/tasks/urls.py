from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"boards", views.BoardViewSet, basename="board")
router.register(r"lists", views.ListViewSet, basename="list")
router.register(r"tasks", views.TaskViewSet, basename="task")

urlpatterns = router.urls
