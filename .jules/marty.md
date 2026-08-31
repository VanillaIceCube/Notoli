# Marty's Journal — Critical Learnings

## 2026-08-31 - Fast Password Hashing for Django Test Suite **Learning:** Django default PBKDF2 password hashing causes `python3 manage.py test` to take >400 seconds and time out due to user creation overhead in tests. **Action:** Ensure settings configure `PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]` during test runs (`"test" in sys.argv` or `TESTING=1`), allowing all 120+ backend tests to execute in under 15 seconds.
