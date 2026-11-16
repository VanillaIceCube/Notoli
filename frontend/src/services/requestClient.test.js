describe('requestClient', () => {
  test('an unset production API base uses same-origin URLs', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    const { apiFetch } = await import('./requestClient');
    await apiFetch('/api/example/');
    expect(global.fetch).toHaveBeenCalledWith('/api/example/', {});
  });

  test('the fallback login redirect preserves the Vite deployment base', async () => {
    vi.stubEnv('BASE_URL', '/sample/');
    const { browserLocation, clearNavigate } = await import('./navigationService');
    const replace = vi.spyOn(browserLocation, 'replace').mockImplementation(() => {});
    clearNavigate();
    const { logout } = await import('./requestClient');
    logout();
    expect(replace).toHaveBeenCalledWith(`${window.location.origin}/sample/login`);
  });

  test('background requests preserve the active consent URL when authentication expires', async () => {
    const { setNavigate } = await import('./navigationService');
    const mockNavigate = vi.fn();
    setNavigate(mockNavigate);
    const pending = '/connections/authorize?state=pending%26state';
    window.history.replaceState({}, '', pending);
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
    });
    const { apiFetch } = await import('./requestClient');
    await apiFetch('/api/notifications/');
    expect(mockNavigate).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(pending)}`, {
      replace: true,
    });
  });
  test('expired connection authentication returns to the pending consent after login', async () => {
    const { setNavigate } = await import('./navigationService');
    const mockNavigate = vi.fn();
    setNavigate(mockNavigate);
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
    });
    sessionStorage.setItem('accessToken', 'EXPIRED');
    const { apiFetch } = await import('./requestClient');
    const pending =
      '/connections/authorize?state=a%26b&resource=https%3A%2F%2Fnotoli.example%2Fmcp';
    await apiFetch('/auth/mcp/authorize/', {
      headers: {
        Authorization: 'Bearer EXPIRED',
      },
      authReturnTo: pending,
    });
    expect(mockNavigate).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(pending)}`, {
      replace: true,
    });
    expect(global.fetch.mock.calls[0][1]).not.toHaveProperty('authReturnTo');
  });
  test('connection requests refresh expired JWTs without forcing a second login', async () => {
    const { setNavigate } = await import('./navigationService');
    const mockNavigate = vi.fn();
    setNavigate(mockNavigate);
    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access: 'FRESH',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
    sessionStorage.setItem('accessToken', 'EXPIRED');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    const { apiFetch } = await import('./requestClient');
    await apiFetch('/auth/mcp/authorize/', {
      credentials: 'omit',
      headers: {
        Authorization: 'Bearer EXPIRED',
      },
      authReturnTo: '/connections/authorize?state=state',
    });
    expect(global.fetch.mock.calls[2][1]).toEqual({
      credentials: 'omit',
      headers: {
        Authorization: 'Bearer FRESH',
      },
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_API_BASE_URL', undefined);
    vi.stubEnv('PROD', false);
    vi.stubEnv('DEV', true);
    vi.stubEnv('BASE_URL', '/');
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
      }),
    );
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  test('when VITE_API_BASE_URL is set, it prefixes the base URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    const { apiFetch } = await import('./requestClient');
    await apiFetch('/path', {
      method: 'GET',
    });
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/path', {
      method: 'GET',
    });
  });
  test('when VITE_API_BASE_URL is blank, it uses same-origin relative URLs', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const { apiFetch } = await import('./requestClient');
    await apiFetch('/api/boards/', {
      method: 'GET',
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/boards/', {
      method: 'GET',
    });
  });
  test('when VITE_API_BASE_URL is not set, it uses the default base URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined);
    const { apiFetch } = await import('./requestClient');
    await apiFetch('/path', {
      method: 'GET',
    });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/path', {
      method: 'GET',
    });
  });
  test('when options are provided, it passes them through unchanged', async () => {
    const options = {
      method: 'POST',
      headers: {
        'X-Test': 'ok',
      },
      body: JSON.stringify({
        ok: true,
      }),
    };
    vi.stubEnv('VITE_API_BASE_URL', undefined);
    const { apiFetch } = await import('./requestClient');
    await apiFetch('/path', options);
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/path', options);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  test('when a non-auth endpoint and refresh token are invalid, it clears tokens and redirects to /login', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined);
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
      }),
    );
    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    window.history.replaceState({}, '', '/board/1');
    const { setNavigate } = await import('./navigationService');
    const mockNavigate = vi.fn();
    setNavigate(mockNavigate);
    const { apiFetch } = await import('./requestClient');
    await apiFetch('/api/boards/', {
      method: 'GET',
    });
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('pendingSnackbar'))).toEqual({
      severity: 'error',
      message: 'Your session expired. Please log in again.',
    });
    expect(mockNavigate).toHaveBeenCalledWith('/login', {
      replace: true,
    });
  });
  test('when an access token expires, it refreshes once and retries without logging out', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined);
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access: 'NEW_ACCESS',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    const { setNavigate } = await import('./navigationService');
    const mockNavigate = vi.fn();
    setNavigate(mockNavigate);
    const { apiFetch } = await import('./requestClient');
    const response = await apiFetch('/api/boards/', {
      headers: {
        Authorization: 'Bearer ACCESS',
      },
    });
    expect(response.ok).toBe(true);
    expect(sessionStorage.getItem('accessToken')).toBe('NEW_ACCESS');
    expect(sessionStorage.getItem('refreshToken')).toBe('REFRESH');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenLastCalledWith('http://localhost:8000/api/boards/', {
      headers: {
        Authorization: 'Bearer NEW_ACCESS',
      },
    });
  });
  test('when refresh has a transient failure, it preserves the session and returns the original response', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined);
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      });
    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    const { setNavigate } = await import('./navigationService');
    const mockNavigate = vi.fn();
    setNavigate(mockNavigate);
    const { apiFetch } = await import('./requestClient');
    const response = await apiFetch('/api/boards/');
    expect(response.status).toBe(401);
    expect(sessionStorage.getItem('accessToken')).toBe('ACCESS');
    expect(sessionStorage.getItem('refreshToken')).toBe('REFRESH');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
  test('when /auth/login/ returns 401, it does not redirect or clear tokens', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined);
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
      }),
    );
    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    window.history.replaceState({}, '', '/login');
    const { setNavigate } = await import('./navigationService');
    const mockNavigate = vi.fn();
    setNavigate(mockNavigate);
    const { apiFetch } = await import('./requestClient');
    await apiFetch('/auth/login/', {
      method: 'POST',
    });
    expect(sessionStorage.getItem('accessToken')).toBe('ACCESS');
    expect(sessionStorage.getItem('refreshToken')).toBe('REFRESH');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
  test('when /auth/forgot-password/ returns 401, it does not redirect or clear tokens', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined);
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
      }),
    );
    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    const { setNavigate } = await import('./navigationService');
    const mockNavigate = vi.fn();
    setNavigate(mockNavigate);
    const { apiFetch } = await import('./requestClient');
    await apiFetch('/auth/forgot-password/', {
      method: 'POST',
    });
    expect(sessionStorage.getItem('accessToken')).toBe('ACCESS');
    expect(sessionStorage.getItem('refreshToken')).toBe('REFRESH');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
  test('when logout() is called, it clears tokens/profile and redirects to /login', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined);
    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    sessionStorage.setItem('username', 'judea');
    sessionStorage.setItem('email', 'judea@example.com');
    window.history.replaceState({}, '', '/board/1');
    const { setNavigate } = await import('./navigationService');
    const mockNavigate = vi.fn();
    setNavigate(mockNavigate);
    const { logout } = await import('./requestClient');
    logout();
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    expect(sessionStorage.getItem('username')).toBeNull();
    expect(sessionStorage.getItem('email')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('pendingSnackbar'))).toEqual({
      severity: 'success',
      message: 'Logout Successful :)',
    });
    expect(mockNavigate).toHaveBeenCalledWith('/login', {
      replace: true,
    });
  });
  test('when logout() is called before navigate is registered, it still redirects', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined);
    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    const { browserLocation, clearNavigate } = await import('./navigationService');
    const replaceSpy = vi.spyOn(browserLocation, 'replace').mockImplementation(() => {});
    clearNavigate();
    const { logout } = await import('./requestClient');
    expect(() => logout()).not.toThrow();
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    expect(replaceSpy).toHaveBeenCalledWith(`${window.location.origin}/login`);
    replaceSpy.mockRestore();
  });
  test('normalizeHeaders correctly normalizes various header formats', async () => {
    const { normalizeHeaders } = await import('./requestClient');
    expect(normalizeHeaders(null)).toEqual({});
    expect(
      normalizeHeaders({
        'Content-Type': 'application/json',
      }),
    ).toEqual({
      'Content-Type': 'application/json',
    });
    expect(
      normalizeHeaders([
        ['Content-Type', 'application/json'],
        ['X-Custom', 'value'],
      ]),
    ).toEqual({
      'Content-Type': 'application/json',
      'X-Custom': 'value',
    });
    const headersInstance = new Headers();
    headersInstance.append('Content-Type', 'application/json');
    headersInstance.append('X-Custom', 'value');
    expect(normalizeHeaders(headersInstance)).toEqual({
      'content-type': 'application/json',
      'x-custom': 'value',
    });
  });
  test('preserves Headers instance entries when retrying after access token refresh', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access: 'NEW_ACCESS',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
    sessionStorage.setItem('accessToken', 'OLD_ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    const { apiFetch } = await import('./requestClient');
    const customHeaders = new Headers();
    customHeaders.append('Content-Type', 'application/json');
    customHeaders.append('X-Custom-Header', 'custom-value');
    const response = await apiFetch('/api/custom/', {
      method: 'POST',
      headers: customHeaders,
    });
    expect(global.fetch).toHaveBeenCalledTimes(3); // Initial request, refresh, one retry.
    expect(response.ok).toBe(true);
    expect(global.fetch).toHaveBeenLastCalledWith('http://localhost:8000/api/custom/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-custom-header': 'custom-value',
        Authorization: 'Bearer NEW_ACCESS',
      },
    });
  });
  test('automatically attaches stored accessToken when not provided in headers', async () => {
    sessionStorage.setItem('accessToken', 'STORED_ACCESS');
    const { apiFetch } = await import('./requestClient');
    await apiFetch('/api/protected/', {
      method: 'GET',
    });
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/api/protected/', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer STORED_ACCESS',
      },
    });
  });
  test('replaces case-variant authorization headers when retrying with new access token', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access: 'NEW_ACCESS',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });
    sessionStorage.setItem('accessToken', 'OLD_ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    const { apiFetch } = await import('./requestClient');
    const response = await apiFetch('/api/custom/', {
      method: 'GET',
      headers: {
        authorization: 'Bearer OLD_ACCESS',
        'x-custom': 'test',
      },
    });
    expect(global.fetch).toHaveBeenCalledTimes(3); // Initial request, refresh, one retry.
    expect(response.ok).toBe(true);
    expect(global.fetch).toHaveBeenLastCalledWith('http://localhost:8000/api/custom/', {
      method: 'GET',
      headers: {
        'x-custom': 'test',
        Authorization: 'Bearer NEW_ACCESS',
      },
    });
  });
  test('preserves explicit authorization and never attaches stored tokens to public auth forms', async () => {
    sessionStorage.setItem('accessToken', 'STORED_ACCESS');
    const { apiFetch } = await import('./requestClient');
    await apiFetch('/api/protected/', {
      headers: [
        ['authorization', 'Bearer EXPLICIT'],
        ['X-Custom', 'kept'],
      ],
    });
    expect(global.fetch).toHaveBeenLastCalledWith('http://localhost:8000/api/protected/', {
      headers: {
        authorization: 'Bearer EXPLICIT',
        'X-Custom': 'kept',
      },
    });
    for (const path of [
      '/auth/login/',
      '/auth/register/',
      '/auth/forgot-password/',
      '/auth/reset-password/',
    ]) {
      await apiFetch(path, {
        method: 'POST',
      });
      expect(global.fetch).toHaveBeenLastCalledWith(`http://localhost:8000${path}`, {
        method: 'POST',
      });
    }
  });
});

