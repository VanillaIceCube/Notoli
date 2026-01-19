import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-utils';
import Register from './Register';
import { apiFetch } from '../../services/client';
import { useNavigate } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

jest.mock('../../services/client', () => ({
  apiFetch: jest.fn(),
}));

describe('Register', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useNavigate.mockReturnValue(mockNavigate);
  });

  test('when rendered, it shows email/username/password inputs and submit button', () => {
    renderWithProviders(<Register showSnackbar={jest.fn()} />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
  });

  test('when registration succeeds, it navigates to login and shows success', async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'User created successfully.' }),
    });

    const showSnackbar = jest.fn();

    renderWithProviders(<Register showSnackbar={showSnackbar} />);

    await userEvent.type(screen.getByLabelText(/email/i), 'test_email@example.com');
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'test_password');
    await userEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/auth/register/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'test_email@example.com',
            username: 'testuser',
            password: 'test_password',
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(showSnackbar).toHaveBeenCalledWith('success', 'Account created! Please log in.');
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  test('when registration fails, it shows the server error', async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Email already exists.' }),
    });

    const showSnackbar = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Register showSnackbar={showSnackbar} />);

      await userEvent.type(screen.getByLabelText(/email/i), 'test_email@example.com');
      await userEvent.type(screen.getByLabelText(/password/i), 'test_password');
      await userEvent.click(screen.getByRole('button', { name: /register/i }));

      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith('error', 'Email already exists.');
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  test('when registration fails due to a network error, it shows a network error snackbar', async () => {
    apiFetch.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));

    const showSnackbar = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Register showSnackbar={showSnackbar} />);

      await userEvent.type(screen.getByLabelText(/email/i), 'test_email@example.com');
      await userEvent.type(screen.getByLabelText(/password/i), 'test_password');
      await userEvent.click(screen.getByRole('button', { name: /register/i }));

      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith('error', 'Network error :(');
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
