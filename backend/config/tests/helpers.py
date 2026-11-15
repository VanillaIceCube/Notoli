import json

import requests

SETTINGS_PROBE = """
import json
import sys
import types
from unittest.mock import patch

sys.argv = ['manage.py', 'test']
sys.modules['pytest'] = types.ModuleType('pytest')
with patch('dotenv.load_dotenv', return_value=False):
    from django.conf import settings
    from django.contrib.auth.hashers import get_hasher
    print(json.dumps({
        'algorithm': get_hasher().algorithm,
        'key_length': len(settings.SECRET_KEY),
    }))
"""


BACKEND = "anymail.backends.resend.EmailBackend"


API_KEY = "test-only-resend-api-key"


OPTIONS = {
    "RESEND_API_KEY": API_KEY,
    "REQUESTS_TIMEOUT": 7,
    "DEBUG_API_REQUESTS": False,
}


def api_response(status=200):
    response = requests.Response()
    response.status_code = status
    response.reason = "synthetic provider response"
    response.url = "https://api.resend.com/emails"
    response.headers["Content-Type"] = "application/json"
    response._content = json.dumps({"id": "synthetic-message-id"}).encode()
    return response


EMAIL_SETTINGS_PROBE = """
import json
import os
from unittest.mock import patch

with patch('dotenv.load_dotenv', return_value=False):
    from django.conf import settings
    print(json.dumps({
        'backend': settings.EMAIL_BACKEND,
        'timeout': settings.ANYMAIL['REQUESTS_TIMEOUT'],
        'debug': settings.ANYMAIL['DEBUG_API_REQUESTS'],
        'key_present': 'RESEND_API_KEY' in settings.ANYMAIL,
        'key_preserved': settings.ANYMAIL.get('RESEND_API_KEY') == os.getenv('DJANGO_EMAIL_HOST_KEY'),
    }))
"""
