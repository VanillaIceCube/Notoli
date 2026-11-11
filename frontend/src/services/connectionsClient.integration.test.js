// Exercise the real request client: parsing must not interfere with JWT recovery.
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', '');
  vi.stubEnv('REACT_APP_API_BASE_URL', '');
  sessionStorage.clear();
  sessionStorage.setItem('accessToken', 'OLD-ACCESS');
  sessionStorage.setItem('refreshToken', 'REFRESH');
  window.history.replaceState({}, '', '/connections');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function response(status, body) {
  return { ok: status < 300, status, json: async () => JSON.parse(body) };
}

test('refresh retries consent with the rotated JWT, same request and no cookies', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response(401, '<html>Expired access</html>'))
    .mockResolvedValueOnce(response(200, '{"access":"NEW-ACCESS"}'))
    .mockResolvedValueOnce(response(200, '{"ticket":"SIGNED-TICKET"}'));
  vi.stubGlobal('fetch', fetchMock);
  const { loadConsent } = await import('./connectionsClient');
  const query = '?state=a%26b&resource=https%3A%2F%2Fapp.example%2Fmcp';

  await expect(loadConsent(query)).resolves.toEqual({ ticket: 'SIGNED-TICKET' });
  const [url, options] = fetchMock.mock.calls[2];
  expect(url).toBe(`/auth/mcp/authorize/${query}`);
  expect(options.credentials).toBe('omit');
  expect(options.headers.Authorization).toBe('Bearer NEW-ACCESS');
  expect(sessionStorage.getItem('accessToken')).toBe('NEW-ACCESS');
});

test('an expired session clears tokens and preserves the exact consent return path', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(401, '<html>PRIVATE-SESSION-DATA</html>'))
      .mockResolvedValueOnce(response(401, '<html>PRIVATE-REFRESH-DATA</html>')),
  );
  const { setNavigate } = await import('./navigationService');
  const navigate = vi.fn();
  setNavigate(navigate);
  const { loadConsent } = await import('./connectionsClient');
  const returnTo = '/connections/authorize?state=a%26b';

  await expect(loadConsent('?state=a%26b')).rejects.toEqual(new Error('HTTP 401'));
  expect(sessionStorage.getItem('accessToken')).toBeNull();
  expect(sessionStorage.getItem('refreshToken')).toBeNull();
  expect(navigate).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(returnTo)}`, {
    replace: true,
  });
  expect(JSON.parse(sessionStorage.getItem('pendingSnackbar')).message).toBe(
    'Your session expired. Please log in again.',
  );
});

test('a transient non-JSON refresh failure retains the session and reports HTTP 401', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(401, '<html>Expired access</html>'))
      .mockResolvedValueOnce(response(502, '<html>PRIVATE-PROXY-DATA</html>')),
  );
  const { loadConnections } = await import('./connectionsClient');

  await expect(loadConnections()).rejects.toEqual(new Error('HTTP 401'));
  expect(sessionStorage.getItem('accessToken')).toBe('OLD-ACCESS');
  expect(sessionStorage.getItem('refreshToken')).toBe('REFRESH');
});
