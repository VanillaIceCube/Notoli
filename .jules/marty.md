## 2026-09-11 - Fast Password Hashing for Django Tests

**Learning:** In Django, default password hashing uses PBKDF2/Argon2 which is intentionally slow for security. During automated test runs, creating multiple users with standard hashers causes test execution to take several minutes or time out. Setting `PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]` when `"test" in sys.argv` drastically reduces test runtime from minutes to seconds without affecting production password security.

**Action:** Maintain the test password hasher setting in `backend/app/settings.py` so backend tests execute fast across all environments and CI/CD runs.

## 2026-09-13 - Resilient Secondary Notification Triggers

**Learning:** Secondary side-effects like notification dispatches should be wrapped in exception-safe handlers (`safe_notify_board_members` / `safe_create_notification`) rather than called bare during primary resource mutations (boards, lists, notes, collaborators). This prevents infrastructure or notification schema issues from causing HTTP 500 errors on valid core business operations.

**Action:** Always dispatch board and item notifications using `safe_notify_board_members` and `safe_create_notification` to guarantee resilient CRUD endpoints.
