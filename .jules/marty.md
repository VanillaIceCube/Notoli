## 2026-09-11 - Fast Password Hashing for Django Tests

**Learning:** In Django, default password hashing uses PBKDF2/Argon2 which is intentionally slow for security. During automated test runs, creating multiple users with standard hashers causes test execution to take several minutes or time out. Setting `PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]` when `"test" in sys.argv` drastically reduces test runtime from minutes to seconds without affecting production password security.

**Action:** Maintain the test password hasher setting in `backend/app/settings.py` so backend tests execute fast across all environments and CI/CD runs.
