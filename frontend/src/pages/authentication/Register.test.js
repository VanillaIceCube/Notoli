import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, setupUserEvent } from '../../test-utils';
import Register from './Register';
import { register } from '../../services/BackendClient';
import { useNavigate } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

jest.mock('../../services/BackendClient', () => ({
  register: jest.fn(),
}));

describe('Register', () => {
  const mockNavigate = jest.fn();
  let user;

  beforeEach(() => {
    jest.clearAllMocks();
    useNavigate.mockReturnValue(mockNavigate);
    sessionStorage.clear();
    user = setupUserEvent();
  });

  test('when rendered, it shows email/username/password inputs and submit button', () => {
    renderWithProviders(<Register showSnackbar={jest.fn()} />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
  });

  test('when registration succeeds, it stores tokens, navigates to workspace, and shows success', async () => {
    register.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'User created successfully.',
        access: 'access-token',
        refresh: 'refresh-token',
        workspace_id: 12,
      }),
    });

    const showSnackbar = jest.fn();

    renderWithProviders(<Register showSnackbar={showSnackbar} />);

    await user.type(screen.getByLabelText(/email/i), 'test_email@example.com');
    await user.type(screen.getByLabelText(/username/i), 'test_username');
    await user.type(screen.getByLabelText(/password/i), 'test_password');
    await user.click(screen.getByRole('button', { name: /register/i }));

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
      expect(mockNavigate).toHaveBeenCalledWith('/workspace/12');
    });

    expect(sessionStorage.getItem('accessToken')).toBe('access-token');
    expect(sessionStorage.getItem('refreshToken')).toBe('refresh-token');
  });

  test('when registration fails, it shows the server error', async () => {
    register.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Email already exists.' }),
    });

    const showSnackbar = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Register showSnackbar={showSnackbar} />);

      await user.type(screen.getByLabelText(/email/i), 'test_email@example.com');
      await user.type(screen.getByLabelText(/password/i), 'test_password');
      await user.click(screen.getByRole('button', { name: /register/i }));

      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith('error', 'Email already exists.');
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  test('when registration fails due to a network error, it shows a network error snackbar', async () => {
    register.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));

    const showSnackbar = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      renderWithProviders(<Register showSnackbar={showSnackbar} />);

      await user.type(screen.getByLabelText(/email/i), 'test_email@example.com');
      await user.type(screen.getByLabelText(/password/i), 'test_password');
      await user.click(screen.getByRole('button', { name: /register/i }));

      await waitFor(() => {
        expect(showSnackbar).toHaveBeenCalledWith('error', 'Network error :(');
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
