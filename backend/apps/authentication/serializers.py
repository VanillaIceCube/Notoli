from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class StrictCharField(serializers.CharField):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        return super().to_internal_value(data)


class NormalizedEmailField(serializers.EmailField):
    default_error_messages = {"invalid": "Invalid email address."}

    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        return super().to_internal_value(data).lower()


class RegistrationRequestSerializer(serializers.Serializer):
    required_message = "Email and password required."
    email = NormalizedEmailField(
        error_messages={
            "required": required_message,
            "blank": required_message,
            "null": required_message,
        }
    )
    password = StrictCharField(
        trim_whitespace=False,
        write_only=True,
        error_messages={
            "required": required_message,
            "blank": required_message,
            "null": required_message,
            "invalid": required_message,
        },
    )
    username = StrictCharField(
        required=False, allow_blank=True, allow_null=True, max_length=150
    )


class ForgotPasswordRequestSerializer(serializers.Serializer):
    email = NormalizedEmailField(
        error_messages={
            "required": "Email is required.",
            "blank": "Email is required.",
            "null": "Email is required.",
        }
    )


class ResetPasswordRequestSerializer(serializers.Serializer):
    required_message = "uid, token, and password are required."
    link_errors = {
        "required": required_message,
        "blank": required_message,
        "null": required_message,
        "invalid": "Invalid or expired reset link.",
    }
    uid = StrictCharField(trim_whitespace=False, error_messages=link_errors)
    token = StrictCharField(trim_whitespace=False, error_messages=link_errors)
    password = StrictCharField(
        trim_whitespace=False,
        write_only=True,
        error_messages={
            "required": required_message,
            "blank": required_message,
            "null": required_message,
            "invalid": "Invalid password.",
        },
    )


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    email = serializers.EmailField(required=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields[self.username_field].required = False
        self.fields["password"] = StrictCharField(
            trim_whitespace=False, write_only=True, style={"input_type": "password"}
        )

    def validate(self, attrs):
        email = attrs.get("email")
        if isinstance(email, str):
            email = email.strip().lower()
            attrs["email"] = email

        username = attrs.get(self.username_field)

        if not email and not username:
            raise serializers.ValidationError({"email": ["This field is required."]})

        if email and not username:
            user = User.objects.filter(email__iexact=email).first()
            if user:
                attrs[self.username_field] = user.get_username()
            else:
                attrs[self.username_field] = email

        data = super().validate(attrs)
        # Include basic user info so clients can greet/identify the logged-in user
        # without a follow-up request.
        data["username"] = self.user.get_username()
        data["email"] = self.user.email
        return data