describe('session lifecycle', () => {
  const deferred = () => {
    let resolve;
    const promise = new Promise((settle) => {
      resolve = settle;
    });
    return { promise, resolve };
  };
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/dashboard');
    vi.stubEnv('VITE_API_BASE_URL', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test.each([200, 401, 503])(
    'an old refresh (%s) cannot restore a logged-out session',
    async (status) => {
      const pending = deferred();
      const { persistAuthSession } = await import('./authSession');
      persistAuthSession({ access: 'old', refresh: 'old-refresh' });
      const { setNavigate } = await import('./navigationService');
      const navigate = vi.fn();
      setNavigate(navigate);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({ status: 401 }).mockReturnValueOnce(pending.promise),
      );
      const { apiFetch, logout } = await import('./requestClient');
      const request = apiFetch('/api/private/');
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      logout();
      navigate.mockClear();
      pending.resolve({
        status,
        ok: status === 200,
        json: async () => ({ access: 'late', refresh: 'late-refresh' }),
      });
      await request;
      expect(sessionStorage.getItem('accessToken')).toBeNull();
      expect(sessionStorage.getItem('refreshToken')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  test.each([200, 401, 503])(
    'an old refresh (%s) cannot overwrite or expire a new login',
    async (status) => {
      const pending = deferred();
      const { persistAuthSession } = await import('./authSession');
      persistAuthSession({ access: 'old', refresh: 'old-refresh' });
      const { setNavigate } = await import('./navigationService');
      const navigate = vi.fn();
      setNavigate(navigate);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({ status: 401 }).mockReturnValueOnce(pending.promise),
      );
      const { apiFetch } = await import('./requestClient');
      const request = apiFetch('/api/private/');
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      persistAuthSession({ access: 'new-user', refresh: 'new-user-refresh' });
      pending.resolve({
        status,
        ok: status === 200,
        json: async () => ({ access: 'late', refresh: 'late-refresh' }),
      });
      await request;
      expect(sessionStorage.getItem('accessToken')).toBe('new-user');
      expect(sessionStorage.getItem('refreshToken')).toBe('new-user-refresh');
      expect(navigate).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  test('a late protected 401 cannot refresh or clear a newer login', async () => {
    const pending = deferred();
    const { persistAuthSession } = await import('./authSession');
    persistAuthSession({ access: 'old', refresh: 'old-refresh' });
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(pending.promise));
    const { apiFetch } = await import('./requestClient');
    const request = apiFetch('/api/private/');
    persistAuthSession({ access: 'new-user', refresh: 'new-refresh' });
    pending.resolve({ status: 401 });
    await request;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('accessToken')).toBe('new-user');
  });

  test.each(['/api/private/', '/auth/mcp/connections/'])(
    'a second 401 from %s expires the session and preserves pending consent',
    async (path) => {
      const pendingPath = '/connections/authorize?state=keep%26this';
      window.history.replaceState({}, '', pendingPath);
      const { persistAuthSession } = await import('./authSession');
      persistAuthSession({ access: 'old', refresh: 'old-refresh' });
      const { setNavigate } = await import('./navigationService');
      const navigate = vi.fn();
      setNavigate(navigate);
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({ status: 401 })
          .mockResolvedValueOnce({ ok: true, json: async () => ({ access: 'fresh' }) })
          .mockResolvedValueOnce({ status: 401 }),
      );
      const { apiFetch } = await import('./requestClient');
      await apiFetch(path);
      expect(sessionStorage.getItem('accessToken')).toBeNull();
      expect(navigate).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(pendingPath)}`, {
        replace: true,
      });
      expect(fetch).toHaveBeenCalledTimes(3);
    },
  );

  test('concurrent requests share one refresh and retry with the rotated token', async () => {
    const pending = deferred();
    const { persistAuthSession } = await import('./authSession');
    persistAuthSession({ access: 'old', refresh: 'old-refresh' });
    vi.stubGlobal(
      'fetch',
      vi.fn((url, options) => {
        if (url === '/auth/refresh/') return pending.promise;
        return Promise.resolve(
          options.headers.Authorization === 'Bearer fresh'
            ? { ok: true, status: 200 }
            : { status: 401 },
        );
      }),
    );
    const { apiFetch } = await import('./requestClient');
    const first = apiFetch('/api/one/');
    const second = apiFetch('/api/two/');
    await vi.waitFor(() =>
      expect(fetch.mock.calls.filter(([url]) => url === '/auth/refresh/')).toHaveLength(1),
    );
    pending.resolve({
      ok: true,
      json: async () => ({ access: 'fresh', refresh: 'rotated-refresh' }),
    });
    const results = await Promise.all([first, second]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(sessionStorage.getItem('refreshToken')).toBe('rotated-refresh');
    expect(fetch.mock.calls.filter(([url]) => url === '/auth/refresh/')).toHaveLength(1);
  });
  test('a new login starts its own refresh while the prior session is still pending', async () => {
    const oldRefresh = deferred();
    const newRefresh = deferred();
    const { persistAuthSession } = await import('./authSession');
    persistAuthSession({ access: 'old', refresh: 'old-refresh' });
    vi.stubGlobal(
      'fetch',
      vi.fn((url, options) => {
        if (url === '/auth/refresh/') {
          return JSON.parse(options.body).refresh === 'old-refresh'
            ? oldRefresh.promise
            : newRefresh.promise;
        }
        return Promise.resolve(
          options.headers.Authorization === 'Bearer fresh-new-user'
            ? { status: 200, ok: true }
            : { status: 401 },
        );
      }),
    );
    const { apiFetch } = await import('./requestClient');
    const first = apiFetch('/api/old/');
    await vi.waitFor(() =>
      expect(fetch.mock.calls.filter(([url]) => url === '/auth/refresh/')).toHaveLength(1),
    );
    persistAuthSession({ access: 'new-user', refresh: 'new-refresh' });
    const second = apiFetch('/api/new/');
    await vi.waitFor(() =>
      expect(fetch.mock.calls.filter(([url]) => url === '/auth/refresh/')).toHaveLength(2),
    );
    oldRefresh.resolve({ ok: true, json: async () => ({ access: 'late-old-user' }) });
    await first;
    expect(sessionStorage.getItem('accessToken')).toBe('new-user');
    newRefresh.resolve({ ok: true, json: async () => ({ access: 'fresh-new-user' }) });
    expect((await second).ok).toBe(true);
    expect(sessionStorage.getItem('accessToken')).toBe('fresh-new-user');
  });
});

describe('reactive session ownership', () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/private');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  test('a foreign explicit Authorization 401 cannot refresh or expire the current user', async () => {
    const { startSession, getSessionSnapshot } = await import('./sessionState');
    startSession({ access: 'current', refresh: 'current-refresh' });
    const session = getSessionSnapshot();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401 }));
    const { apiFetch } = await import('./requestClient');
    await apiFetch('/api/private/', { headers: { Authorization: 'Bearer another-account' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer another-account');
    expect(getSessionSnapshot()).toBe(session);
  });
  test.each(['logout', 'expiry'])(
    '%s queues feedback before publishing the anonymous session',
    async (action) => {
      const { startSession, getSessionSnapshot, subscribeSession } = await import('./sessionState');
      startSession({ access: 'current', refresh: 'refresh' });
      const { setNavigate } = await import('./navigationService');
      setNavigate(vi.fn());
      const messages = [];
      const unsubscribe = subscribeSession(() => {
        if (!getSessionSnapshot().accessToken)
          messages.push(JSON.parse(sessionStorage.getItem('pendingSnackbar')));
      });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401 }));
      const { apiFetch, logout } = await import('./requestClient');
      if (action === 'logout') logout();
      else await apiFetch('/api/private/');
      expect(messages).toEqual([
        expect.objectContaining({
          message:
            action === 'logout'
              ? 'Logout Successful :)'
              : 'Your session expired. Please log in again.',
        }),
      ]);
      unsubscribe();
    },
  );
});
