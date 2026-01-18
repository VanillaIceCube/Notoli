from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import EmailTokenObtainPairSerializer


User = get_user_model()


def _build_unique_username(base_username):
    base_username = base_username[:150]
    candidate = base_username
    counter = 1
    while User.objects.filter(username=candidate).exists():
        suffix = str(counter)
        trimmed_base = base_username[: 150 - len(suffix)]
        candidate = f"{trimmed_base}{suffix}"
        counter += 1
    return candidate


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        username = request.data.get("username")
        password = request.data.get("password")

        email = email.strip().lower() if isinstance(email, str) else None
        username = username.strip() if isinstance(username, str) else None

        if not email or not password:
            return Response(
                {"error": "Email and password required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_email(email)
        except ValidationError:
            return Response(
                {"error": "Invalid email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {"error": "Email already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if username:
            if User.objects.filter(username=username).exists():
                return Response(
                    {"error": "Username already exists."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            base_username = email.split("@", 1)[0]
            username = _build_unique_username(base_username)

        user = User.objects.create_user(
            username=username, email=email, password=password
        )
        return Response(
            {"message": "User created successfully.", "username": user.username},
            status=status.HTTP_201_CREATED,
        )


class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer
