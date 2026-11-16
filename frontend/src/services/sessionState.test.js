let store;

beforeEach(async () => {
  vi.resetModules();
  sessionStorage.clear();
  store = await import('./sessionState');
});
afterEach(() => vi.restoreAllMocks());

test('hydrates compatible storage keys and returns a stable immutable snapshot', () => {
  sessionStorage.setItem('accessToken', ' access ');
  sessionStorage.setItem('refreshToken', 'refresh');
  sessionStorage.setItem('username', ' Reader ');
  sessionStorage.setItem('email', ' reader@example.com ');
  const session = store.getSessionSnapshot();
  expect(session).toMatchObject({
    accessToken: 'access',
    refreshToken: 'refresh',
    username: 'Reader',
    email: 'reader@example.com',
  });
  expect(store.getSessionSnapshot()).toBe(session);
  expect(Object.isFrozen(session)).toBe(true);
});

test('publishes one complete login, replaces absent profile fields, and clears only session keys', () => {
  const observed = [];
  const unsubscribe = store.subscribeSession(() => observed.push(store.getSessionSnapshot()));
  store.startSession({
    access: 'a',
    refresh: 'r',
    username: 'Reader',
    email: 'reader@example.com',
  });
  store.startSession({ access: 'b', refresh: 's' });
  sessionStorage.setItem('pendingSnackbar', 'keep');
  store.clearSession();
  expect(observed).toHaveLength(3);
  expect(observed[0]).toMatchObject({ accessToken: 'a', refreshToken: 'r', username: 'Reader' });
  expect(observed[1]).toMatchObject({
    accessToken: 'b',
    refreshToken: 's',
    username: '',
    email: '',
  });
  expect(observed[2]).toMatchObject({
    accessToken: null,
    refreshToken: null,
    username: '',
    email: '',
  });
  expect(observed[2].version).toBeGreaterThan(observed[1].version);
  expect(sessionStorage.getItem('pendingSnackbar')).toBe('keep');
  unsubscribe();
});

test('rotates tokens without changing account generation or profile and notifies subscribers', () => {
  store.startSession({ access: 'a', refresh: 'r', username: 'Reader' });
  const before = store.getSessionSnapshot();
  const listener = vi.fn();
  const unsubscribe = store.subscribeSession(listener);
  expect(store.rotateSessionTokens({ access: 'b', refresh: 's' }, before.version, 'r')).toBe(true);
  expect(store.getSessionSnapshot()).toMatchObject({
    accessToken: 'b',
    refreshToken: 's',
    username: 'Reader',
    version: before.version,
  });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(store.rotateSessionTokens({ access: 'c' }, before.version, 's')).toBe(true);
  expect(sessionStorage.getItem('refreshToken')).toBe('s');
  unsubscribe();
});

test.each(['logout', 'new login', 'rotated refresh'])(
  'rejects late token publication after %s',
  (change) => {
    store.startSession({ access: 'a', refresh: 'r' });
    const before = store.getSessionSnapshot();
    if (change === 'logout') store.clearSession();
    if (change === 'new login') store.startSession({ access: 'new', refresh: 'new-refresh' });
    if (change === 'rotated refresh')
      store.rotateSessionTokens({ access: 'b', refresh: 's' }, before.version, 'r');
    const current = store.getSessionSnapshot();
    expect(store.rotateSessionTokens({ access: 'late' }, before.version, 'r')).toBe(false);
    expect(store.getSessionSnapshot()).toBe(current);
  },
);

test('invalid credentials do not mutate a valid session', () => {
  store.startSession({ access: 'a', refresh: 'r' });
  const current = store.getSessionSnapshot();
  expect(() => store.startSession({ access: ' ', refresh: 'r' })).toThrow(
    'Auth response missing tokens.',
  );
  expect(store.rotateSessionTokens({ access: null }, current.version, 'r')).toBe(false);
  expect(store.getSessionSnapshot()).toBe(current);
});

test('blocked reads produce a stable anonymous snapshot', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const current = store.getSessionSnapshot();
  expect(current.accessToken).toBeNull();
  expect(store.getSessionSnapshot()).toBe(current);
});

test('a partial login write fails closed instead of mixing two accounts', () => {
  store.startSession({ access: 'old', refresh: 'old-refresh', username: 'Old' });
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (key === 'refreshToken') throw new Error('blocked');
    original.call(this, key, value);
  });
  expect(() => store.startSession({ access: 'new', refresh: 'new-refresh' })).toThrow(
    'Unable to access browser session storage.',
  );
  expect(store.getSessionSnapshot()).toMatchObject({
    accessToken: null,
    refreshToken: null,
    username: '',
  });
  expect(sessionStorage.getItem('accessToken')).toBeNull();
});

test('logout stays anonymous even when storage removal is blocked', () => {
  store.startSession({ access: 'old', refresh: 'old-refresh' });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  store.clearSession();
  expect(sessionStorage.getItem('accessToken')).toBe('old');
  expect(store.getSessionSnapshot().accessToken).toBeNull();
  vi.restoreAllMocks();
  store.startSession({ access: 'new', refresh: 'new-refresh' });
  expect(store.getSessionSnapshot().accessToken).toBe('new');
});

test('a failed refresh write retains the coherent prior snapshot', () => {
  store.startSession({ access: 'old', refresh: 'old-refresh' });
  const current = store.getSessionSnapshot();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(() =>
    store.rotateSessionTokens({ access: 'new' }, current.version, 'old-refresh'),
  ).toThrow('Unable to access browser session storage.');
  expect(store.getSessionSnapshot()).toBe(current);
});

test('notifies subscribers for relevant session-storage events and releases subscriptions', () => {
  // The subscriber only consumes these read-only fields from a native storage event.
  const storageEvent = (key, storageArea = sessionStorage) => {
    const event = new Event('storage');
    Object.defineProperties(event, {
      key: { value: key },
      storageArea: { value: storageArea },
    });
    return event;
  };
  store.getSessionSnapshot();
  const listener = vi.fn();
  const unsubscribe = store.subscribeSession(listener);
  sessionStorage.setItem('accessToken', 'external');
  window.dispatchEvent(storageEvent('accessToken'));
  expect(listener).toHaveBeenCalledTimes(1);
  expect(store.getSessionSnapshot().accessToken).toBe('external');

  sessionStorage.setItem('accessToken', 'later-external');
  window.dispatchEvent(storageEvent('unrelated'));
  expect(listener).toHaveBeenCalledTimes(1);
  window.dispatchEvent(storageEvent('accessToken', localStorage));
  expect(listener).toHaveBeenCalledTimes(1);

  sessionStorage.clear();
  window.dispatchEvent(storageEvent(null));
  expect(listener).toHaveBeenCalledTimes(2);
  expect(store.getSessionSnapshot().accessToken).toBeNull();
  unsubscribe();
  sessionStorage.setItem('accessToken', 'after-unsubscribe');
  window.dispatchEvent(storageEvent('accessToken'));
  store.clearSession();
  expect(listener).toHaveBeenCalledTimes(2);
});
