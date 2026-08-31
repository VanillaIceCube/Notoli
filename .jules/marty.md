# Marty's Journal - Critical Learnings

## 2026-03-31 - Backend Test Suite Password Hashing Performance **Learning:** Standard PBKDF2 password hashing during Django test execution slows down test suites dramatically when many users are created across tests, causing test runs to exceed subagent timeouts (>400s). **Action:** Use `MD5PasswordHasher` when `'test' in sys.argv` in `backend/app/settings.py` so backend tests run fast (~14s for 123 tests) while keeping default password hashing intact for production and dev server environments.
