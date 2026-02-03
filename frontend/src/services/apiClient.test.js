const originalEnv = process.env;

describe('apiClient', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('when REACT_APP_API_BASE_URL is set, it prefixes the base URL', async () => {
    process.env.REACT_APP_API_BASE_URL = 'https://api.example.com';
    const { apiFetch } = await import('./apiClient');

    await apiFetch('/path', { method: 'GET' });

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/path', { method: 'GET' });
  });

  test('when REACT_APP_API_BASE_URL is not set, it uses the default base URL', async () => {
    delete process.env.REACT_APP_API_BASE_URL;
    const { apiFetch } = await import('./apiClient');

    await apiFetch('/path', { method: 'GET' });

    expect(global.fetch).toHaveBeenCalledWith('/apps/notoli/path', { method: 'GET' });
  });

  test('when options are provided, it passes them through unchanged', async () => {
    const options = {
      method: 'POST',
      headers: { 'X-Test': 'ok' },
      body: JSON.stringify({ ok: true }),
    };
    delete process.env.REACT_APP_API_BASE_URL;
    const { apiFetch } = await import('./apiClient');

    await apiFetch('/path', options);

    expect(global.fetch).toHaveBeenCalledWith('/apps/notoli/path', options);
  });
});
