import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-utils';
import Login from './Login';
import { fetchWorkspaces, login } from '../../services/notoliApiClient';
import { useNavigate } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

jest.mock('../../services/notoliApiClient', () => ({
  fetchWorkspaces: jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => [],
    }),
  ),
  login: jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        access: 'ACCESS',
        refresh: 'REFRESH',
        username: 'test_email',
        email: 'test_email@example.com',
      }),
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

  test('when rendered, it shows email/password inputs and submit button', () => {
    renderWithProviders(<Login showSnackbar={jest.fn()} />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  test('when a pending snackbar exists in sessionStorage, it shows it once on render', async () => {
    sessionStorage.setItem(
      'pendingSnackbar',
      JSON.stringify({ severity: 'error', message: 'Your session expired. Please log in again.' }),
    );

    const showSnackbar = jest.fn();

    renderWithProviders(<Login showSnackbar={showSnackbar} />);

    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith(
        'error',
        'Your session expired. Please log in again.',
      );
    });

    expect(sessionStorage.getItem('pendingSnackbar')).toBeNull();
  });

  test('when login succeeds and workspaces exist, it navigates to the first workspace', async () => {
    fetchWorkspaces.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 7 }, { id: 3 }, { id: 12 }],
    });
    login.mockResolvedValue({
      ok: true,
      json: async () => ({
        access: 'ACCESS',
        refresh: 'REFRESH',
        username: 'test_email',
        email: 'test_email@example.com',
      }),
    });

    renderWithProviders(<Login showSnackbar={jest.fn()} />);

    await userEvent.type(screen.getByLabelText(/email/i), 'test_email@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'test_password');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/workspace/3');
    });
  });

  test('when login succeeds and no workspaces exist, it navigates home', async () => {
    fetchWorkspaces.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    login.mockResolvedValue({
      ok: true,
      json: async () => ({
        access: 'ACCESS',
        refresh: 'REFRESH',
        username: 'test_email',
        email: 'test_email@example.com',
      }),
    });

    renderWithProviders(<Login showSnackbar={jest.fn()} />);

    // Type credentials
    await userEvent.type(screen.getByLabelText(/email/i), 'test_email@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'test_password');

    // Click login
    await userEvent.click(screen.getByRole('button', { name: /login/i }));

    // Confirm the login request happened with the creds we typed
    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        email: 'test_email@example.com',
        password: 'test_password',
      });
    });

    // Confirm we navigated to the main page when no workspaces are returned
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  test('when login succeeds, it stores access/refresh tokens', async () => {
    fetchWorkspaces.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    login.mockResolvedValue({
      ok: true,
      json: async () => ({
        access: 'test_access_token',
        refresh: 'test_refresh_token',
        username: 'test_email',
        email: 'test_email@example.com',
      }),
    });

    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    try {
      renderWithProviders(<Login showSnackbar={jest.fn()} />);

      // Type credentials
      await userEvent.type(screen.getByLabelText(/email/i), 'test_email@example.com');
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
    fetchWorkspaces.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    login.mockResolvedValue({
      ok: true,
      json: async () => ({
        access: 'ACCESS',
        refresh: 'REFRESH',
        username: 'test_email',
        email: 'test_email@example.com',
      }),
    });

    const showSnackbar = jest.fn();

    renderWithProviders(<Login showSnackbar={showSnackbar} />);

    await userEvent.type(screen.getByLabelText(/email/i), 'test_email@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'test_password');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith('success', 'Welcome test_email!');
    });
  });

  test('when workspace fetch fails after login, it navigates home', async () => {
    fetchWorkspaces.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });
    login.mockResolvedValue({
      ok: true,
      json: async () => ({
        access: 'ACCESS',
        refresh: 'REFRESH',
        username: 'test_email',
        email: 'test_email@example.com',
      }),
    });

    renderWithProviders(<Login showSnackbar={jest.fn()} />);

    await userEvent.type(screen.getByLabelText(/email/i), 'test_email@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'test_password');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  test('when workspace fetch fails after login, it shows an error snackbar', async () => {
    fetchWorkspaces.mockResolvedValueOnce({ ok: false, status: 500, json: async () => [] });
    login.mockResolvedValue({
      ok: true,
      json: async () => ({
        access: 'ACCESS',
        refresh: 'REFRESH',
        username: 'test_email',
        email: 'test_email@example.com',
      }),
    });

    const showSnackbar = jest.fn();

    renderWithProviders(<Login showSnackbar={showSnackbar} />);

    await userEvent.type(screen.getByLabelText(/email/i), 'test_email@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'test_password');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith('error', 'Workspace load failed :(');
    });
  });

  test('when login fails, it does not navigate', async () => {
    login.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Invalid credentials' }),
    });

    // Login.js logs the auth error; silence it here to avoid noisy test output.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Login showSnackbar={jest.fn()} />);

      // Type credentials
      await userEvent.type(screen.getByLabelText(/email/i), 'bad_email@example.com');
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
    login.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Invalid credentials' }),
    });

    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Login showSnackbar={jest.fn()} />);

      await userEvent.type(screen.getByLabelText(/email/i), 'bad_email@example.com');
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
    login.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Invalid credentials' }),
    });

    const showSnackbar = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Login showSnackbar={showSnackbar} />);

      await userEvent.type(screen.getByLabelText(/email/i), 'bad_email@example.com');
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
    login.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Login showSnackbar={jest.fn()} />);

      await userEvent.type(screen.getByLabelText(/email/i), 'bad_email@example.com');
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
    login.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));

    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Login showSnackbar={jest.fn()} />);

      await userEvent.type(screen.getByLabelText(/email/i), 'bad_email@example.com');
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
    login.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));

    const showSnackbar = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Login showSnackbar={showSnackbar} />);

      await userEvent.type(screen.getByLabelText(/email/i), 'bad_email@example.com');
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
