# Changelog
All notable changes to this project are documented in this file.

## 2026-01-19
### Added
- Added a GitHub Actions workflow to run frontend and backend tests (`tests.yaml`).
- Added a Dependabot auto-merge workflow for patch/minor updates.
- Added a ChatGPT summary comment for Dependabot major version updates.
- Added GitHub YAML linting with auto-formatting for `.github` YAML files in the lint workflow.
- Added a Continuous Integration workflow to run Lint and Tests as a single CI gate.
- Added PR summary concurrency cancellation to stop outdated summaries on new commits.
- Added a CRA-compatible frontend ESLint configuration file (`frontend/.eslintrc.js`).
### Changed
- Updated Dependabot config to run daily updates for npm, GitHub Actions, and Docker.
- Renamed GitHub Actions workflow files to use plural names (`lints.yaml`, `pr_summaries.yaml`).
- Replaced the Dependabot auto-approval action with a GitHub API call to avoid the missing action repo.
- Dependabot auto-merge now triggers after Continuous Integration completes and builds a metadata event payload.
- Dependabot major updates now call OpenAI and log the response before posting a PR comment.
- Lint and Tests now run via the Continuous Integration workflow only, with reusable workflow calls.
- Lint change detection now uses PR base/head SHAs when available for workflow calls.
- Removed inherited secrets from the Continuous Integration workflow calls.
- Renamed the Continuous Integration workflow file to `continuous_integration.yaml`.
- Updated frontend ESLint dependencies to align with CRA compatibility.

## 2026-01-18
### Added
- Added frontend test utilities for shared theme/router setup (`frontend/src/test-utils.js`).
- Added distinct login messaging for workspace HTTP failures versus network errors.
- Added a frontend login test to confirm tokens are not stored on failure.
- Added a frontend login test for network error snackbar behavior.
- Added frontend login tests for network error token storage and navigation behavior.
- Added a frontend login test for workspace fetch failure snackbar and navigation.
- Added frontend login tests for navigating when workspaces exist or are empty.
- Added frontend registration page, routing, and tests.
- Added a custom auth user model with unique email and admin registration.
- Added email-aware JWT login serializer and view.
- Added backend Ruff config for import grouping rules.
- Added default workspace creation for new users and return of registration tokens/workspace id.
### Changed
- Refactored frontend login tests to use shared test utilities.
- Routed frontend login/register flows through `BackendClient` and added a register helper.
- Updated login/register tests to mock `BackendClient` helpers instead of `apiFetch`.
- Updated login error handling to show a network error message when fetch fails.
- Updated login UI/tests to send email instead of username.
- Updated auth page UI to support registration and inline account links.
- Updated auth login to accept email credentials via a custom JWT serializer.
- Updated auth registration to require email and derive usernames from email.
- Updated notes models/tests for custom user model compatibility.
- Updated admin to hide Group/Permission from the admin sidebar.
- Updated Ruff config to ignore line-length errors.
- Updated registration flow to auto-login and redirect to the new workspace.

## 2026-01-17
### Added
- Added frontend login test covering a successful login flow (`Login.test.js`).
- Added frontend login test covering failed login handling (`Login.test.js`).
### Changed
- Updated frontend login test to silence React Router future-flag warnings and MUI ripple act() warnings.
- Silenced expected auth failure logging noise in login tests.

## 2026-01-15
### Added
- Added frontend login smoke test (`Login.test.js`).
- Added Jest DOM setup for frontend tests (`src/setupTests.js`).

## 2026-01-13
### Added
- Added Notes API tests covering many-to-many membership and removal filtering.
### Changed
- Updated Notes API handling to support many-to-many `TodoList.notes` on create and filtering.
- Iterated PR summary workflow behavior to overwrite the PR description summary.

## 2026-01-12
### Added
- Added Codex-based PR summary automation.
- Added `AGENTS.md`.
- Added authentication tests:
  - `RegistrationTests`
  - `LoginTests`
  - `RefreshTokenTests`
  - `AuthMethodTests`
### Changed
- Renamed `pr_review` to `pr_summary` and refined summary formatting.

## 2025-12-08
### Added
- Added frontend environment defaults and API client helper (`frontend.env`, `src/services/client.js`).
- Added CORS configuration to backend environment settings.
### Changed
- Updated Docker Compose ordering and environment wiring.
- Updated frontend pages to use environment-based API base URLs.

## 2025-12-07
### Added
- Added root environment defaults (`.env` / `default.env`) for local configuration.
### Changed
- Updated backend settings to support debug flags, secret keys, and SQLite persistence.
- Updated Docker Compose to align with new environment defaults.

## 2025-11-24
### Changed
- Updated Dockerfiles and backend environment settings for deployment.
### Removed
- Removed dev Docker files.

