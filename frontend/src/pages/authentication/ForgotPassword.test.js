import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-utils';
import ForgotPassword from './ForgotPassword';
import { forgotPassword } from '../../services/notoliApiClient';
import { useNavigate } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

jest.mock('../../services/notoliApiClient', () => ({
  forgotPassword: jest.fn(),
}));

describe('ForgotPassword', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useNavigate.mockReturnValue(mockNavigate);
  });

  test('when rendered, it shows email input and send button', () => {
    renderWithProviders(<ForgotPassword showSnackbar={jest.fn()} />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  test('when submit succeeds, it shows success and navigates to login', async () => {
    forgotPassword.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'Password reset link has been sent!',
      }),
    });
    const showSnackbar = jest.fn();

    renderWithProviders(<ForgotPassword showSnackbar={showSnackbar} />);
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(forgotPassword).toHaveBeenCalledWith({ email: 'test@example.com' });
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
      json: async () => ({ error: 'Invalid email address.' }),
    });
    const showSnackbar = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<ForgotPassword showSnackbar={showSnackbar} />);
      await userEvent.type(screen.getByLabelText(/email/i), 'not-email');
      await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));

      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith('error', 'Invalid email address.');
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
