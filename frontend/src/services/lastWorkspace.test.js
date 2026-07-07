import {
  getLastWorkspaceId,
  getPreferredWorkspaceId,
  rememberLastWorkspace,
} from './lastWorkspace';

describe('lastWorkspace', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  test('remembers a workspace per logged-in user', () => {
    sessionStorage.setItem('username', 'andrew');

    rememberLastWorkspace(12);

    expect(getLastWorkspaceId()).toBe('12');
  });

  test('does not leak one user workspace choice to another user', () => {
    sessionStorage.setItem('username', 'andrew');
    rememberLastWorkspace(12);

    sessionStorage.setItem('username', 'jude');

    expect(getLastWorkspaceId()).toBeNull();
  });

  test('prefers the last accessible workspace', () => {
    sessionStorage.setItem('username', 'andrew');
    rememberLastWorkspace(12);

    expect(getPreferredWorkspaceId([{ id: 7 }, { id: 12 }, { id: 3 }])).toBe('12');
  });

  test('falls back to the first workspace when the remembered one is inaccessible', () => {
    sessionStorage.setItem('username', 'andrew');
    rememberLastWorkspace(12);

    expect(getPreferredWorkspaceId([{ id: 7 }, { id: 3 }])).toBe('3');
  });
});
