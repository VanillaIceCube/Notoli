import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-helpers/utils';
import Login from './Login';
import { login } from '../../services/authentication/authApiClient';
import { fetchBoards } from '../../services/notepad/notoliApiClient';
import { Route, Routes, useNavigate } from 'react-router';
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: vi.fn(),
}));
vi.mock('../../services/notepad/notoliApiClient', () => ({
  fetchBoards: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../../services/authentication/authApiClient', () => ({
  login: vi.fn(() =>
    Promise.resolve({
      access: 'ACCESS',
      refresh: 'REFRESH',
      username: 'test_email',
      email: 'test_email@example.com',
    }),
  ),
}));
describe('Login', () => {
  const mockNavigate = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    useNavigate.mockReturnValue(mockNavigate);
  });

  test('when rendered, it shows email/password inputs and submit button', () => {
    renderWithProviders(<Login showSnackbar={vi.fn()} />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /login/i,
      }),
    ).toBeInTheDocument();
  });
  test('when a pending snackbar exists in sessionStorage, it shows it once on render', async () => {
    sessionStorage.setItem(
      'pendingSnackbar',
      JSON.stringify({
        severity: 'error',
        message: 'Your session expired. Please log in again.',
      }),
    );
    const showSnackbar = vi.fn();
    renderWithProviders(<Login showSnackbar={showSnackbar} />);
    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith(
        'error',
        'Your session expired. Please log in again.',
      );
    });
    expect(sessionStorage.getItem('pendingSnackbar')).toBeNull();
  });
  test('ordinary login navigates home and lets that route choose the board', async () => {
    login.mockResolvedValue({
      access: 'ACCESS',
      refresh: 'REFRESH',
      username: 'test_email',
      email: 'test_email@example.com',
    });
    renderWithProviders(<Login showSnackbar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Email'), 'test_email@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'test_password');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(login).toHaveBeenCalledWith({
      email: 'test_email@example.com',
      password: 'test_password',
    });
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    expect(fetchBoards).not.toHaveBeenCalled();
  });
  test('when login succeeds, it stores access/refresh tokens', async () => {
    login.mockResolvedValue({
      access: 'test_access_token',
      refresh: 'test_refresh_token',
      username: 'test_email',
      email: 'test_email@example.com',
    });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    try {
      renderWithProviders(<Login showSnackbar={vi.fn()} />);

      // Type credentials
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test_email@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'test_password' } });

      // Click login
      await userEvent.click(
        screen.getByRole('button', {
          name: /login/i,
        }),
      );

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
    login.mockResolvedValue({
      access: 'ACCESS',
      refresh: 'REFRESH',
      username: 'test_email',
      email: 'test_email@example.com',
    });
    const showSnackbar = vi.fn();
    renderWithProviders(<Login showSnackbar={showSnackbar} />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test_email@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'test_password' } });
    await userEvent.click(
      screen.getByRole('button', {
        name: /login/i,
      }),
    );
    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith('success', 'Welcome test_email!');
    });
  });
  test('when login fails, it does not navigate', async () => {
    login.mockRejectedValue(new Error('Invalid credentials'));

    // Login.js logs the auth error; silence it here to avoid noisy test output.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderWithProviders(<Login showSnackbar={vi.fn()} />);

      // Type credentials
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'bad_email@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'bad_password' } });

      // Click login
      await userEvent.click(
        screen.getByRole('button', {
          name: /login/i,
        }),
      );
      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalled();
      });
    } finally {
      // Restore console logging for the rest of the test suite.
      consoleError.mockRestore();
    }
  });
  test('when login fails, it does not store tokens', async () => {
    login.mockRejectedValue(new Error('Invalid credentials'));
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderWithProviders(<Login showSnackbar={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'bad_email@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'bad_password' } });
      await userEvent.click(
        screen.getByRole('button', {
          name: /login/i,
        }),
      );
      await waitFor(() => {
        expect(setItemSpy).not.toHaveBeenCalled();
      });
    } finally {
      consoleError.mockRestore();
      setItemSpy.mockRestore();
    }
  });
  test('when login fails, it shows an error snackbar', async () => {
    login.mockRejectedValue(new Error('Invalid credentials'));
    const showSnackbar = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderWithProviders(<Login showSnackbar={showSnackbar} />);
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'bad_email@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'bad_password' } });
      await userEvent.click(
        screen.getByRole('button', {
          name: /login/i,
        }),
      );
      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith('error', 'Login failed :(');
      });
    } finally {
      consoleError.mockRestore();
    }
  });
  test('when login fails due to a network error, it does not navigate', async () => {
    login.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderWithProviders(<Login showSnackbar={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'bad_email@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'bad_password' } });
      await userEvent.click(
        screen.getByRole('button', {
          name: /login/i,
        }),
      );
      await waitFor(() => {
        expect(mockNavigate).not.toHaveBeenCalled();
      });
    } finally {
      consoleError.mockRestore();
    }
  });
  test('when login fails due to a network error, it does not store tokens', async () => {
    login.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderWithProviders(<Login showSnackbar={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'bad_email@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'bad_password' } });
      await userEvent.click(
        screen.getByRole('button', {
          name: /login/i,
        }),
      );
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
    const showSnackbar = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderWithProviders(<Login showSnackbar={showSnackbar} />);
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'bad_email@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'bad_password' } });
      await userEvent.click(
        screen.getByRole('button', {
          name: /login/i,
        }),
      );
      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith('error', 'Network error :(');
      });
    } finally {
      consoleError.mockRestore();
    }
  });
  test('blocks duplicate submissions and recovers after a validation failure', async () => {
    const showSnackbar = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectRequest;
    login.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );
    renderWithProviders(<Login showSnackbar={showSnackbar} />, {
      routeEntries: ['/login'],
    });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mapper@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Login',
      }),
    );
    const pendingButton = screen.getByRole('button', {
      name: 'Logging in...',
    });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(login).toHaveBeenCalledTimes(1);
    rejectRequest(new Error('Validation failed.'));
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Login',
        }),
      ).toBeEnabled(),
    );
    expect(showSnackbar).toHaveBeenCalledWith('error', 'Login failed :(');
    consoleError.mockRestore();
  });
  describe.each([
    { name: 'Forgot Password?', to: '/forgot-password', tabs: 4 },
    { name: 'Create Account!', to: '/register', tabs: 5 },
  ])('navigation to $to ($name)', ({ name, to, tabs }) => {
    test.each(['click', 'keyboard'])(
      '%s follows a real link without submitting',
      async (activation) => {
        vi.clearAllMocks();
        sessionStorage.clear();
        const user = userEvent.setup();
        const showSnackbar = vi.fn();
        renderWithProviders(
          <Routes>
            <Route path="/login" element={<Login showSnackbar={showSnackbar} />} />
            <Route path={to} element={<h1>Navigation destination</h1>} />
          </Routes>,
          { routeEntries: ['/login'] },
        );
        const link = screen.getByRole('link', { name, exact: true });
        expect(link).toHaveAttribute('href', to);
        if (activation === 'keyboard') {
          for (let i = 0; i < tabs; i += 1) await user.tab();
          expect(link).toHaveFocus();
          await user.keyboard('{Enter}');
        } else {
          await user.click(link);
        }
        expect(
          await screen.findByRole('heading', { name: 'Navigation destination' }),
        ).toBeVisible();
        expect(login).not.toHaveBeenCalled();
        expect(fetchBoards).not.toHaveBeenCalled();
        expect(showSnackbar).not.toHaveBeenCalled();
      },
    );
  });
});
