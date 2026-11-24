import { act, renderHook, waitFor } from '@testing-library/react';
import {
  clearSession,
  getSessionVersion,
  rotateSessionTokens,
  startSession,
} from '../../services/authentication/sessionState';
import { fetchBoards } from '../../services/boards/notoliApiClient';
import useBoardList from './useBoardList';

vi.mock('../../services/boards/notoliApiClient', () => ({ fetchBoards: vi.fn() }));

beforeEach(() => startSession({ access: 'access', refresh: 'refresh' }));
afterEach(() => clearSession());

test('merges a successful add into the first list result', async () => {
  const pending = Promise.withResolvers();
  fetchBoards.mockReturnValueOnce(pending.promise);
  const { result } = renderHook(useBoardList);
  const created = { id: 3, name: 'New' };
  act(() => result.current.updateBoards((boards) => [...boards, created]));
  await act(async () => pending.resolve([{ id: 2, name: 'Existing' }]));
  expect(result.current.boards).toEqual([{ id: 2, name: 'Existing' }, created]);
  expect(result.current.loading).toBe(false);
});

test('a refresh respects newer board renames and deletions', async () => {
  const original = [
    { id: 1, name: 'Old' },
    { id: 2, name: 'Removed' },
  ];
  const pending = Promise.withResolvers();
  fetchBoards.mockResolvedValueOnce(original).mockReturnValueOnce(pending.promise);
  const { result } = renderHook(useBoardList);
  await waitFor(() => expect(result.current.boards).toEqual(original));
  act(() => rotateSessionTokens({ access: 'rotated' }, getSessionVersion(), 'refresh'));
  act(() => {
    result.current.updateBoards((boards) =>
      boards.map((board) => (board.id === 1 ? { ...board, name: 'Renamed' } : board)),
    );
    result.current.updateBoards((boards) => boards.filter((board) => board.id !== 2));
  });
  await act(async () => pending.resolve(original));
  expect(result.current.boards).toEqual([{ id: 1, name: 'Renamed' }]);
});
