# Marty's Journal - Critical Learnings

## 2026-09-07 - Django Test Execution Speed and Secret Key Requirements
**Learning:** Default PBKDF2 password hashing in Django runs 720,000 iterations per hash, causing backend unit test suites to time out (>400s) when creating multiple test users. Additionally, PyJWT/SimpleJWT requires `SECRET_KEY` to be at least 32 bytes long for HS256, otherwise emitting `InsecureKeyLengthWarning` on every request during tests.
**Action:** Keep `PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]` active in `backend/app/settings.py` when running tests (`'test' in sys.argv`), and ensure default `SECRET_KEY` is at least 32 characters long.
