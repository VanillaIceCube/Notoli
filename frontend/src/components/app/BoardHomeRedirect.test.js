import useBoardList from '../../hooks/boards/useBoardList';
import useSession from '../../hooks/authentication/useSession';
import { startSession } from '../../services/authentication/sessionState';
import { createElement } from 'react';
import { act, waitFor } from '@testing-library/react';
import { createDeferred, renderWithProviders } from '../../test-helpers/utils';
import BoardHomeRedirect from './BoardHomeRedirect';
import { fetchBoards } from '../../services/boards/notoliApiClient';
import { useNavigate } from 'react-router';
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: vi.fn(),
}));
vi.mock('../../services/boards/notoliApiClient', () => ({
  fetchBoards: vi.fn(),
}));
function RedirectWithBoards(props) {
  const boardList = useBoardList();
  return createElement(BoardHomeRedirect, { ...props, boardList });
}
function SessionRedirect(props) {
  const { version } = useSession();
  return createElement(RedirectWithBoards, { ...props, key: version });
}
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
    renderWithProviders(createElement(SessionRedirect, { showSnackbar: vi.fn() }));
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
    renderWithProviders(createElement(SessionRedirect, { showSnackbar: vi.fn() }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/board/3', {
        replace: true,
      });
    });
  });
  test('stays home when the account has no boards', async () => {
    const pending = createDeferred();
    fetchBoards.mockReturnValueOnce(pending.promise);
    const showSnackbar = vi.fn();
    renderWithProviders(createElement(SessionRedirect, { showSnackbar }));
    await act(async () => pending.resolve([]));

    expect(fetchBoards).toHaveBeenCalledOnce();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(showSnackbar).not.toHaveBeenCalled();
  });

  test.each([
    [Object.assign(new Error('HTTP 500'), { status: 500 }), 'Board load failed :('],
    [new TypeError('Failed to fetch'), 'Network error :('],
  ])('stays home and reports a failed lookup %s', async (error, message) => {
    fetchBoards.mockRejectedValueOnce(error);
    const showSnackbar = vi.fn();
    renderWithProviders(createElement(SessionRedirect, { showSnackbar }));

    await waitFor(() => expect(showSnackbar).toHaveBeenCalledWith('error', message));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('leaving home cancels the pending board redirect', async () => {
    const pending = createDeferred();
    fetchBoards.mockReturnValueOnce(pending.promise);
    const { unmount } = renderWithProviders(
      createElement(SessionRedirect, { showSnackbar: vi.fn() }),
    );
    unmount();

    await act(async () => pending.resolve([{ id: 3 }]));

    expect(mockNavigate).not.toHaveBeenCalled();
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
  renderWithProviders(createElement(SessionRedirect, { showSnackbar: vi.fn() }));
  act(() => startSession({ access: 'new', refresh: 'new-r' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/board/12', { replace: true }));
  await act(async () => {
    finish([{ id: 1 }]);
  });
  expect(navigate).not.toHaveBeenCalledWith('/board/1', expect.anything());
});
