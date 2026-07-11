const originalEnv = process.env;

describe('requestClient', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200 }));
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('when REACT_APP_API_BASE_URL is set, it prefixes the base URL', async () => {
    process.env.REACT_APP_API_BASE_URL = 'https://api.example.com';
    const { apiFetch } = await import('./requestClient');

    await apiFetch('/path', { method: 'GET' });

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/path', { method: 'GET' });
  });

  test('when REACT_APP_API_BASE_URL is blank, it uses same-origin relative URLs', async () => {
    process.env.REACT_APP_API_BASE_URL = '';
    const { apiFetch } = await import('./requestClient');

    await apiFetch('/api/boards/', { method: 'GET' });

    expect(global.fetch).toHaveBeenCalledWith('/api/boards/', { method: 'GET' });
  });

  test('when REACT_APP_API_BASE_URL is not set, it uses the default base URL', async () => {
    delete process.env.REACT_APP_API_BASE_URL;
    const { apiFetch } = await import('./requestClient');

    await apiFetch('/path', { method: 'GET' });

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/path', { method: 'GET' });
  });

  test('when options are provided, it passes them through unchanged', async () => {
    const options = {
      method: 'POST',
      headers: { 'X-Test': 'ok' },
      body: JSON.stringify({ ok: true }),
    };
    delete process.env.REACT_APP_API_BASE_URL;
    const { apiFetch } = await import('./requestClient');

    await apiFetch('/path', options);

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/path', options);
  });

  test('when a non-auth endpoint and refresh token are invalid, it clears tokens and redirects to /login', async () => {
    delete process.env.REACT_APP_API_BASE_URL;
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 401 }));

    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    window.history.replaceState({}, '', '/board/1');

    const { setNavigate } = await import('./navigationService');
    const mockNavigate = jest.fn();
    setNavigate(mockNavigate);

    const { apiFetch } = await import('./requestClient');

    await apiFetch('/api/boards/', { method: 'GET' });

    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('pendingSnackbar'))).toEqual({
      severity: 'error',
      message: 'Your session expired. Please log in again.',
    });
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  test('when an access token expires, it refreshes once and retries without logging out', async () => {
    delete process.env.REACT_APP_API_BASE_URL;
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access: 'NEW_ACCESS' }) })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');

    const { setNavigate } = await import('./navigationService');
    const mockNavigate = jest.fn();
    setNavigate(mockNavigate);
    const { apiFetch } = await import('./requestClient');

    const response = await apiFetch('/api/boards/', {
      headers: { Authorization: 'Bearer ACCESS' },
    });

    expect(response.ok).toBe(true);
    expect(sessionStorage.getItem('accessToken')).toBe('NEW_ACCESS');
    expect(sessionStorage.getItem('refreshToken')).toBe('REFRESH');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenLastCalledWith('http://localhost:8000/api/boards/', {
      headers: { Authorization: 'Bearer NEW_ACCESS' },
    });
  });

  test('when refresh has a transient failure, it preserves the session and returns the original response', async () => {
    delete process.env.REACT_APP_API_BASE_URL;
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    const { setNavigate } = await import('./navigationService');
    const mockNavigate = jest.fn();
    setNavigate(mockNavigate);
    const { apiFetch } = await import('./requestClient');

    const response = await apiFetch('/api/boards/');

    expect(response.status).toBe(401);
    expect(sessionStorage.getItem('accessToken')).toBe('ACCESS');
    expect(sessionStorage.getItem('refreshToken')).toBe('REFRESH');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('when /auth/login/ returns 401, it does not redirect or clear tokens', async () => {
    delete process.env.REACT_APP_API_BASE_URL;
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 401 }));

    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    window.history.replaceState({}, '', '/login');

    const { setNavigate } = await import('./navigationService');
    const mockNavigate = jest.fn();
    setNavigate(mockNavigate);

    const { apiFetch } = await import('./requestClient');

    await apiFetch('/auth/login/', { method: 'POST' });

    expect(sessionStorage.getItem('accessToken')).toBe('ACCESS');
    expect(sessionStorage.getItem('refreshToken')).toBe('REFRESH');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('when /auth/forgot-password/ returns 401, it does not redirect or clear tokens', async () => {
    delete process.env.REACT_APP_API_BASE_URL;
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 401 }));

    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');

    const { setNavigate } = await import('./navigationService');
    const mockNavigate = jest.fn();
    setNavigate(mockNavigate);

    const { apiFetch } = await import('./requestClient');

    await apiFetch('/auth/forgot-password/', { method: 'POST' });

    expect(sessionStorage.getItem('accessToken')).toBe('ACCESS');
    expect(sessionStorage.getItem('refreshToken')).toBe('REFRESH');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('when logout() is called, it clears tokens/profile and redirects to /login', async () => {
    delete process.env.REACT_APP_API_BASE_URL;

    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');
    sessionStorage.setItem('username', 'judea');
    sessionStorage.setItem('email', 'judea@example.com');
    window.history.replaceState({}, '', '/board/1');

    const { setNavigate } = await import('./navigationService');
    const mockNavigate = jest.fn();
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
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  test('when logout() is called before navigate is registered, it still redirects', async () => {
    delete process.env.REACT_APP_API_BASE_URL;
    sessionStorage.setItem('accessToken', 'ACCESS');
    sessionStorage.setItem('refreshToken', 'REFRESH');

    const originalLocation = window.location;
    const replaceSpy = jest.fn();
    delete window.location;
    window.location = { ...originalLocation, replace: replaceSpy };

    const { clearNavigate } = await import('./navigationService');
    clearNavigate();
    const { logout } = await import('./requestClient');

    expect(() => logout()).not.toThrow();
    expect(sessionStorage.getItem('accessToken')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    expect(replaceSpy).toHaveBeenCalled();

    window.location = originalLocation;
  });
});
