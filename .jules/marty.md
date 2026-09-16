# Marty's Journal - General Repository Health Learnings

## 2026-03-31 - Accelerate Backend Test Suite Execution via Fast Password Hasher
**Learning:** Default Django password hashers (e.g., PBKDF2) consume significant CPU time when creating user fixtures repeatedly across tests. Setting `PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]` during test execution (checking `sys.argv`, `pytest`, or `DJANGO_TESTING`) dramatically reduces test runtimes without affecting functional test assertion validity.
**Action:** Always maintain the test environment check in `backend/app/settings.py` so that password hashing during test runs uses fast hashers, keeping test suite execution under runner timeout limits.
