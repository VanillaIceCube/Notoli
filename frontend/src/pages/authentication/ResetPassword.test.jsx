import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-support/utils';
import ResetPassword from './ResetPassword';
import { resetPassword } from '../../services/notoliApiClient';
import { useNavigate } from 'react-router-dom';
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: vi.fn(),
}));
vi.mock('../../services/notoliApiClient', () => ({
  resetPassword: vi.fn(),
}));
describe('ResetPassword', () => {
  const mockNavigate = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    useNavigate.mockReturnValue(mockNavigate);
  });
  test('when reset params are missing, it shows an error and does not call API', async () => {
    const showSnackbar = vi.fn();
    renderWithProviders(<ResetPassword showSnackbar={showSnackbar} />, {
      routeEntries: ['/reset-password'],
    });
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'new_password_123!' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'new_password_123!' },
    });
    await userEvent.click(
      screen.getByRole('button', {
        name: /reset password/i,
      }),
    );
    expect(resetPassword).not.toHaveBeenCalled();
    expect(showSnackbar).toHaveBeenCalledWith('error', 'Invalid or expired reset link.');
  });
  test('when passwords mismatch, it shows an error and does not call API', async () => {
    const showSnackbar = vi.fn();
    renderWithProviders(<ResetPassword showSnackbar={showSnackbar} />, {
      routeEntries: ['/reset-password?uid=abc&token=tok'],
    });
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'one' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'two' } });
    await userEvent.click(
      screen.getByRole('button', {
        name: /reset password/i,
      }),
    );
    expect(resetPassword).not.toHaveBeenCalled();
    expect(showSnackbar).toHaveBeenCalledWith('error', 'Passwords do not match.');
  });
  test('when reset succeeds, it shows success and navigates to login', async () => {
    resetPassword.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'Password reset successful.',
      }),
    });
    const showSnackbar = vi.fn();
    renderWithProviders(<ResetPassword showSnackbar={showSnackbar} />, {
      routeEntries: ['/reset-password?uid=abc&token=tok'],
    });
    await userEvent.type(screen.getByLabelText(/new password/i), 'new_password_123!');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'new_password_123!');
    await userEvent.click(
      screen.getByRole('button', {
        name: /reset password/i,
      }),
    );
    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith({
        uid: 'abc',
        token: 'tok',
        password: 'new_password_123!',
      });
    });
    expect(showSnackbar).toHaveBeenCalledWith('success', 'Password reset successful.');
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
  test('blocks duplicate submissions and recovers after a validation failure', async () => {
    const showSnackbar = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveRequest;
    resetPassword.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    renderWithProviders(<ResetPassword showSnackbar={showSnackbar} />, {
      routeEntries: ['/reset-password?uid=test-user&token=test-token'],
    });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'new-secret' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'new-secret' },
    });
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Reset Password',
      }),
    );
    const pendingButton = screen.getByRole('button', {
      name: 'Resetting...',
    });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(resetPassword).toHaveBeenCalledTimes(1);
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
          name: 'Reset Password',
        }),
      ).toBeEnabled(),
    );
    expect(showSnackbar).toHaveBeenCalledWith('error', 'Validation failed.');
    consoleError.mockRestore();
  });
});
