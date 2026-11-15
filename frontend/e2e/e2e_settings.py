"""Disposable browser-test settings. Never load a developer/production .env."""
import os
from importlib import import_module
from pathlib import Path

import dotenv

dotenv.load_dotenv = lambda *args, **kwargs: False

# Copy only Django setting constants; keep imported helper names private.
base_settings = import_module("app.settings")
for setting_name in dir(base_settings):
    if setting_name.isupper():
        globals()[setting_name] = getattr(base_settings, setting_name)

state = Path(os.environ["E2E_STATE_DIR"])
SECRET_KEY = "isolated-browser-test-key-not-for-deployment"
DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": state / "db.sqlite3"}}
EMAIL_BACKEND = "django.core.mail.backends.filebased.EmailBackend"
EMAIL_FILE_PATH = str(state / "emails")
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CORS_ALLOWED_ORIGINS = ["http://127.0.0.1:3001"]
CSRF_TRUSTED_ORIGINS = ["http://127.0.0.1:3001"]
FRONTEND_BASE_URL = "http://127.0.0.1:3001"
