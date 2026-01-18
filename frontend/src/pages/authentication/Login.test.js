import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import { apiFetch } from '../../services/client';

jest.mock('../../services/client', () => ({
  apiFetch: jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => [],
    }),
  ),
}));

// Disable MUI button ripples in tests to avoid act() warnings from async ripple updates.
const testTheme = createTheme({
  components: {
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
    },
  },
});

describe('Login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders username/password fields and login button', () => {
    render(
      <ThemeProvider theme={testTheme}>
        {/* React Router future flags silence v7 deprecation warnings in tests. */}
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Login showSnackbar={jest.fn()} />
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  test('can successfully login', async () => {
    // Component calls /api/workspaces/ on mount, so we must handle it.
    // Then when we login, /auth/login/ should succeed.
    apiFetch.mockImplementation((url) => {
      if (url === '/api/workspaces/') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url === '/auth/login/') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access: 'ACCESS', refresh: 'REFRESH' }),
        });
      }
      throw new Error(`Unhandled apiFetch call: ${url}`);
    });

    const showSnackbar = jest.fn();

    render(
      <ThemeProvider theme={testTheme}>
        {/* React Router future flags silence v7 deprecation warnings in tests. */}
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Login showSnackbar={showSnackbar} />
        </MemoryRouter>
      </ThemeProvider>,
    );

    // Type credentials
    userEvent.type(screen.getByLabelText(/username/i), 'test_username');
    userEvent.type(screen.getByLabelText(/password/i), 'test_password');

    // Click login
    userEvent.click(screen.getByRole('button', { name: /login/i }));

    // Confirm the login request happened with the creds we typed
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/auth/login/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ username: 'test_username', password: 'test_password' }),
        }),
      );
    });

    // Confirm we treated it as a successful login
    expect(showSnackbar).toHaveBeenCalledWith('success', 'Login successful!');
  });

  test('can fail login', async () => {
    // Component calls /api/workspaces/ on mount, so we must handle it.
    // Then when we login, /auth/login/ should succeed.
    apiFetch.mockImplementation((url) => {
      if (url === '/api/workspaces/') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url === '/auth/login/') {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ detail: 'Invalid credentials' }),
        });
      }
      throw new Error(`Unhandled apiFetch call: ${url}`);
    });

    const showSnackbar = jest.fn();
    // Login.js logs the auth error; silence it here to avoid noisy test output.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(
        <ThemeProvider theme={testTheme}>
          {/* React Router future flags silence v7 deprecation warnings in tests. */}
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Login showSnackbar={showSnackbar} />
          </MemoryRouter>
        </ThemeProvider>,
      );

      // Type credentials
      userEvent.type(screen.getByLabelText(/username/i), 'bad_username');
      userEvent.type(screen.getByLabelText(/password/i), 'bad_password');

      // Click login
      userEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith('error', 'Login failed :(');
      });
    } finally {
      // Restore console logging for the rest of the test suite.
      consoleError.mockRestore();
    }
  });
});
