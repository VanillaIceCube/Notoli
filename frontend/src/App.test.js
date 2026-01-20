import App from './App';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  BrowserRouter: ({ children }) => <>{children}</>,
}));

jest.mock('./components/AuthenticatedRoute', () => ({ children }) => {
  const token = globalThis.sessionStorage?.getItem('accessToken');
  if (!token) {
    return <div>LoginRedirect</div>;
  }
  return <div>{children}</div>;
});
jest.mock('./components/MyAppBar', () => ({ setDrawerOpen }) => (
  <button type="button" onClick={() => setDrawerOpen((prev) => !prev)}>
    ToggleDrawer
  </button>
));
jest.mock('./components/MyDrawer', () => ({ open }) => (
  <div data-testid="drawer">{open ? 'DrawerOpen' : 'DrawerClosed'}</div>
));
jest.mock('./components/MySnackbar', () => ({ open, message }) =>
  open ? <div data-testid="snackbar">{message}</div> : null,
);
jest.mock('./pages/authentication/Login', () => ({ showSnackbar }) => (
  <button type="button" onClick={() => showSnackbar('success', 'login ok')}>
    LoginPage
  </button>
));
jest.mock('./pages/authentication/Register', () => () => <div>RegisterPage</div>);
jest.mock('./pages/notes/Workspaces', () => () => <div>WorkspacesPage</div>);
jest.mock('./pages/notes/TodoLists', () => () => <div>TodoListsPage</div>);
jest.mock('./pages/notes/Notes', () => () => <div>NotesPage</div>);

const testTheme = createTheme();
const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

function renderApp(route) {
  return render(
    <ThemeProvider theme={testTheme}>
      <MemoryRouter future={routerFuture} initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('when the route is /login, it renders Login', () => {
    renderApp('/login');

    expect(document.body.textContent).toContain('LoginPage');
  });

  test('when the route is /register, it renders Register', () => {
    renderApp('/register');

    expect(document.body.textContent).toContain('RegisterPage');
  });

  test('when the route is /, it renders Workspaces', () => {
    sessionStorage.setItem('accessToken', 'token');
    renderApp('/');

    expect(document.body.textContent).toContain('WorkspacesPage');
  });

  test('when the route is /workspace/:id, it renders TodoLists', () => {
    sessionStorage.setItem('accessToken', 'token');
    renderApp('/workspace/1');

    expect(document.body.textContent).toContain('TodoListsPage');
  });

  test('when the route is /workspace/:id/todolist/:id, it renders Notes', () => {
    sessionStorage.setItem('accessToken', 'token');
    renderApp('/workspace/1/todolist/2');

    expect(document.body.textContent).toContain('NotesPage');
  });

  test('when a child triggers showSnackbar, it renders the snackbar message', async () => {
    renderApp('/login');

    await userEvent.click(screen.getByRole('button', { name: /loginpage/i }));

    expect(await screen.findByTestId('snackbar')).toHaveTextContent('login ok');
  });

  test('when a protected route is visited without a token, it redirects to login', () => {
    renderApp('/workspace/1');

    expect(document.body.textContent).toContain('LoginRedirect');
  });

  test('when the app bar toggles the drawer, it calls setDrawerOpen', async () => {
    sessionStorage.setItem('accessToken', 'token');
    renderApp('/');

    await userEvent.click(screen.getByRole('button', { name: /toggledrawer/i }));

    expect(screen.getByTestId('drawer')).toHaveTextContent('DrawerOpen');
  });
});
