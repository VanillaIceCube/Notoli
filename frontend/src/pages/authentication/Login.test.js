import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-utils';
import Login from './Login';
import { apiFetch } from '../../services/client';
import { useNavigate } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

jest.mock('../../services/client', () => ({
  apiFetch: jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => [],
    }),
  ),
}));

describe('Login', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    useNavigate.mockReturnValue(mockNavigate);
  });

  test('when rendered, it shows username/password inputs and submit button', () => {
    renderWithProviders(<Login showSnackbar={jest.fn()} />);

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  test('when login succeeds, it navigates to the main page', async () => {
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

    renderWithProviders(<Login showSnackbar={jest.fn()} />);

    // Type credentials
    await userEvent.type(screen.getByLabelText(/username/i), 'test_username');
    await userEvent.type(screen.getByLabelText(/password/i), 'test_password');

    // Click login
    await userEvent.click(screen.getByRole('button', { name: /login/i }));

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

    // Confirm we navigated to the main page when no workspaces are returned
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  test('when login succeeds, it stores access/refresh tokens', async () => {
    // Component calls /api/workspaces/ on mount, so we must handle it.
    // Then when we login, /auth/login/ should succeed.
    apiFetch.mockImplementation((url) => {
      if (url === '/api/workspaces/') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url === '/auth/login/') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access: 'test_access_token', refresh: 'test_refresh_token' }),
        });
      }
      throw new Error(`Unhandled apiFetch call: ${url}`);
    });

    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    try {
      renderWithProviders(<Login showSnackbar={jest.fn()} />);

      // Type credentials
      await userEvent.type(screen.getByLabelText(/username/i), 'test_username');
      await userEvent.type(screen.getByLabelText(/password/i), 'test_password');

      // Click login
      await userEvent.click(screen.getByRole('button', { name: /login/i }));

      // Assert tokens were saved
      await waitFor(() => {
        expect(setItemSpy).toHaveBeenCalledWith('accessToken', 'test_access_token');
      });
      await waitFor(() => {
        expect(setItemSpy).toHaveBeenCalledWith('refreshToken', 'test_refresh_token');
      });
    } finally {
      setItemSpy.mockRestore();
    }
  });

  test('when login succeeds, it shows a success snackbar', async () => {
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

    renderWithProviders(<Login showSnackbar={showSnackbar} />);

    await userEvent.type(screen.getByLabelText(/username/i), 'test_username');
    await userEvent.type(screen.getByLabelText(/password/i), 'test_password');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith('success', 'Login successful!');
    });
  });

  test('when login fails, it does not navigate', async () => {
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

    // Login.js logs the auth error; silence it here to avoid noisy test output.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Login showSnackbar={jest.fn()} />);

      // Type credentials
      await userEvent.type(screen.getByLabelText(/username/i), 'bad_username');
      await userEvent.type(screen.getByLabelText(/password/i), 'bad_password');

      // Click login
      await userEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalled();
      });
    } finally {
      // Restore console logging for the rest of the test suite.
      consoleError.mockRestore();
    }
  });

  test('when login fails, it does not store tokens', async () => {
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

    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Login showSnackbar={jest.fn()} />);

      await userEvent.type(screen.getByLabelText(/username/i), 'bad_username');
      await userEvent.type(screen.getByLabelText(/password/i), 'bad_password');
      await userEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(setItemSpy).not.toHaveBeenCalled();
      });
    } finally {
      consoleError.mockRestore();
      setItemSpy.mockRestore();
    }
  });

  test('when login fails, it shows an error snackbar', async () => {
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
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Login showSnackbar={showSnackbar} />);

      await userEvent.type(screen.getByLabelText(/username/i), 'bad_username');
      await userEvent.type(screen.getByLabelText(/password/i), 'bad_password');
      await userEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith('error', 'Login failed :(');
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  test('when login fails due to a network error, it does not navigate', async () => {
    apiFetch.mockImplementation((url) => {
      if (url === '/api/workspaces/') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url === '/auth/login/') {
        return Promise.reject(new TypeError('NetworkError when attempting to fetch resource.'));
      }
      throw new Error(`Unhandled apiFetch call: ${url}`);
    });

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Login showSnackbar={jest.fn()} />);

      await userEvent.type(screen.getByLabelText(/username/i), 'bad_username');
      await userEvent.type(screen.getByLabelText(/password/i), 'bad_password');
      await userEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalled();
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  test('when login fails due to a network error, it does not store tokens', async () => {
    apiFetch.mockImplementation((url) => {
      if (url === '/api/workspaces/') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url === '/auth/login/') {
        return Promise.reject(new TypeError('NetworkError when attempting to fetch resource.'));
      }
      throw new Error(`Unhandled apiFetch call: ${url}`);
    });

    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Login showSnackbar={jest.fn()} />);

      await userEvent.type(screen.getByLabelText(/username/i), 'bad_username');
      await userEvent.type(screen.getByLabelText(/password/i), 'bad_password');
      await userEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(setItemSpy).not.toHaveBeenCalled();
      });
    } finally {
      consoleError.mockRestore();
      setItemSpy.mockRestore();
    }
  });

  test('when login fails due to a network error, it shows a network error snackbar', async () => {
    apiFetch.mockImplementation((url) => {
      if (url === '/api/workspaces/') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url === '/auth/login/') {
        return Promise.reject(new TypeError('NetworkError when attempting to fetch resource.'));
      }
      throw new Error(`Unhandled apiFetch call: ${url}`);
    });

    const showSnackbar = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Login showSnackbar={showSnackbar} />);

      await userEvent.type(screen.getByLabelText(/username/i), 'bad_username');
      await userEvent.type(screen.getByLabelText(/password/i), 'bad_password');
      await userEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith('error', 'Network error :(');
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
