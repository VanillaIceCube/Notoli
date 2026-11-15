import { act, renderHook, waitFor } from '@testing-library/react';
import useNotifications from './useNotifications';
import {
  clearSession,
  getSessionSnapshot,
  rotateSessionTokens,
  startSession,
} from '../services/sessionState';

const item = {
  id: 1,
  title: 'Update',
  message: 'Something changed.',
  is_read: false,
  target_path: '/target',
};
const response = (body, ok = true) => ({ ok, json: vi.fn().mockResolvedValue(body) });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
let api;

beforeEach(() => {
  clearSession();
  startSession({ access: 'access', refresh: 'refresh' });
  api = {
    fetchNotifications: vi.fn().mockResolvedValue(response([item])),
    markNotificationRead: vi.fn().mockResolvedValue(response({ ...item, is_read: true })),
    clearNotification: vi.fn().mockResolvedValue(response(null)),
    markAllNotificationsRead: vi.fn().mockResolvedValue(response({ updated: 1 })),
    clearAllNotifications: vi.fn().mockResolvedValue(response({ deleted: 1 })),
  };
});

async function loaded() {
  const { result, unmount } = renderHook(() => useNotifications(api));
  await waitFor(() => expect(result.current.notifications).toEqual([item]));
  return { result, unmount };
}

test('loads the account list and exposes its unread count', async () => {
  const { result } = await loaded();
  expect(api.fetchNotifications).toHaveBeenCalledWith('access');
  expect(result.current.unreadCount).toBe(1);
  expect(result.current.notificationsLoading).toBe(false);
});

test('never fetches private notifications while signed out', () => {
  clearSession();
  const { result } = renderHook(() => useNotifications(api));
  expect(api.fetchNotifications).not.toHaveBeenCalled();
  expect(result.current.notifications).toEqual([]);
});

test.each([null, [null], [{ message: 'no identity' }]])(
  'rejects malformed data %j and allows a successful retry',
  async (bad) => {
    api.fetchNotifications.mockResolvedValueOnce(response(bad));
    const { result } = renderHook(() => useNotifications(api));
    await waitFor(() =>
      expect(result.current.notificationError).toBe('Notifications are unavailable right now.'),
    );
    await act(() => result.current.loadNotifications());
    expect(result.current.notifications).toEqual([item]);
    expect(result.current.notificationError).toBe('');
  },
);

test('only the newest load may publish data or errors', async () => {
  const first = deferred();
  api.fetchNotifications.mockReturnValueOnce(first.promise);
  const { result } = renderHook(() => useNotifications(api));
  await act(() => result.current.loadNotifications());
  await act(async () => {
    first.reject(new Error('late failure'));
  });
  expect(result.current.notifications).toEqual([item]);
  expect(result.current.notificationError).toBe('');
  expect(result.current.notificationsLoading).toBe(false);
});

test('token rotation preserves pending work and data and uses the current token for the next action', async () => {
  const { result } = await loaded();
  const pending = deferred();
  api.markNotificationRead.mockReturnValueOnce(pending.promise);
  let mutation;
  act(() => {
    mutation = result.current.markRead(item);
  });
  const before = getSessionSnapshot();
  act(() => rotateSessionTokens({ access: 'rotated' }, before.version, before.refreshToken));
  expect(api.fetchNotifications).toHaveBeenCalledTimes(1);
  expect(result.current.pendingIds.has(1)).toBe(true);
  expect(result.current.notifications).toEqual([item]);
  await act(async () => {
    pending.resolve(response({ ...item, is_read: true }));
    await mutation;
  });
  expect(result.current.unreadCount).toBe(0);
  await act(() => result.current.clearNotification(1));
  expect(api.clearNotification).toHaveBeenCalledWith(1, 'rotated');
});

test('synchronous item locks block duplicate and bulk actions but allow another item', async () => {
  const { result } = await loaded();
  const pending = deferred();
  api.markNotificationRead.mockReturnValueOnce(pending.promise);
  let mutation;
  await act(async () => {
    mutation = result.current.markRead(item);
    expect(await result.current.markRead(item)).toBe(false);
    expect(await result.current.clearNotification(1)).toBe(false);
    expect(await result.current.clearAll()).toBe(false);
    expect(await result.current.clearNotification(2)).toBe(true);
  });
  expect(api.markNotificationRead).toHaveBeenCalledTimes(1);
  expect(api.clearAllNotifications).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve(response({ ...item, is_read: true }));
    await mutation;
  });
  expect(result.current.pendingIds.size).toBe(0);
});

