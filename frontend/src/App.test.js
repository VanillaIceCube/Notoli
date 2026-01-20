import { render, screen } from '@testing-library/react';
import App from './App';

const mockSnackbar = jest.fn();
const mockAuthenticatedRoute = jest.fn(function MockAuthenticatedRoute({ children }) {
  return <div>{children}</div>;
});

jest.mock(
  './components/MySnackbar',
  () =>
    function MockMySnackbar(props) {
      mockSnackbar(props);
      return <div data-testid="snackbar" />;
    },
);

jest.mock(
  './components/AuthenticatedRoute',
  () =>
    function MockAuthenticatedRouteWrapper(props) {
      return mockAuthenticatedRoute(props);
    },
);

jest.mock(
  './pages/authentication/Login',
  () =>
    function MockLogin() {
      return <div>Login Page</div>;
    },
);
jest.mock(
  './pages/authentication/Register',
  () =>
    function MockRegister() {
      return <div>Register Page</div>;
    },
);
jest.mock(
  './pages/notes/Workspaces',
  () =>
    function MockWorkspaces() {
      return <div>Workspaces Page</div>;
    },
);
jest.mock(
  './pages/notes/TodoLists',
  () =>
    function MockTodoLists() {
      return <div>TodoLists Page</div>;
    },
);
jest.mock(
  './pages/notes/Notes',
  () =>
    function MockNotes() {
      return <div>Notes Page</div>;
    },
);
jest.mock(
  './components/MyAppBar',
  () =>
    function MockMyAppBar() {
      return <div>AppBar</div>;
    },
);
jest.mock(
  './components/MyDrawer',
  () =>
    function MockMyDrawer() {
      return <div>Drawer</div>;
    },
);

beforeEach(() => {
  sessionStorage.clear();
  mockAuthenticatedRoute.mockClear();
  mockSnackbar.mockClear();
});

describe('App', () => {
  test('when navigating to /login, it renders the login route', () => {
    window.history.pushState({}, '', '/login');

    render(<App />);

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  test('when navigating to /register, it renders the register route', () => {
    window.history.pushState({}, '', '/register');

    render(<App />);

    expect(screen.getByText('Register Page')).toBeInTheDocument();
  });

  test('when navigating to /, it wraps protected routes with AuthenticatedRoute', () => {
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(mockAuthenticatedRoute).toHaveBeenCalled();
  });

  test('when rendered, it wires the snackbar with defaults', () => {
    window.history.pushState({}, '', '/login');

    render(<App />);

    expect(mockSnackbar).toHaveBeenCalledWith(
      expect.objectContaining({
        open: false,
        severity: '',
        message: '',
      }),
    );
  });
});
