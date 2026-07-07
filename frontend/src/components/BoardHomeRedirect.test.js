import { waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-support/utils';
import BoardHomeRedirect from './BoardHomeRedirect';
import { fetchBoards } from '../services/notoliApiClient';
import { useNavigate } from 'react-router-dom';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

jest.mock('../services/notoliApiClient', () => ({
  fetchBoards: jest.fn(),
}));

describe('BoardHomeRedirect', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('accessToken', 'token');
    sessionStorage.setItem('username', 'test_email');
    useNavigate.mockReturnValue(mockNavigate);
  });

  test('redirects to the remembered accessible board', async () => {
    localStorage.setItem('notoli:lastBoardByUser', JSON.stringify({ test_email: '12' }));
    fetchBoards.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 3 }, { id: 12 }],
    });

    renderWithProviders(<BoardHomeRedirect />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/board/12', { replace: true });
    });
  });

  test('falls back to the first accessible board', async () => {
    localStorage.setItem('notoli:lastBoardByUser', JSON.stringify({ test_email: '99' }));
    fetchBoards.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 7 }, { id: 3 }],
    });

    renderWithProviders(<BoardHomeRedirect />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/board/3', { replace: true });
    });
  });
});
