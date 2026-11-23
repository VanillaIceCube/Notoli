import { act, renderHook } from '@testing-library/react';
import useSession, { useSessionGuard } from './useSession';
import {
  clearSession,
  startSession,
  rotateSessionTokens,
} from '../../services/authentication/sessionState';

beforeEach(() => {
  sessionStorage.clear();
  clearSession();
});

test('updates every mounted reader after login, token rotation, account replacement and logout', () => {
  sessionStorage.setItem('accessToken', 'legacy');
  const { result: firstResult, unmount: unmountFirst } = renderHook(useSession);
  const { result: secondResult } = renderHook(useSession);
  expect(firstResult.current.accessToken).toBe('legacy');
  act(() => startSession({ access: 'a', refresh: 'r', username: 'Reader' }));
  const generation = firstResult.current.version;
  expect(firstResult.current).toBe(secondResult.current);
  act(() => rotateSessionTokens({ access: 'b' }, generation, 'r'));
  expect(secondResult.current).toMatchObject({
    accessToken: 'b',
    username: 'Reader',
    version: generation,
  });
  unmountFirst();
  act(() => startSession({ access: 'next', refresh: 'next-r' }));
  expect(secondResult.current).toMatchObject({ accessToken: 'next', username: '' });
  act(() => clearSession());
  expect(secondResult.current.accessToken).toBeNull();
});

test('guards old continuations after replacement and unmount while allowing token rotation', () => {
  startSession({ access: 'a', refresh: 'r' });
  const { result, unmount } = renderHook(() => ({
    session: useSession(),
    isCurrent: useSessionGuard(),
  }));
  const oldGuard = result.current.isCurrent;
  act(() => rotateSessionTokens({ access: 'b' }, result.current.session.version, 'r'));
  expect(oldGuard()).toBe(true);
  act(() => startSession({ access: 'next', refresh: 'next-r' }));
  expect(oldGuard()).toBe(false);
  const currentGuard = result.current.isCurrent;
  expect(currentGuard()).toBe(true);
  unmount();
  expect(currentGuard()).toBe(false);
});

test('a form response expires when navigation starts while the old screen is still mounted', () => {
  const originalUrl = window.location.href;
  try {
    window.history.replaceState({}, '', '/login');
    const { result } = renderHook(() => ({
      form: useSessionGuard({ trackLocation: true }),
      session: useSessionGuard(),
    }));
    window.history.replaceState({}, '', '/register');
    expect(result.current.form()).toBe(false);
    expect(result.current.session()).toBe(true);
  } finally {
    window.history.replaceState({}, '', originalUrl);
  }
});
