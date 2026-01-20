const originalEnv = process.env;

describe('client apiFetch', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('when no base url is provided, it uses the default', async () => {
    delete process.env.REACT_APP_API_BASE_URL;
    const { apiFetch } = await import('./client');

    await apiFetch('/api/test');

    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/api/test', {});
  });

  test('when a base url is provided, it prefixes requests', async () => {
    process.env.REACT_APP_API_BASE_URL = 'https://example.com';
    const { apiFetch } = await import('./client');

    await apiFetch('/api/test', { method: 'GET' });

    expect(global.fetch).toHaveBeenCalledWith('https://example.com/api/test', { method: 'GET' });
  });
});
