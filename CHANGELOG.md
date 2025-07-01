# Changelog
All notable changes to this project are documented in this file.


## 2025-06-30
### Changed
- Removed the unused `onStartAdding` function from `Workspaces.js` in the frontend to clean up the codebase.
- Refactored state management and menu handling in `Workspaces.js`:
  - Improved clarity by replacing `anchorEl` and `selectedList` with `tripleDotAnchorElement` and `selectedWorkspace`.
  - Enhanced function organization and naming for triple-dot menu interactions.
  - Streamlined UI component handling for better code readability.
- Refactored workspace fetching mechanism in `Workspaces.js` by encapsulating it into a dedicated `fetchWorkspaces` function.
- Introduced error handling and state management improvements in `onSaveNew` function within `Workspaces.js`.
- Added a new `onDelete` function in `Workspaces.js` for handling workspace deletions seamlessly.


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
### Changed
- `WorkspaceSerializer` now treats `owner` and `created_by` fields as optional during creation.
- `AuthenticatedRoute` component updated to use `sessionStorage` for token retrieval.
- Renamed "Dianas TODO List" to "New Workspace" in `Workspaces.js`.
- Updated `Workspaces.js` header text from "Todo Lists" to "Workspaces".


## 2025-06-23
### Changed
- Refactored the `models.py` in the `notes` app for improved clarity and organization:
  - Renamed the `TodoList` model to `Workspace`.
  - Renamed `TodoListView` to `TodoList`, now representing a singular to-do list within a `Workspace`.
  - Modified relationships to reflect the new model structure.
  - Adjusted related names and verbose names accordingly.
  - Adjusted `admin`, `serializers`, `urls`, and `views` to match
- Nuked the database...
- Refactored frontend to match refactored backend
  - Replaced `TodoLists` with `Workspaces` in the App.js routing.
  - Removed `TodoLists.js` file and its references.
- token changes from local to session storage


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


## 2025-05-04
### Added
- Login page wired to backend authentication via Axios.
- ![image](https://github.com/user-attachments/assets/bf9cca23-1da6-4efd-a115-5f20f675b979)
- CORS support in the backend using `django-cors-headers`.
### Changed
- Removed unused CRA boilerplate and cleaned default styles.


## 2025-05-03
### Added
- `TodoListView` model and REST endpoints for todo lists, notes and views.
- Simple JWT authentication endpoints for register, login and token refresh.
### Changed
- Renamed models (`Todi` → `TodoList`, `Noti` → `Note`) and updated admin and serializers.
### Removed
- Default frontend assets and test files from CRA template.


## 2025-04-28
### Added
- `notes` app with initial models and migrations.
- Owners and collaborators fields for todo lists and notes.
- `environment_conda_export.py` helper script.
- REST APIs using Django REST Framework.
### Changed
- Updated LICENSE and README to credit `conda_export.py` by Andres Berejnoi.
### Removed
- Temporary `users` app.


## 2025-04-26
### Added
- Created project changelog.


## 2025-04-25
### Changed
- Minor formatting tweaks across Docker and configuration files.


## 2025-04-24
### Added
- Frontend, backend and Docker scaffolding.
- Initial `environment.yml` and docker-compose setup.
### Changed
- README and `.gitignore` revisions.


## 2025-04-20
### Added
- Initial repository with base README and LICENSE.
