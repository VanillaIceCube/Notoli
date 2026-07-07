import { getLastBoardId, getPreferredBoardId, rememberLastBoard } from './lastBoard';

describe('lastBoard', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  test('remembers a board per logged-in user', () => {
    sessionStorage.setItem('username', 'andrew');

    rememberLastBoard(12);

    expect(getLastBoardId()).toBe('12');
  });

  test('does not leak one user board choice to another user', () => {
    sessionStorage.setItem('username', 'andrew');
    rememberLastBoard(12);

    sessionStorage.setItem('username', 'jude');

    expect(getLastBoardId()).toBeNull();
  });

  test('prefers the last accessible board', () => {
    sessionStorage.setItem('username', 'andrew');
    rememberLastBoard(12);

    expect(getPreferredBoardId([{ id: 7 }, { id: 12 }, { id: 3 }])).toBe('12');
  });

  test('falls back to the first board when the remembered one is inaccessible', () => {
    sessionStorage.setItem('username', 'andrew');
    rememberLastBoard(12);

    expect(getPreferredBoardId([{ id: 7 }, { id: 3 }])).toBe('3');
  });
});
