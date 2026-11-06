import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-support/utils';
import ForgotPassword from './ForgotPassword';
import { forgotPassword } from '../../services/notoliApiClient';
import { useNavigate } from 'react-router-dom';
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: vi.fn(),
}));
vi.mock('../../services/notoliApiClient', () => ({
  forgotPassword: vi.fn(),
}));
describe('ForgotPassword', () => {
  const mockNavigate = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    useNavigate.mockReturnValue(mockNavigate);
  });
  test('when rendered, it shows email input and send button', () => {
    renderWithProviders(<ForgotPassword showSnackbar={vi.fn()} />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /send reset link/i,
      }),
    ).toBeInTheDocument();
  });
  test('when submit succeeds, it shows success and navigates to login', async () => {
    forgotPassword.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'Password reset link has been sent!',
      }),
    });
    const showSnackbar = vi.fn();
    renderWithProviders(<ForgotPassword showSnackbar={showSnackbar} />);
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.click(
      screen.getByRole('button', {
        name: /send reset link/i,
      }),
    );
    await waitFor(() => {
      expect(forgotPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
      });
    });
    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith('success', 'Password reset link has been sent!');
    });
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
  test('when submit fails, it shows an error', async () => {
    forgotPassword.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'Invalid email address.',
      }),
    });
    const showSnackbar = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderWithProviders(<ForgotPassword showSnackbar={showSnackbar} />);
      // Use valid syntax to reach the server error path after native form validation.
      await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
      await userEvent.click(
        screen.getByRole('button', {
          name: /send reset link/i,
        }),
      );
      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith('error', 'Invalid email address.');
      });
    } finally {
      consoleError.mockRestore();
    }
  });
  test('blocks duplicate submissions and recovers after a validation failure', async () => {
    const showSnackbar = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveRequest;
    forgotPassword.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    renderWithProviders(<ForgotPassword showSnackbar={showSnackbar} />, {
      routeEntries: ['/forgot-password'],
    });
    await userEvent.type(screen.getByLabelText('Email'), 'mapper@example.com');
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Send Reset Link',
      }),
    );
    const pendingButton = screen.getByRole('button', {
      name: 'Sending...',
    });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(forgotPassword).toHaveBeenCalledTimes(1);
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
          name: 'Send Reset Link',
        }),
      ).toBeEnabled(),
    );
    expect(showSnackbar).toHaveBeenCalledWith('error', 'Validation failed.');
    consoleError.mockRestore();
  });
});
