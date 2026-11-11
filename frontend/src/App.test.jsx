import App from './App';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  BrowserRouter: ({ children }) => <>{children}</>,
}));
vi.mock('./components/AuthenticatedRoute', () => ({
  default: ({ children }) => {
    const token = globalThis.sessionStorage?.getItem('accessToken');
    if (!token) {
      return <div>LoginRedirect</div>;
    }
    return <div>{children}</div>;
  },
}));
vi.mock('./components/AppHeader', () => ({
  default: ({ setDrawerOpen }) => (
    <button type="button" onClick={() => setDrawerOpen((prev) => !prev)}>
      ToggleDrawer
    </button>
  ),
}));
vi.mock('./components/BoardNavigationDrawer', () => ({
  default: ({ open }) => <div data-testid="drawer">{open ? 'DrawerOpen' : 'DrawerClosed'}</div>,
}));
vi.mock('./components/AppSnackbar', () => ({
  default: ({ open, message }) => (open ? <div data-testid="snackbar">{message}</div> : null),
}));
vi.mock('./pages/authentication/Login', () => ({
  default: ({ showSnackbar }) => (
    <button type="button" onClick={() => showSnackbar('success', 'login ok')}>
      LoginPage
    </button>
  ),
}));
vi.mock('./pages/authentication/Register', () => ({
  default: () => <div>RegisterPage</div>,
}));
vi.mock('./pages/authentication/ForgotPassword', () => ({
  default: () => <div>ForgotPasswordPage</div>,
}));
vi.mock('./pages/authentication/ResetPassword', () => ({
  default: () => <div>ResetPasswordPage</div>,
}));
vi.mock('./components/BoardHomeRedirect', () => ({
  default: () => <div>BoardHomeRedirect</div>,
}));
vi.mock('./pages/boards/BoardListsPage', async () => {
  const { useNavigate } = await import('react-router-dom');
  return {
    default: function MockBoardListsPage({ active }) {
      const navigate = useNavigate();
      return (
        <div data-testid={active ? 'active-board-page' : 'hidden-board-page'}>
          <button type="button" onClick={() => navigate('/board/1/list/2')}>
            OpenList
          </button>
          BoardListsPage
        </div>
      );
    },
  };
});
vi.mock('./pages/lists/ListTasksPage', async () => {
  const React = await import('react');
  return {
    default: function MockListTasksPage({ active, onPageReady }) {
      React.useEffect(() => {
        globalThis.__notoliListPageReady = onPageReady;
        if (globalThis.__notoliAutoReady) {
          globalThis.__notoliReadyCalls = (globalThis.__notoliReadyCalls ?? 0) + 1;
          if (globalThis.__notoliReadyCalls > 10) {
            throw new Error('Page readiness keeps rerendering an already active route');
          }
          onPageReady();
        }
        return () => {
          delete globalThis.__notoliListPageReady;
        };
      }, [onPageReady]);
      return (
        <div data-testid={active ? 'active-list-page' : 'hidden-list-page'}>ListTasksPage</div>
      );
    },
  };
});
const testTheme = createTheme();
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};
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
    delete globalThis.__notoliListPageReady;
    delete globalThis.__notoliAutoReady;
    delete globalThis.__notoliReadyCalls;
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
    await userEvent.click(
      screen.getByRole('button', {
        name: /loginpage/i,
      }),
    );
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('login ok');
  });
  test('when a protected route is visited without a token, it redirects to login', () => {
    renderApp('/board/1');
    expect(document.body.textContent).toContain('LoginRedirect');
  });
  test('when the app bar toggles the drawer, it calls setDrawerOpen', async () => {
    sessionStorage.setItem('accessToken', 'token');
    renderApp('/');
    await userEvent.click(
      screen.getByRole('button', {
        name: /toggledrawer/i,
      }),
    );
    expect(screen.getByTestId('drawer')).toHaveTextContent('DrawerOpen');
  });
  test('when a notepad route is loading, it keeps the previous page visible until ready', async () => {
    sessionStorage.setItem('accessToken', 'token');
    renderApp('/board/1');
    await userEvent.click(
      screen.getByRole('button', {
        name: /openlist/i,
      }),
    );
    expect(screen.getByTestId('active-board-page')).toBeInTheDocument();
    expect(screen.getByTestId('hidden-list-page')).toBeInTheDocument();
    act(() => {
      globalThis.__notoliListPageReady();
    });
    expect(await screen.findByTestId('active-list-page')).toBeInTheDocument();
    expect(screen.queryByTestId('active-board-page')).not.toBeInTheDocument();
  });
  test('a loaded page can report readiness without creating a render feedback loop', () => {
    sessionStorage.setItem('accessToken', 'token');
    globalThis.__notoliAutoReady = true;
    renderApp('/board/1/list/2');
    expect(screen.getByTestId('active-list-page')).toBeInTheDocument();
    expect(globalThis.__notoliReadyCalls).toBe(1);
    act(() => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        globalThis.__notoliListPageReady();
      }
    });
    expect(globalThis.__notoliReadyCalls).toBe(1);
  });
  test('automatic readiness settles a navigation transition and controls stay responsive', async () => {
    sessionStorage.setItem('accessToken', 'token');
    globalThis.__notoliAutoReady = true;
    renderApp('/board/1');
    await userEvent.click(screen.getByRole('button', { name: /openlist/i }));
    expect(screen.getByTestId('active-list-page')).toBeInTheDocument();
    expect(screen.queryByTestId('active-board-page')).not.toBeInTheDocument();
    expect(globalThis.__notoliReadyCalls).toBeLessThanOrEqual(2);
    await userEvent.click(screen.getByRole('button', { name: /toggledrawer/i }));
    expect(screen.getByTestId('drawer')).toHaveTextContent('DrawerOpen');
  });
});
