import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-helpers/utils';
import ResetPassword from './ResetPassword';
import { resetPassword } from '../../services/authentication/authApiClient';
import { Route, Routes, useNavigate } from 'react-router';
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: vi.fn(),
}));
vi.mock('../../services/authentication/authApiClient', () => ({
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
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'new_password_123!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
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
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'one' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'two' } });
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
      message: 'Password reset successful.',
    });
    const showSnackbar = vi.fn();
    renderWithProviders(<ResetPassword showSnackbar={showSnackbar} />, {
      routeEntries: ['/reset-password?uid=abc&token=tok'],
    });
    await userEvent.type(screen.getByLabelText('New Password'), 'new_password_123!');
    await userEvent.type(screen.getByLabelText('Confirm Password'), 'new_password_123!');
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
    let rejectRequest;
    resetPassword.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
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
    rejectRequest(new Error('Validation failed.'));
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
  describe.each([{ name: 'Login', to: '/login', tabs: 4 }])(
    'navigation to $to ($name)',
    ({ name, to, tabs }) => {
      test.each(['click', 'keyboard'])(
        '%s follows a real link without submitting',
        async (activation) => {
          vi.clearAllMocks();
          sessionStorage.clear();
          const user = userEvent.setup();
          const showSnackbar = vi.fn();
          renderWithProviders(
            <Routes>
              <Route
                path="/reset-password"
                element={<ResetPassword showSnackbar={showSnackbar} />}
              />
              <Route path={to} element={<h1>Navigation destination</h1>} />
            </Routes>,
            { routeEntries: ['/reset-password?uid=test&token=test'] },
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
          expect(resetPassword).not.toHaveBeenCalled();
          expect(showSnackbar).not.toHaveBeenCalled();
        },
      );
    },
  );
});
