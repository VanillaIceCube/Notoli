import { startSession } from '../services/sessionState';
import { createElement } from 'react';
import { act, waitFor } from '@testing-library/react';
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
    fetchBoards.mockResolvedValueOnce([
      {
        id: 3,
      },
      {
        id: 12,
      },
    ]);
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
    fetchBoards.mockResolvedValueOnce([
      {
        id: 7,
      },
      {
        id: 3,
      },
    ]);
    renderWithProviders(createElement(BoardHomeRedirect));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/board/3', {
        replace: true,
      });
    });
  });
});

test('ignores a previous account board lookup when selecting the new account home', async () => {
  let finish;
  const navigate = vi.fn();
  useNavigate.mockReturnValue(navigate);
  startSession({ access: 'a', refresh: 'r' });
  fetchBoards
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValue([{ id: 12 }]);
  renderWithProviders(createElement(BoardHomeRedirect));
  act(() => startSession({ access: 'new', refresh: 'new-r' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/board/12', { replace: true }));
  await act(async () => {
    finish([{ id: 1 }]);
  });
  expect(navigate).not.toHaveBeenCalledWith('/board/1', expect.anything());
});