test('a failed bulk action blocks other mutations until it releases its lock', async () => {
  const { result } = await loaded();
  const pending = deferred();
  api.clearAllNotifications.mockReturnValueOnce(pending.promise);
  let mutation;
  await act(async () => {
    mutation = result.current.clearAll();
    expect(await result.current.clearNotification(1)).toBe(false);
    expect(await result.current.markAllRead()).toBe(false);
  });
  expect(result.current.actionPending).toBe(true);
  await act(async () => {
    pending.reject(new Error('offline'));
    await mutation;
  });
  expect(result.current.actionPending).toBe(false);
  expect(result.current.notificationError).toBe('Could not clear notifications.');
  await act(() => result.current.markAllRead());
  expect(result.current.unreadCount).toBe(0);
});

test('an earlier list response cannot resurrect a successfully cleared notification', async () => {
  const { result } = await loaded();
  const pending = deferred();
  api.fetchNotifications.mockReturnValueOnce(pending.promise);
  let reload;
  act(() => {
    reload = result.current.loadNotifications();
  });
  await act(() => result.current.clearNotification(1));
  await act(async () => {
    pending.resolve(response([item]));
    await reload;
  });
  expect(result.current.notifications).toEqual([]);
  expect(result.current.notificationsLoading).toBe(false);
});

test('a malformed mark-read response does not approve navigation or change the item', async () => {
  const { result } = await loaded();
  api.markNotificationRead.mockResolvedValueOnce(response({ ...item, id: 99, is_read: true }));
  let allowed;
  await act(async () => {
    allowed = await result.current.markRead(item);
  });
  expect(allowed).toBe(false);
  expect(result.current.notifications).toEqual([item]);
  expect(result.current.notificationError).toBe('Could not update that notification.');
});

test.each(['success', 'failure'])(
  'an old account list %s cannot overwrite the new account',
  async (outcome) => {
    const pending = deferred();
    api.fetchNotifications.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response([]));
    const { result } = renderHook(() => useNotifications(api));
    act(() => startSession({ access: 'new', refresh: 'new-r' }));
    expect(result.current.notifications).toEqual([]);
    await waitFor(() => expect(result.current.notificationsLoading).toBe(false));
    await act(async () => {
      if (outcome === 'success') pending.resolve(response([item]));
      else pending.reject(new Error('late'));
    });
    expect(result.current.notifications).toEqual([]);
    expect(result.current.notificationError).toBe('');
    expect(api.fetchNotifications).toHaveBeenLastCalledWith('new');
  },
);

test.each(['account change', 'unmount'])(
  'a pending mark-read cannot approve navigation after %s',
  async (change) => {
    const { result, unmount } = await loaded();
    const pending = deferred();
    api.markNotificationRead.mockReturnValueOnce(pending.promise);
    let mutation;
    act(() => {
      mutation = result.current.markRead(item);
    });
    if (change === 'account change') act(() => startSession({ access: 'new', refresh: 'new-r' }));
    else unmount();
    let allowed;
    await act(async () => {
      pending.resolve(response({ ...item, is_read: true }));
      allowed = await mutation;
    });
    expect(allowed).toBe(false);
  },
);

test('old handlers cannot start a mutation using a different account', async () => {
  const { result } = await loaded();
  const oldClear = result.current.clearNotification;
  act(() => startSession({ access: 'new', refresh: 'new-r' }));
  await act(async () => {
    expect(await oldClear(1)).toBe(false);
  });
  expect(api.clearNotification).not.toHaveBeenCalled();
});

test('uses an app error adapter without changing the shared lifecycle contract', async () => {
  const errorReader = vi.fn().mockResolvedValue('A safe application error.');
  api.fetchNotifications.mockResolvedValueOnce(response(null, false));
  const { result } = renderHook(() => useNotifications(api, errorReader));
  await waitFor(() => expect(result.current.notificationError).toBe('A safe application error.'));
  expect(errorReader).toHaveBeenCalledWith(
    expect.anything(),
    'Notifications are unavailable right now.',
  );
});
