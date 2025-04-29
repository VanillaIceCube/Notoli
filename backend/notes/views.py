from rest_framework import viewsets
from .models import Todi, Noti
from .serializers import TodiSerializer, NotiSerializer


class TodiViewSet(viewsets.ModelViewSet):
    queryset = Todi.objects.all()
    serializer_class = TodiSerializer


class NotiViewSet(viewsets.ModelViewSet):
    queryset = Noti.objects.all()
    serializer_class = NotiSerializer