## 2025-11-23
### Changed
- Updated deployment configuration (Dockerfiles, ports, host allowlists, and performance settings).

## 2025-11-17
### Added
- Added production Docker Compose file (`docker-compose.prod.yml`).
### Changed
- Updated Docker Compose configuration for deployment needs.

## 2025-11-16
### Changed
- Updated `environment.yml` and dependency configuration for Python 3.12 stability.

## 2025-11-15
### Added
- Added frontend auto-fix and commit linting.
- Added backend auto-fix and commit linting.
- Added instructions to `environment.yml`.
### Removed
- Removed `fetchWorkspaceName` and `workspaceData`.

## 2025-10-27
### Added
- Added frontend linting tests and initial lint workflow setup.
### Fixed
- Appbar header now removes the header within the TodoLists page.

## 2025-10-26
### Removed
- Removed the header from the TodoLists page.

## 2025-10-25
### Changed
- Updated login to redirect to the first workspace.
### Removed
- Removed ability to navigate backwards from the TodoLists page.

## 2025-10-21
### Added
- Added triple-dot menu support for workspace actions in `MyDrawer.js` (edit and delete).
- <img width="447" height="953" alt="image" src="https://github.com/user-attachments/assets/288c6c69-9568-4c9b-9df7-d4a29946ab2c" />

## 2025-10-13
### Added
- Drawer now dynamically expands when adding a new workspace.
- <img width="452" height="960" alt="image" src="https://github.com/user-attachments/assets/74875f73-cc5c-4538-a85b-4fe4acd53dd6" />

## 2025-09-29
### Changed
- Minor formatting updates in drawer-related components.

## 2025-09-28
### Added
- Navigation via `MyDrawer.js`.
- Basic add functionality in `MyDrawer.js`.
- Added error and loading messages in `MyDrawer.js`.
### Changed
- Aesthetic changes to workspace selector in `MyDrawer.js`.

## 2025-09-23
### Added
- Workspaces are now in the drawer.
 - Can't navigate with them yet tho.

## 2025-09-22
### Added
- `MyDrawer` now fetches workspace name.
- <img width="452" height="953" alt="image" src="https://github.com/user-attachments/assets/b581481c-bc33-4c10-808f-01aefc8ff11c" />
- `getWorkspaceId` in utils.
### Changed
- Added notoli typography to `Login.js`.
- <img width="451" height="956" alt="image" src="https://github.com/user-attachments/assets/bcd079b1-beb5-4078-99a1-650beeb8d58a" />

## 2025-09-08
### Changed
- Drawer styling.
- <img width="449" height="953" alt="image" src="https://github.com/user-attachments/assets/86207c4d-ffa2-4e70-b6a1-58b6b5252287" />
- Modularized `getParentPath` and `goBackToParent` into `Navigation.js`.

## 2025-09-02
### Added
- Back button.
- <img width="450" height="953" alt="image" src="https://github.com/user-attachments/assets/c95f7a88-6c38-4aa3-98c8-9e6a74b192de" />
- Drawer.
- <img width="445" height="955" alt="image" src="https://github.com/user-attachments/assets/e57e42de-9964-464f-b559-1c27575735f1" />
### Changed
- Shifted the appbar components around.
- Back button no longer renders on the `workspaces.js`.
- Changing my branching strategy again.
  - No more dev, just main now.
  - When I deploy, I'll create a prod.
### Removed
- Unnecessary `React` import from `MyAppBar.js`.

## 2025-08-11
### Added
- App Bar added with dynamic header text for Workspace, Todo Lists, and Notes pages.
- <img width="447" height="954" alt="image" src="https://github.com/user-attachments/assets/f7fd5187-9347-4b0a-8d99-4a31d3ac12bb" />
### Fixed
- Filled in contact info placeholder in the `LICENSE.md`.
- Fixed UI messages in `Notes.js`.

## 2025-07-28
### Added
- Introduced a centralized Snackbar component in `App.js`, enabling consistent notifications across pages.
- Enhanced `Login.js` to utilize the global Snackbar for displaying login success and error messages.
### Changed
- Refactored `App.js` to manage Snackbar state and provide a unified Snackbar experience.
- Updated `Login.js` to delegate Snackbar displays to the new centralized Snackbar management in `App.js`.
- `autoHideDuration` in `MySnackbar` shortened.
- Updated import formatting in `App.js` to improve consistency.

