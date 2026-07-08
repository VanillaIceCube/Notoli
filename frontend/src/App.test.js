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
jest.mock('./components/AppHeader', () => ({ setDrawerOpen }) => (
  <button type="button" onClick={() => setDrawerOpen((prev) => !prev)}>
    ToggleDrawer
  </button>
));
jest.mock('./components/BoardNavigationDrawer', () => ({ open }) => (
  <div data-testid="drawer">{open ? 'DrawerOpen' : 'DrawerClosed'}</div>
));
jest.mock(
  './components/AppSnackbar',
  () =>
    ({ open, message }) =>
      open ? <div data-testid="snackbar">{message}</div> : null,
);
jest.mock('./pages/authentication/Login', () => ({ showSnackbar }) => (
  <button type="button" onClick={() => showSnackbar('success', 'login ok')}>
    LoginPage
  </button>
));
jest.mock('./pages/authentication/Register', () => () => <div>RegisterPage</div>);
jest.mock('./pages/authentication/ForgotPassword', () => () => <div>ForgotPasswordPage</div>);
jest.mock('./pages/authentication/ResetPassword', () => () => <div>ResetPasswordPage</div>);
jest.mock('./components/BoardHomeRedirect', () => () => <div>BoardHomeRedirect</div>);
jest.mock('./pages/boards/BoardListsPage', () => () => <div>BoardListsPage</div>);
jest.mock('./pages/lists/ListTasksPage', () => () => <div>ListTasksPage</div>);

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

  test('when the route is /forgot-password, it renders ForgotPassword', () => {
    renderApp('/forgot-password');

    expect(document.body.textContent).toContain('ForgotPasswordPage');
  });

  test('when the route is /reset-password, it renders ResetPassword', () => {
    renderApp('/reset-password?uid=abc&token=tok');

    expect(document.body.textContent).toContain('ResetPasswordPage');
  });

  test('when the route is /, it renders the board redirect', () => {
    sessionStorage.setItem('accessToken', 'token');
    renderApp('/');

    expect(document.body.textContent).toContain('BoardHomeRedirect');
  });

  test('when the route is /board/:id, it renders board lists', () => {
    sessionStorage.setItem('accessToken', 'token');
    renderApp('/board/1');

    expect(document.body.textContent).toContain('BoardListsPage');
  });

  test('when the route is /board/:id/list/:id, it renders list tasks', () => {
    sessionStorage.setItem('accessToken', 'token');
    renderApp('/board/1/list/2');

    expect(document.body.textContent).toContain('ListTasksPage');
  });

  test('when a child triggers showSnackbar, it renders the snackbar message', async () => {
    renderApp('/login');

    await userEvent.click(screen.getByRole('button', { name: /loginpage/i }));

    expect(await screen.findByTestId('snackbar')).toHaveTextContent('login ok');
  });

  test('when a protected route is visited without a token, it redirects to login', () => {
    renderApp('/board/1');

    expect(document.body.textContent).toContain('LoginRedirect');
  });

  test('when the app bar toggles the drawer, it calls setDrawerOpen', async () => {
    sessionStorage.setItem('accessToken', 'token');
    renderApp('/');

    await userEvent.click(screen.getByRole('button', { name: /toggledrawer/i }));

    expect(screen.getByTestId('drawer')).toHaveTextContent('DrawerOpen');
  });
});
