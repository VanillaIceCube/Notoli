from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    email = serializers.EmailField(required=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields[self.username_field].required = False

    def validate(self, attrs):
        email = attrs.get("email")
        username = attrs.get(self.username_field)

        if not email and not username:
            raise serializers.ValidationError({"email": ["This field is required."]})

        if email and not username:
            user = User.objects.filter(email__iexact=email).first()
            if user:
                attrs[self.username_field] = user.get_username()
            else:
                attrs[self.username_field] = email

        return super().validate(attrs)