## 2025-07-20
### Added
- Finished `TodoLists.js` with full CRUD functionality.
- <img width="443" height="952" alt="image" src="https://github.com/user-attachments/assets/dfd98820-40ce-487b-8037-6c156d5c2ff9" />  
- Finished `Notes.js` with full CRUD functionality.
- <img width="447" height="956" alt="image" src="https://github.com/user-attachments/assets/82fa7dbd-b6a7-4adc-914c-5c91d4435d02" />
- Introduced workspace-scoped and nested routes in `App.js`:
  - `/workspaces/:workspaceId` for workspace-scoped TodoLists
  - `/workspaces/:workspaceId/todolist/:todoListId` to render Notes
- Extended `TodoListSerializer` and `NoteSerializer` with optional `owner` and `created_by` fields.
- Implemented dynamic routing in `TodoLists.js` and `Notes.js` using `useParams`.
- Added navigation improvements in `Workspaces.js`, `TodoLists.js`, and `Notes.js` via `useNavigate`.
- Built initial fetch logic in `TodoLists.js` and `Notes.js` to load workspace-specific data.
### Fixed
- Corrected typos and improved error handling in `views.py` (todos and notes).
- Resolved workspace access validation issues in `views.py`.
- Adjusted placement of `useNavigate` in `Login.js`.
- Fixed variable naming inconsistency in `todo_list` and `note` across backend and frontend.
### Changed
- Enhanced fetch logic in `TodoLists.js` and `Notes.js` to include `?workspace=<id>`.
- Updated DRF settings to enable default filters and permissions for todos and notes.
- Added `django-filter` to project dependencies.
- Updated route paths in `App.js` for consistent workspace routing of todos and notes.
- Enhanced path parameter handling in `TodoLists.js`, `Notes.js`, and related components for consistency.
- Renamed and reorganized branches for dev/prod workflow.

## 2025-07-18
### Changed
- Refactored `Workspaces.js` to add missing Pessimistic Local Merge comments and adjust whitespace.

## 2025-07-17
### Added
- Added editing functionality for workspaces in `Workspaces.js`.
- <img width="443" height="949" alt="image" src="https://github.com/user-attachments/assets/b3c1bd23-555d-4681-b206-5af78d953213" />
### Changed
- Refactored workspace name handling in `Workspaces.js` for create and edit flows.
- Switched `Workspaces.js` to a pessimistic local merge approach.

## 2025-07-04
### Added
- Added edit useStates, `isEditing`, and `editAnchorElement`.
### Fixed
- Resolved an ESLint warning in `Workspaces.js` by refactoring `fetchWorkspaces` with `useCallback`.

## 2025-06-30
### Added
- Deletion capabilities in `Workspaces.js`, allowing users to remove workspaces directly from the interface.
### Changed
- Improved UI update after deleting a workspace by modifying the state update logic.  
- Refactored state management and menu handling in `Workspaces.js`:  
  - Replaced `anchorEl` and `selectedList` with `tripleDotAnchorElement` and `selectedWorkspace` for clarity.  
  - Enhanced function organization and naming for triple-dot menu interactions.  
  - Streamlined MUI component handling for better code readability.  
- Refactored workspace fetching mechanism in `Workspaces.js` by encapsulating it into a dedicated `fetchWorkspaces` function.  
- Introduced error handling and state management improvements in the `onSaveNew` function within `Workspaces.js`.  
- Added a new `onDelete` function in `Workspaces.js` for handling workspace deletions seamlessly.  
- Implemented a pessimistic local-merge strategy in `Workspaces.js` to update the UI immediately after workspace creation.
- Refactored `Workspaces` component in `Workspaces.js`:
  - Renamed `onSaveNew` to `onAdd` for function clarity.
  - Renamed state variable `newName` to `WorkspaceName` for enhanced readability.
### Fixed
- Corrected the deletion process in `Workspaces.js` by ensuring proper API call syntax with template literals.  
- Updated error handling in the `onDelete` function to reset errors before attempting deletion.
### Removed
- Removed the unused `onStartAdding` function from `Workspaces.js` in the frontend to clean up the codebase.

