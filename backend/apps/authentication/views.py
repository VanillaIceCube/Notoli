import logging
from binascii import Error as BinasciiError
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.notes.models import Board

from .serializers import (
    EmailTokenObtainPairSerializer,
    ForgotPasswordRequestSerializer,
    RegistrationRequestSerializer,
    ResetPasswordRequestSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)


def _build_unique_username(base_username):
    base_username = (base_username or "").strip()[:150] or "user"
    candidate = base_username
    counter = 1
    while User.objects.filter(username=candidate).exists():
        suffix = f"{counter:02d}"
        trimmed_base = base_username[: 150 - len(suffix)]
        candidate = f"{trimmed_base}{suffix}"
        counter += 1
    return candidate


def _invalid_request(serializer):
    message = next(iter(serializer.errors.values()))[0]
    return Response({"error": str(message)}, status=status.HTTP_400_BAD_REQUEST)


def _build_password_reset_link(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    query = urlencode({"uid": uid, "token": token})
    return f"{settings.FRONTEND_BASE_URL}/reset-password?{query}"


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegistrationRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _invalid_request(serializer)
        email = serializer.validated_data["email"]
        username = serializer.validated_data.get("username")
        password = serializer.validated_data["password"]

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

        candidate_user = User(username=username, email=email)
        try:
            validate_password(password, user=candidate_user)
        except ValidationError as exc:
            return Response(
                {"error": exc.messages[0] if exc.messages else "Invalid password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Include required user-save onboarding and session creation in the
            # transaction, so a failed signup never leaves a partial account.
            with transaction.atomic():
                user = User.objects.create_user(
                    username=username, email=email, password=password
                )
                refresh = RefreshToken.for_user(user)
                data = {
                    "message": "User created successfully.",
                    "username": user.username,
                    "email": user.email,
                    "access": str(refresh.access_token),
                    "refresh": str(refresh),
                }
                board = Board.objects.filter(owner=user).order_by("id").first()
                data["board_id"] = board.id if board else None
        except IntegrityError:
            return Response(
                {"error": "Email or username already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(data, status=status.HTTP_201_CREATED)


class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ForgotPasswordRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _invalid_request(serializer)
        email = serializer.validated_data["email"]

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user and user.has_usable_password():
            reset_link = _build_password_reset_link(user)
            try:
                send_mail(
                    "Reset your Notoli password",
                    (
                        "We received a request to reset your password.\n\n"
                        f"Use this link to reset it:\n{reset_link}\n\n"
                        "If you did not request this, you can ignore this email."
                    ),
                    settings.DEFAULT_FROM_EMAIL,
                    [user.email],
                    fail_silently=False,
                )
            except Exception:
                # Keep response generic to avoid account enumeration.
                logger.error(
                    "Password reset email delivery failed; public response remains generic."
                )

        return Response(
            {"message": ("Password reset link has been sent!")},
            status=status.HTTP_200_OK,
        )


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return _invalid_request(serializer)
        uid = serializer.validated_data["uid"]
        token = serializer.validated_data["token"]
        password = serializer.validated_data["password"]

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except (
            BinasciiError,
            TypeError,
            UnicodeDecodeError,
            ValueError,
            OverflowError,
            ValidationError,
            User.DoesNotExist,
        ):
            user = None

        if not user or not default_token_generator.check_token(user, token):
            return Response(
                {"error": "Invalid or expired reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(password, user=user)
        except ValidationError as exc:
            return Response(
                {"error": exc.messages[0] if exc.messages else "Invalid password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(password)
        user.save(update_fields=["password"])

        return Response(
            {"message": "Password reset successful."},
            status=status.HTTP_200_OK,
        )
