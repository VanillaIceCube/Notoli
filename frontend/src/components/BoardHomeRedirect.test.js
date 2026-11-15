import { createElement } from 'react';
import { waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-helpers/utils';
import BoardHomeRedirect from './BoardHomeRedirect';
import { fetchBoards } from '../services/notoliApiClient';
import { useNavigate } from 'react-router';
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: vi.fn(),
}));
vi.mock('../services/notoliApiClient', () => ({
  fetchBoards: vi.fn(),
}));
describe('BoardHomeRedirect', () => {
  const mockNavigate = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('accessToken', 'token');
    sessionStorage.setItem('username', 'test_email');
    useNavigate.mockReturnValue(mockNavigate);
  });
  test('redirects to the remembered accessible board', async () => {
    localStorage.setItem(
      'notoli:lastBoardByUser',
      JSON.stringify({
        test_email: '12',
      }),
    );
    fetchBoards.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 3,
        },
        {
          id: 12,
        },
      ],
    });
    renderWithProviders(createElement(BoardHomeRedirect));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/board/12', {
        replace: true,
      });
    });
  });
  test('falls back to the first accessible board', async () => {
    localStorage.setItem(
      'notoli:lastBoardByUser',
      JSON.stringify({
        test_email: '99',
      }),
    );
    fetchBoards.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 7,
        },
        {
          id: 3,
        },
      ],
    });
    renderWithProviders(createElement(BoardHomeRedirect));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/board/3', {
        replace: true,
      });
    });
  });
});
