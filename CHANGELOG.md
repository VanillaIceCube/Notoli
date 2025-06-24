# Changelog
All notable changes to this project are documented in this file.


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
