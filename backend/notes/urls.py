from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views


router = DefaultRouter()
router.register(r'todis', views.TodiViewSet)
router.register(r'notis', views.NotiViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
