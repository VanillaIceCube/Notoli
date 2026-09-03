# Marty's Journal

## 2026-03-31 - Fast Password Hashing for Django Tests **Learning:** Default PBKDF2 password hashing in Django slows down authentication-heavy test suites dramatically (>460s for 123 tests, causing timeouts). Configuring MD5PasswordHasher when running tests reduces backend test execution time to under 16 seconds. **Action:** Ensure `PASSWORD_HASHERS` is overridden with fast hashers during test runs in Django settings.
