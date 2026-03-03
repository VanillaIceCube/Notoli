from urllib.parse import urlencode

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.conf import settings
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from notes.models import Workspace

from .serializers import EmailTokenObtainPairSerializer

User = get_user_model()


def _build_unique_username(base_username):
    base_username = base_username[:150]
    candidate = base_username
    counter = 1
    while User.objects.filter(username=candidate).exists():
        suffix = f"{counter:02d}"
        trimmed_base = base_username[: 150 - len(suffix)]
        candidate = f"{trimmed_base}{suffix}"
        counter += 1
    return candidate


def _build_password_reset_link(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    query = urlencode({"uid": uid, "token": token})
    return f"{settings.FRONTEND_BASE_URL}/reset-password?{query}"


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
        refresh = RefreshToken.for_user(user)
        workspace = Workspace.objects.filter(owner=user).order_by("id").first()
        return Response(
            {
                "message": "User created successfully.",
                "username": user.username,
                "email": user.email,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "workspace_id": workspace.id if workspace else None,
            },
            status=status.HTTP_201_CREATED,
        )


class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        email = email.strip().lower() if isinstance(email, str) else None

        if not email:
            return Response(
                {"error": "Email is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_email(email)
        except ValidationError:
            return Response(
                {"error": "Invalid email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
                pass

        return Response(
            {
                "message": (
                    "Password reset link has been sent!"
                )
            },
            status=status.HTTP_200_OK,
        )


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        uid = request.data.get("uid")
        token = request.data.get("token")
        password = request.data.get("password")
        password = password.strip() if isinstance(password, str) else password

        if not uid or not token or not password:
            return Response(
                {"error": "uid, token, and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
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


class ProfileView(APIView):
    def patch(self, request):
        username = request.data.get("username")
        username = username.strip() if isinstance(username, str) else None

        if not username:
            return Response(
                {"error": "Username is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(username) > 150:
            return Response(
                {"error": "Username must be 150 characters or fewer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(username=username).exclude(pk=request.user.pk).exists():
            return Response(
                {"error": "Username already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.username = username
        request.user.save(update_fields=["username"])

        return Response(
            {
                "message": "Username updated successfully.",
                "username": request.user.username,
                "email": request.user.email,
            },
            status=status.HTTP_200_OK,
        )
