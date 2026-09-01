# Marty's Journal

## 2026-08-31 - Fast Password Hasher for Test Suite Execution
**Learning:** Django defaults to standard PBKDF2 password hashing which is intentionally slow. Across 123 backend unit tests creating user accounts, hashing passwords with PBKDF2 took >400s (timing out test commands). Switching `PASSWORD_HASHERS` to `MD5PasswordHasher` when `test` is present in `sys.argv` reduced test execution time to ~16 seconds while preserving full authentication logic and test validity.
**Action:** Retain `PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]` conditional check in `backend/app/settings.py` for all automated test runs.
