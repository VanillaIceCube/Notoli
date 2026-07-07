import { waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-support/utils';
import WorkspaceHomeRedirect from './WorkspaceHomeRedirect';
import { fetchWorkspaces } from '../services/notoliApiClient';
import { useNavigate } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

jest.mock('../services/notoliApiClient', () => ({
  fetchWorkspaces: jest.fn(),
}));

describe('WorkspaceHomeRedirect', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('accessToken', 'token');
    sessionStorage.setItem('username', 'test_email');
    useNavigate.mockReturnValue(mockNavigate);
  });

  test('redirects to the remembered accessible workspace', async () => {
    localStorage.setItem('notoli:lastWorkspaceByUser', JSON.stringify({ test_email: '12' }));
    fetchWorkspaces.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 3 }, { id: 12 }],
    });

    renderWithProviders(<WorkspaceHomeRedirect />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/workspace/12', { replace: true });
    });
  });

  test('falls back to the first accessible workspace', async () => {
    localStorage.setItem('notoli:lastWorkspaceByUser', JSON.stringify({ test_email: '99' }));
    fetchWorkspaces.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 7 }, { id: 3 }],
    });

    renderWithProviders(<WorkspaceHomeRedirect />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/workspace/3', { replace: true });
    });
  });
});
