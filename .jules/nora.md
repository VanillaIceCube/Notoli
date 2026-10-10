# Nora's Architectural Learnings Journal

This journal tracks durable architectural learnings for the Notoli repository.

## 2026-09-16 - Board Navigation Drawer Modularization
**Learning:**
`BoardNavigationDrawer` previously contained all drawer state, board CRUD operations, share dialog state, and active route board name fetching within the UI component file (~540 lines). Extracting these stateful operations into `useBoardNavigationDrawer` (`frontend/src/hooks/useBoardNavigationDrawer.js`) cleanly separates UI rendering from state and network side-effects.

**Action:**
When refactoring complex drawer or dialog components, extract underlying state management, API interactions, and route bindings into dedicated hooks while keeping the layout component purely focused on UI rendering.
