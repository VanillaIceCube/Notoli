# Marty's Journal - Daily General Repository Health

## 2026-09-10 - Accelerate Backend Test Execution with Fast Password Hasher
**Learning:** Running Django test suite with default PBKDF2 password hashing resulted in execution times exceeding 7 minutes (>400 seconds), causing timeouts during test runs. Switching `PASSWORD_HASHERS` to `MD5PasswordHasher` during test runs (`if "test" in sys.argv:`) reduced execution time for all backend tests to ~15 seconds.
**Action:** Always maintain fast password hashing under test execution (`PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]`) in `backend/app/settings.py` so that backend test execution remains fast and within tool timeout limits.
