import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from django.core.management.utils import get_random_secret_key
from dotenv import load_dotenv

from apps.mcp.framework.config import oauth_settings

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY.strip():
    if not DEBUG:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY is required when DJANGO_DEBUG=0.")
    SECRET_KEY = get_random_secret_key()

ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

extra_hosts = os.getenv("DJANGO_ALLOWED_HOSTS")
if extra_hosts:
    ALLOWED_HOSTS.extend(extra_hosts.split(","))

# ASGI validates the actual proxy peer before accepting forwarded metadata.
SECURE_PROXY_SSL_HEADER = None
USE_X_FORWARDED_HOST = False
FRONTEND_BASE_URL = os.getenv(
    "DJANGO_FRONTEND_BASE_URL", "http://localhost:3000"
).rstrip("/")


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "anymail",
    "apps.authentication",
    "apps.tasks",
    "apps.notifications",
    "apps.mcp.tools",
    "apps.mcp.framework",
]


MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
]


CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
]

extra_origins = os.getenv("DJANGO_CORS_ALLOWED_ORIGINS")
if extra_origins:
    CORS_ALLOWED_ORIGINS.extend(extra_origins.split(","))

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
]

extra_csrf_origins = os.getenv("DJANGO_CSRF_TRUSTED_ORIGINS")
if extra_csrf_origins:
    CSRF_TRUSTED_ORIGINS.extend(extra_csrf_origins.split(","))


REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
}


ROOT_URLCONF = "config.urls"


TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# MCP uses its own OAuth tokens. These are never accepted by the REST API.
MCP_ENABLED = os.getenv("DJANGO_MCP_ENABLED", "0") == "1"
MCP_NAME = "Notoli"
MCP_BASE_URL = os.getenv("DJANGO_MCP_BASE_URL", "http://localhost:8000").rstrip("/")
MCP_RESOURCE_URL = f"{MCP_BASE_URL}/mcp"
MCP_SERVER_FACTORY = (
    os.getenv("DJANGO_MCP_SERVER_FACTORY") or "apps.mcp.tools.server.create_server"
)
TRUSTED_PROXY_IPS = [
    address.strip()
    for address in os.getenv("DJANGO_TRUSTED_PROXY_IPS", "").split(",")
    if address.strip()
]
MCP_CONSENT_SALT = "notoli.mcp.consent"
MCP_REQUIRED_SCOPES = ["notoli:read"]
MCP_ACTION_APPROVAL_HANDLER = "apps.mcp.tools.services.action_approval"
OAUTH2_PROVIDER = oauth_settings(
    base_url=MCP_BASE_URL,
    scopes={
        "notoli:read": "Read your accessible Notoli boards, lists, and tasks, including board owner and collaborator IDs, usernames, and email addresses",
        "notoli:write": "Add and update tasks in your accessible Notoli boards and lists",
        "notoli:share": "Add collaborators directly to boards you own, granting access to every list and task; removing a collaborator requires your separate approval in Notoli",
        "notoli:organize": "Create and edit boards and lists, reorder lists and tasks, and add list memberships directly; removing any existing list membership requires your separate approval in Notoli",
        "notoli:notifications": "Read your activity notifications and mark them read or unread",
        "notoli:delete": "Prepare permanent deletion of accessible tasks and lists, owned boards with their contents, and your notifications; each deletion requires your separate approval in Notoli",
    },
    required_scopes=MCP_REQUIRED_SCOPES,
)
if MCP_ENABLED:
    INSTALLED_APPS += ["oauth2_provider"]
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("DJANGO_SQLITE_PATH", BASE_DIR / "db.sqlite3"),
    }
}


AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


AUTH_USER_MODEL = "authentication.User"


# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


STATIC_URL = "/static/"

STATIC_ROOT = BASE_DIR / "staticfiles"


DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Email
EMAIL_BACKEND = os.getenv(
    "DJANGO_EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = os.getenv("DJANGO_EMAIL_HOST", "smtp.resend.com")
EMAIL_PORT = int(os.getenv("DJANGO_EMAIL_PORT") or "587")
EMAIL_USE_TLS = os.getenv("DJANGO_EMAIL_USE_TLS", "1") == "1"
EMAIL_HOST_USER = os.getenv("DJANGO_EMAIL_HOST_USER", "resend")
EMAIL_HOST_PASSWORD = os.getenv("DJANGO_EMAIL_HOST_KEY", "")
EMAIL_TIMEOUT = int(os.getenv("DJANGO_EMAIL_TIMEOUT") or "10")
ANYMAIL = {
    "REQUESTS_TIMEOUT": EMAIL_TIMEOUT if 0 < EMAIL_TIMEOUT <= 30 else 10,
    "DEBUG_API_REQUESTS": False,
}
if isinstance(EMAIL_HOST_PASSWORD, str) and EMAIL_HOST_PASSWORD.strip():
    ANYMAIL["RESEND_API_KEY"] = EMAIL_HOST_PASSWORD
DEFAULT_FROM_EMAIL = os.getenv("DJANGO_DEFAULT_FROM_EMAIL", "notoli@example.com")
