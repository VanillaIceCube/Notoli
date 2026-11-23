import App from './App';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Link, MemoryRouter } from 'react-router';
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  BrowserRouter: ({ children }) => <>{children}</>,
}));
vi.mock('./components/app-core/AuthenticatedRoute', () => ({
  default: ({ children }) => {
    const token = globalThis.sessionStorage?.getItem('accessToken');
    if (!token) {
      return <div>LoginRedirect</div>;
    }
    return <div>{children}</div>;
  },
}));
vi.mock('./components/app-core/AppHeader', () => ({
  default: ({ setDrawerOpen }) => (
    <button type="button" onClick={() => setDrawerOpen((prev) => !prev)}>
      ToggleDrawer
    </button>
  ),
}));
vi.mock('./components/app/BoardNavigationDrawer', () => ({
  default: ({ open }) => <div data-testid="drawer">{open ? 'DrawerOpen' : 'DrawerClosed'}</div>,
}));
vi.mock('./components/app-core/AppSnackbar', () => ({
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
vi.mock('./components/app/BoardHomeRedirect', () => ({
  default: () => <div>BoardHomeRedirect</div>,
}));
vi.mock('./pages/boards/BoardListsPage', async () => {
  const { useNavigate } = await import('react-router');
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
function renderApp(route) {
  return render(
    <ThemeProvider theme={testTheme}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>,
  );
}
describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([])),
    );
    sessionStorage.clear();
    delete globalThis.__notoliListPageReady;
    delete globalThis.__notoliAutoReady;
    delete globalThis.__notoliReadyCalls;
  });
  test('when the route is /login, it renders Login', async () => {
    renderApp('/login');
    expect(await screen.findByText('LoginPage')).toBeInTheDocument();
  });
  test('when the route is /register, it renders Register', async () => {
    renderApp('/register');
    expect(await screen.findByText('RegisterPage')).toBeInTheDocument();
  });
  test('when the route is /forgot-password, it renders ForgotPassword', async () => {
    renderApp('/forgot-password');
    expect(await screen.findByText('ForgotPasswordPage')).toBeInTheDocument();
  });
  test('when the route is /reset-password, it renders ResetPassword', async () => {
    renderApp('/reset-password?uid=abc&token=tok');
    expect(await screen.findByText('ResetPasswordPage')).toBeInTheDocument();
  });
  test('when the route is /, it renders the board redirect', async () => {
    sessionStorage.setItem('accessToken', 'token');
    renderApp('/');
    expect(await screen.findByText('BoardHomeRedirect')).toBeInTheDocument();
  });
  test('when the route is /board/:id, it renders board lists', async () => {
    sessionStorage.setItem('accessToken', 'token');
    renderApp('/board/1');
    expect(await screen.findByText('BoardListsPage')).toBeInTheDocument();
  });
  test('when the route is /board/:id/list/:id, it renders list tasks', async () => {
    sessionStorage.setItem('accessToken', 'token');
    renderApp('/board/1/list/2');
    expect(await screen.findByText('ListTasksPage')).toBeInTheDocument();
  });
  test('when a child triggers showSnackbar, it renders the snackbar message', async () => {
    renderApp('/login');
    await userEvent.click(
      await screen.findByRole('button', {
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

test('a failed pending notepad chunk becomes a visible recoverable route', async () => {
  vi.resetModules();
  sessionStorage.setItem('accessToken', 'token');
  let rejectChunk;
  const pending = new Promise((_resolve, reject) => {
    rejectChunk = reject;
  });
  vi.doMock('./pages/lists/ListTasksPage', () => pending);
  const { default: FailedApp } = await import('./App');
  const { browserLocation } = await import('./services/navigationService');
  const reload = vi.spyOn(browserLocation, 'reload').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <MemoryRouter initialEntries={['/board/1']}>
      <Link to="/login">Sign in</Link>
      <FailedApp />
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'OpenList' }));
  expect(screen.getByTestId('active-board-page')).toBeVisible();
  await act(async () => {
    rejectChunk(new Error('missing chunk'));
  });
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByTestId('active-board-page')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Reload page' }));
  expect(reload).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('link', { name: 'Sign in' }));
  expect(await screen.findByText('LoginPage')).toBeVisible();
  vi.restoreAllMocks();
  vi.doUnmock('./pages/lists/ListTasksPage');
});

describe('real session route lifecycle', () => {
  let SessionApp;
  beforeEach(async () => {
    vi.resetModules();
    vi.doUnmock('react-router');
    vi.doUnmock('./components/app-core/AuthenticatedRoute');
    vi.doUnmock('./components/app-core/AppHeader');
    vi.doUnmock('./components/app/BoardNavigationDrawer');
    vi.doUnmock('./components/app-core/AppSnackbar');
    vi.doUnmock('./components/app/BoardHomeRedirect');
    vi.doUnmock('./pages/authentication/Login');
    vi.doUnmock('./pages/authentication/Register');
    vi.doUnmock('./pages/authentication/ForgotPassword');
    vi.doUnmock('./pages/authentication/ResetPassword');
    vi.doUnmock('./pages/boards/BoardListsPage');
    vi.doUnmock('./pages/lists/ListTasksPage');
    SessionApp = (await import('./App')).default;
  });

  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const credentials = {
    access: 'access',
    refresh: 'refresh',
    username: 'Reader',
    email: 'reader@example.com',
  };
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.stubEnv('VITE_MCP_ENABLED', '1');
    window.history.replaceState({}, '', '/login');
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (url.includes('/auth/login/') || url.includes('/auth/register/'))
          return Promise.resolve(reply(credentials));
        if (url.includes('/auth/mcp/authorize/'))
          return Promise.resolve(
            reply({
              ticket: 'ticket',
              application: { name: 'Reader app', client_id: 'client' },
              user: { username: 'Reader' },
              permissions: [],
            }),
          );
        if (url.includes('/api/expired/')) return Promise.resolve(reply({}, 401));
        if (url.includes('/diary/')) return Promise.resolve(reply({ meals: [], totals: [] }));
        return Promise.resolve(reply([]));
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function submitPendingAuthRequest(page) {
    const pending = Promise.withResolvers();
    const defaultFetch = fetch.getMockImplementation();
    fetch.mockImplementation((url, options) =>
      url.endsWith('/auth/' + page + '/') ? pending.promise : defaultFetch(url, options),
    );
    const query = page === 'reset-password' ? '?uid=user&token=reset' : '';
    window.history.replaceState({}, '', '/' + page + query);
    render(<SessionApp />);
    const form = await screen.findByRole('form');
    for (const label of ['Email', 'Password', 'Confirm Password', 'New Password']) {
      const input = screen.queryByLabelText(label, { exact: true });
      if (input)
        fireEvent.change(input, {
          target: { value: label === 'Email' ? credentials.email : 'password123' },
        });
    }
    fireEvent.submit(form);
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/auth/' + page + '/'))).toBe(true);
    return pending;
  }

  describe.each(['login', 'register', 'forgot-password', 'reset-password'])(
    '%s request lifecycle',
    (page) => {
      test.each(['success', 'failure'])(
        'ignores a late %s after leaving the form',
        async (outcome) => {
          const pending = await submitPendingAuthRequest(page);
          const destination = page === 'login' ? '/register' : '/login';
          await userEvent.click(
            screen.getByRole('link', {
              name: page === 'login' ? /create account/i : /sign in|login|log in/i,
            }),
          );
          expect(window.location.pathname).toBe(destination);
          await act(async () => {
            if (outcome === 'success') pending.resolve(reply(credentials));
            else pending.reject(new Error('Abandoned request'));
          });
          expect(window.location.pathname).toBe(destination);
          expect(sessionStorage.getItem('accessToken')).toBeNull();
          expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        },
      );
    },
  );

  test('a late login response cannot replace the new account', async () => {
    const pending = await submitPendingAuthRequest('login');
    const { startSession } = await import('./services/sessionState');
    act(() => startSession({ access: 'new-access', refresh: 'new-refresh' }));
    await act(async () => pending.resolve(reply(credentials)));
    expect(sessionStorage.getItem('accessToken')).toBe('new-access');
    expect(window.location.pathname).toBe('/login');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test.each(['login', 'register'])(
    '%s reports a current request’s storage failure',
    async (page) => {
      const pending = await submitPendingAuthRequest(page);
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage unavailable');
      });
      await act(async () => pending.resolve(reply(credentials)));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        page === 'login' ? 'Login failed :(' : 'Unable to access browser session storage.',
      );
      expect(sessionStorage.getItem('accessToken')).toBeNull();
      expect(window.location.pathname).toBe('/' + page);
    },
  );

  test.each(['login', 'register'])(
    'keeps the real %s success message across the session transition',
    async (page) => {
      window.history.replaceState({}, '', `/${page}`);
      render(<SessionApp />);
      const user = userEvent.setup();
      await user.type(await screen.findByRole('textbox', { name: 'Email' }), 'reader@example.com');
      await user.type(screen.getByLabelText('Password', { exact: true }), 'password123');
      if (page === 'register') {
        await user.type(screen.getByRole('textbox', { name: /Username/ }), 'Reader');
        await user.type(screen.getByLabelText('Confirm Password'), 'password123');
      }
      await user.click(
        screen.getByRole('button', {
          name: page === 'login' ? /^Login$/i : /^(Register|Create account)$/i,
        }),
      );
      expect(
        await screen.findByText(
          page === 'login' ? 'Welcome Reader!' : /Account created! Welcome to/,
        ),
      ).toBeVisible();
      expect(await screen.findByLabelText('user profile')).toBeVisible();
      expect(sessionStorage.getItem('accessToken')).toBe('access');
    },
  );

  test('ordinary login opens the last accessible board through the home route', async () => {
    localStorage.setItem('notoli:lastBoardByUser', JSON.stringify({ Reader: '12' }));
    const defaultFetch = fetch.getMockImplementation();
    fetch.mockImplementation((url, ...options) => {
      if (url.endsWith('/api/boards/')) {
        return Promise.resolve(
          reply([
            { id: 3, name: 'First' },
            { id: 12, name: 'Remembered' },
          ]),
        );
      }
      if (url.endsWith('/api/boards/12/')) {
        return Promise.resolve(reply({ id: 12, name: 'Remembered' }));
      }
      return defaultFetch(url, ...options);
    });

    render(<SessionApp />);
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: 'Email' }), 'reader@example.com');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'password123');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByRole('heading', { name: 'Remembered' })).toBeVisible();
    expect(window.location.pathname).toBe('/board/12');
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/api/boards/'))).toHaveLength(1);
  });

  test('returning home retries an earlier failed board list request', async () => {
    const { startSession } = await import('./services/sessionState');
    startSession(credentials);
    window.history.replaceState({}, '', '/');
    const defaultFetch = fetch.getMockImplementation();
    const list = vi
      .fn()
      .mockResolvedValueOnce(reply({}, 503))
      .mockResolvedValueOnce(reply([{ id: 12, name: 'Recovered' }]));
    fetch.mockImplementation((url, ...options) => {
      if (url.endsWith('/api/boards/')) return list();
      if (url.endsWith('/api/boards/12/'))
        return Promise.resolve(reply({ id: 12, name: 'Recovered' }));
      return defaultFetch(url, ...options);
    });
    render(<SessionApp />);
    expect(await screen.findByText('Board load failed :(')).toBeVisible();
    expect(list).toHaveBeenCalledTimes(1);
    act(() => {
      window.history.pushState({}, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeVisible();
    act(() => {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(await screen.findByRole('heading', { name: 'Recovered' })).toBeVisible();
    expect(list).toHaveBeenCalledTimes(2);
  });

  test('shows the queued logout message after the session shell and lazy Login change', async () => {
    const { startSession } = await import('./services/sessionState');
    startSession(credentials);
    window.history.replaceState({}, '', '/');
    render(<SessionApp />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('user profile'));
    await user.click(screen.getByText('Logout'));
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeVisible();
    expect(await screen.findByText('Logout Successful :)')).toBeVisible();
    expect(sessionStorage.getItem('pendingSnackbar')).toBeNull();
  });

  test('shows expiry feedback after a reactive guard redirects to lazy Login', async () => {
    sessionStorage.setItem('accessToken', 'expired');
    window.history.replaceState({}, '', '/');
    render(<SessionApp />);
    expect(await screen.findByLabelText('user profile')).toBeVisible();
    const { apiFetch } = await import('./services/requestClient');
    await act(() => apiFetch('/api/expired/'));
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeVisible();
    expect(await screen.findByText('Your session expired. Please log in again.')).toBeVisible();
  });

  test('disabled MCP redirects old connection links without fetching consent', async () => {
    vi.stubEnv('VITE_MCP_ENABLED', '0');
    window.history.replaceState({}, '', '/connections/authorize?client_id=reader');
    render(<SessionApp />);
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeVisible();
    expect(screen.queryByText('Connect to Notoli')).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url.includes('/auth/mcp/'))).toBe(false);
    expect(window.location.pathname).toBe('/login');
    expect(new URLSearchParams(window.location.search).get('next') || '').not.toContain(
      '/connections',
    );
  });

  test('retains the complete consent query through lazy login and account publication', async () => {
    const pending = '/connections/authorize?state=keep%26this&client_id=reader';
    window.history.replaceState({}, '', pending);
    render(<SessionApp />);
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: 'Email' }), 'reader@example.com');
    expect(new URLSearchParams(window.location.search).get('next')).toBe(pending);
    await user.type(screen.getByLabelText('Password', { exact: true }), 'password123');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByText('Connect to Notoli')).toBeVisible();
    expect(`${window.location.pathname}${window.location.search}`).toBe(pending);
    expect(await screen.findByText('Signed in as Reader')).toBeVisible();
  });

  test('account replacement closes account menus and presents only the current profile', async () => {
    const { startSession } = await import('./services/sessionState');
    startSession(credentials);
    window.history.replaceState({}, '', '/');
    render(<SessionApp />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('user profile'));
    expect(screen.getByText('reader@example.com')).toBeVisible();
    act(() =>
      startSession({
        access: 'next',
        refresh: 'next-r',
        username: 'Next',
        email: 'next@example.com',
      }),
    );
    expect(screen.queryByText('reader@example.com')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('user profile'));
    expect(screen.getByText('next@example.com')).toBeVisible();
  });
});
