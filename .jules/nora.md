# Nora's Architectural Learnings Journal

This journal tracks durable architectural learnings for the Notoli repository.

## 2026-09-09 - Lists vs Tasks Page Architectural Analysis (#511)
**Learning:**
A side-by-side comparative analysis between `BoardListsPage` (`frontend/src/pages/boards/BoardListsPage.js`) and `ListTasksPage` (`frontend/src/pages/lists/ListTasksPage.js`) reveals strong architectural alignment alongside key domain-specific differences:

### 1. Shared UI Patterns & Layout Structure
Both pages leverage the common `components/notepadPages/` abstraction layer:
- **`NotepadPageShell`**: Wraps loading, error banner, pull-to-refresh indicators, and the page title/header.
- **`SortableNotepadItems`**: Manages `@dnd-kit/sortable` list context and drag handle touch styles.
- **`InlineTextEditor`**: Handles inline item creation and renaming.
- **`NotepadRowActionMenu`**: Standardized MUI popover menu offering Rename, Reorder, and Delete actions.

### 2. Shared State & Logic Patterns
- **Local State Structure**: `items` array (`lists` vs `tasks`), `loading`, `error`, `isReordering`, `actionMenuAnchorEl`, `selectedItem`, `isAdding`, `newItemName`, `editingItemId`, `editItemName`.
- **Drag-and-Drop Reordering**: Optimistic update using `arrayMove`, followed by a backend `reorderLists` or `reorderNotes` API call with rollback on error.
- **Pull-To-Refresh Integration**: `usePullToRefresh` hook disabled when loading, reordering, editing, adding, or when action menu is open.
- **Action Menu Workflow**: Standardized open, start editing, start reordering, delete, and close actions.

### 3. Key Differences
- **Domain & API Binding**: `BoardListsPage` targets `/api/lists/?board={boardId}` (`fetchLists`, `createList`, `updateList`, `deleteList`, `reorderLists`). `ListTasksPage` targets `/api/notes/?list={listId}` (`fetchNotes`, `createNote`, `updateNote`, `deleteNote`, `reorderNotes`).
- **Task Completion & Item Row**: `ListTasksPage` items render a `Checkbox` control that toggles status (`Not Started` vs `Complete`), applying `opacity: 0.72` and `textDecoration: 'line-through'`. `BoardListsPage` item rows are navigation buttons (`Button`) that route to `/board/:boardId/list/:listId`.
- **Navigation & Page Titles**: `BoardListsPage` consumes `boardId` and clears `setAppBarHeader`, displaying `Notoli - {boardName}` in `document.title`. `ListTasksPage` consumes `boardId` & `listId`, sets `setAppBarHeader` to `boardName`, and displays `Notoli - {boardName} - {listName}` in `document.title`.

### 4. Recommended Reusable Component & Hook Breakdown
1. **`useNotepadPage` Custom Hook**: A reusable hook encapsulating standard item state (items, loading, error, isReordering, isAdding, editingId, actionMenuAnchor) and dnd reordering / gesture handlers, parameterized by item fetcher, creator, updater, deleter, and reorderer.
2. **Row Components**: Keep `ListRow` and `TaskRow` decoupled from each other rather than introducing a single conditional row component, as list navigation and task checkbox completion serve distinct domain concepts.

**Action:**
When refactoring notepad pages, extract shared item state and dnd reordering into custom hooks (`useNotepadPage` or `useBoardLists` / `useListTasks`) while preserving distinct row components (`ListRow` / `TaskRow`) to avoid premature abstraction.
