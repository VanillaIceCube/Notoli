import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-support/utils';
import Register from './Register';
import { register } from '../../services/notoliApiClient';
import { useNavigate } from 'react-router-dom';
vi.setConfig({
  testTimeout: 15000,
});
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: vi.fn(),
}));
vi.mock('../../services/notoliApiClient', () => ({
  register: vi.fn(),
}));
describe('Register', () => {
  const mockNavigate = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    useNavigate.mockReturnValue(mockNavigate);
    sessionStorage.clear();
  });
  test('when rendered, it shows email/username/password inputs and submit button', () => {
    renderWithProviders(<Register showSnackbar={vi.fn()} />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /register/i,
      }),
    ).toBeInTheDocument();
  });
  test('when registration succeeds, it stores tokens, navigates to board, and shows success', async () => {
    register.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'User created successfully.',
        username: 'test_username',
        email: 'test_email@example.com',
        access: 'access-token',
        refresh: 'refresh-token',
        board_id: 12,
      }),
    });
    const showSnackbar = vi.fn();
    renderWithProviders(<Register showSnackbar={showSnackbar} />);
    await userEvent.type(screen.getByLabelText(/email/i), 'test_email@example.com');
    await userEvent.type(screen.getByLabelText(/username/i), 'test_username');
    await userEvent.type(screen.getByLabelText('Password'), 'test_password');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'test_password');
    await userEvent.click(
      screen.getByRole('button', {
        name: /register/i,
      }),
    );
    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        email: 'test_email@example.com',
        username: 'test_username',
        password: 'test_password',
      });
    });
    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith('success', 'Account created! Welcome to Notoli!');
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/board/12');
    });
    expect(sessionStorage.getItem('accessToken')).toBe('access-token');
    expect(sessionStorage.getItem('refreshToken')).toBe('refresh-token');
  });
  test('when registration fails, it shows the server error', async () => {
    register.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'Email already exists.',
      }),
    });
    const showSnackbar = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderWithProviders(<Register showSnackbar={showSnackbar} />);
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test_email@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test_password' } });
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: 'test_password' },
      });
      await userEvent.click(
        screen.getByRole('button', {
          name: /register/i,
        }),
      );
      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith('error', 'Email already exists.');
      });
    } finally {
      consoleError.mockRestore();
    }
  });
  test('when registration fails due to a network error, it shows a network error snackbar', async () => {
    register.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));
    const showSnackbar = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderWithProviders(<Register showSnackbar={showSnackbar} />);
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test_email@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test_password' } });
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: 'test_password' },
      });
      await userEvent.click(
        screen.getByRole('button', {
          name: /register/i,
        }),
      );
      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith('error', 'Network error :(');
      });
    } finally {
      consoleError.mockRestore();
    }
  });
  test('when passwords do not match, it shows an error and does not call register', async () => {
    const showSnackbar = vi.fn();
    renderWithProviders(<Register showSnackbar={showSnackbar} />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test_email@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test_password' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'different_password' },
    });
    await userEvent.click(
      screen.getByRole('button', {
        name: /register/i,
      }),
    );
    expect(register).not.toHaveBeenCalled();
    expect(showSnackbar).toHaveBeenCalledWith('error', 'Passwords do not match.');
  });
  test('blocks duplicate submissions and recovers after a validation failure', async () => {
    const showSnackbar = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveRequest;
    register.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    renderWithProviders(<Register showSnackbar={showSnackbar} />, {
      routeEntries: ['/register'],
    });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mapper@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'secret' } });
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Register',
      }),
    );
    const pendingButton = screen.getByRole('button', {
      name: 'Registering...',
    });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(register).toHaveBeenCalledTimes(1);
    resolveRequest({
      ok: false,
      status: 400,
      json: async () => ({
        password: ['Validation failed.'],
      }),
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Register',
        }),
      ).toBeEnabled(),
    );
    expect(showSnackbar).toHaveBeenCalledWith('error', 'Validation failed.');
    consoleError.mockRestore();
  });
});
