## 2026-08-30 - Notification Dispatch Error Handling
**Learning:** Notification dispatch calls during board, list, and note operations must be wrapped in `try...except Exception:` blocks so background notification failures do not break core CRUD database operations or raise 500 responses to clients.
**Action:** When adding or updating notification triggers in DRF viewsets, wrap notification calls defensively and log exceptions using `logger.exception`.
