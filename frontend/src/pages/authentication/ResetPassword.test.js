import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-utils';
import ResetPassword from './ResetPassword';
import { resetPassword } from '../../services/notoliApiClient';
import { useNavigate } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

jest.mock('../../services/notoliApiClient', () => ({
  resetPassword: jest.fn(),
}));

describe('ResetPassword', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useNavigate.mockReturnValue(mockNavigate);
  });

  test('when reset params are missing, it shows an error and does not call API', async () => {
    const showSnackbar = jest.fn();

    renderWithProviders(<ResetPassword showSnackbar={showSnackbar} />, {
      routeEntries: ['/reset-password'],
    });

    await userEvent.type(screen.getByLabelText(/new password/i), 'new_password_123!');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'new_password_123!');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(resetPassword).not.toHaveBeenCalled();
    expect(showSnackbar).toHaveBeenCalledWith('error', 'Invalid or expired reset link.');
  });

  test('when passwords mismatch, it shows an error and does not call API', async () => {
    const showSnackbar = jest.fn();

    renderWithProviders(<ResetPassword showSnackbar={showSnackbar} />, {
      routeEntries: ['/reset-password?uid=abc&token=tok'],
    });

    await userEvent.type(screen.getByLabelText(/new password/i), 'one');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'two');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(resetPassword).not.toHaveBeenCalled();
    expect(showSnackbar).toHaveBeenCalledWith('error', 'Passwords do not match.');
  });

  test('when reset succeeds, it shows success and navigates to login', async () => {
    resetPassword.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Password reset successful.' }),
    });
    const showSnackbar = jest.fn();

    renderWithProviders(<ResetPassword showSnackbar={showSnackbar} />, {
      routeEntries: ['/reset-password?uid=abc&token=tok'],
    });

    await userEvent.type(screen.getByLabelText(/new password/i), 'new_password_123!');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'new_password_123!');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

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
});