## 2025-06-24
### Added
- Basenames to the URL router in `urls.py` for enhanced reverse URL lookups.
- Introduced a triple-dot menu for managing workspaces in `Workspaces.js`.
- ![image](https://github.com/user-attachments/assets/a0277a31-b8be-4a1c-a854-0c5ccad291bd)
- Enhanced UI styling on the Workspaces page by adding background colors to `Divider` components and updating styles for `Menu` and `MenuItem` components.
- ![image](https://github.com/user-attachments/assets/8ef1ae12-c2d9-4960-960b-ab4c4437cf34)
- Added functionality to create new workspaces in the UI, allowing users to input workspace names directly.
- ![image](https://github.com/user-attachments/assets/12794334-0ab8-4af9-9adf-fe3268992c30)
- Aligned text to the left in workspace titles for improved readability.
- Updated `TextField` styling to ensure consistent color themes, including focus and underline effects.
- ![image](https://github.com/user-attachments/assets/5d0de5ea-29c0-455a-85a7-df26b39923f7)
### Fixed
- Resolved an issue preventing creation of new workspaces from the UI.

### Changed
- `WorkspaceSerializer` now treats `owner` and `created_by` fields as optional during creation.
- `AuthenticatedRoute` component updated to use `sessionStorage` for token retrieval.
- Renamed "Dianas TODO List" to "New Workspace" in `Workspaces.js`.
- Updated `Workspaces.js` header text from "Todo Lists" to "Workspaces".

## 2025-06-23
### Fixed
- Filtered notes by user and removed frontend owner hacks.

### Changed
- Refactored the `models.py` in the `notes` app for improved clarity and organization:
  - Renamed the `TodoList` model to `Workspace`.
  - Renamed `TodoListView` to `TodoList`, now representing a singular to-do list within a `Workspace`.
  - Modified relationships to reflect the new model structure.
  - Adjusted related names and verbose names accordingly.
  - Adjusted `admin`, `serializers`, `urls`, and `views` to match.
- Reset the database to align with the refactor.
- Refactored frontend to match refactored backend:
  - Replaced `TodoLists` with `Workspaces` in the App.js routing.
- Token changes from local to session storage.
### Removed
- Removed `TodoLists.js` file and its references.

## 2025-06-20
### Added
- Implemented the `handleAddNew` function to allow creating new TODO lists from the frontend.
### Changed
- Updated "Add New" button in `TodoLists.js` to trigger the new list creation functionality.
- Removed comment related to hardcoding of the API URL in `TodoLists.js`.
- Refactored `Login.js` and `TodoLists.js` components to simplify JSX and consolidate `sx` prop configurations for improved readability.

## 2025-06-19
### Changed
- Refactored global CSS to use theme variables for consistent theming.
- Updated `Login.js` styling with secondary colors and custom backgrounds.
- ![image](https://github.com/user-attachments/assets/539fea36-6cee-4bbd-9eb6-d88f92581fba)
- Enhanced `TodoLists` UI with dividers and improved button layouts.
- ![image](https://github.com/user-attachments/assets/5c51836d-4297-4686-958a-684312f98db6)
### Removed
- Removed stray trailing lines in components.

## 2025-06-16
### Added
- Introduced initial `TodoLists` interface using Material UI.
- ![image](https://github.com/user-attachments/assets/50279d64-9d56-41e6-b3bd-e567e1b28a4e)
- Fetches lists from the API with loading and error states.
- Basic view to list existing todo lists.
### Changed
- Replaced the old Homepage route with the TodoLists page.
- Minor layout tweaks for vertical alignment.

## 2025-05-12
### Added
- Snackbar notifications for login success and failure states.
- `AuthenticatedRoute` wrapper for automatic redirect when not logged in.
### Changed
- Reduced login redirect delay for a faster transition.

## 2025-05-11
### Added
- React Router configuration and global styling utilities.
- Preliminary snackbar logic for the login page.

## 2025-05-05
### Added
- Placeholder home page component.
### Fixed
- Minor bug fixes in App.js and login page.

## 2025-05-04
### Added
- Login page wired to backend authentication via Axios.
- ![image](https://github.com/user-attachments/assets/bf9cca23-1da6-4efd-a115-5f20f675b979)
- CORS support in the backend using `django-cors-headers`.
### Changed
- Removed unused CRA boilerplate and cleaned default styles.

## 2025-05-03
### Added
- `TodoListView` model and REST endpoints for todo lists, notes, and views.
- Simple JWT authentication endpoints for register, login, and token refresh.
### Changed
- Renamed models (`Todi` -> `TodoList`, `Noti` -> `Note`) and updated admin and serializers.
### Removed
- Default frontend assets and test files from CRA template.

## 2025-04-28
### Added
- `notes` app with initial models, migrations, and API endpoints.
- Owners and collaborators fields for todo lists and notes.
- `environment_conda_export.py` helper script.
- REST APIs using Django REST Framework.
### Fixed
- Corrected model naming conventions in admin files.
### Changed
- Updated LICENSE and README to credit `conda_export.py` by Andres Berejnoi.
### Removed
- Temporary `users` app.

## 2025-04-26
### Added
- Created project changelog.

## 2025-04-25
### Fixed
- Minor formatting tweaks across Docker and configuration files.

## 2025-04-24
### Added
- Frontend, backend, and Docker scaffolding.
- Initial `environment.yml` and Docker Compose setup.
### Changed
- README and `.gitignore` revisions.

## 2025-04-20
### Added
- Initial repository with base README and LICENSE.
