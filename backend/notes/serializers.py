from rest_framework import serializers
from .models import Todi, Noti


class TodiSerializer(serializers.ModelSerializer):
    class Meta:
        model = Todi
        fields = '__all__'


class NotiSerializer(serializers.ModelSerializer):
    class Meta:
        model = Noti
        fields = '__all__'
