describe('connectionsClient request contract', () => {
  let apiFetch;
  let loadActionApproval;
  let decideActionApproval;
  let decideConsent;
  let loadConsent;
  let loadConnections;
  let revokeConnection;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('./requestClient', () => ({ apiFetch: vi.fn() }));
    ({ apiFetch } = await import('./requestClient'));
    ({
      loadActionApproval,
      decideActionApproval,
      decideConsent,
      loadConsent,
      loadConnections,
      revokeConnection,
    } = await import('./connectionsClient'));
    vi.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem('accessToken', 'JWT');
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ticket: 'TICKET',
      }),
    });
  });
  test('consent uses an explicit JWT header, JSON response, no cookies and an exact return request', async () => {
    const query = '?state=x%26y&resource=https%3A%2F%2Fnotoli.example%2Fmcp';
    await loadConsent(query);
    expect(apiFetch).toHaveBeenCalledWith(`/auth/mcp/authorize/${query}`, {
      method: 'GET',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer JWT',
      },
      authReturnTo: `/connections/authorize${query}`,
    });
  });
  test('the consent write submits only the signed ticket and decision', async () => {
    await decideConsent('TICKET+SECRET', 'allow', '?state=state');
    const [path, options] = apiFetch.mock.calls[0];
    expect(path).toBe('/auth/mcp/authorize/');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('omit');
    expect(new URLSearchParams(options.body).get('ticket')).toBe('TICKET+SECRET');
    expect(new URLSearchParams(options.body).get('decision')).toBe('allow');
    expect(options.authReturnTo).toBe('/connections/authorize?state=state');
  });
  test('connection management reads and revokes with the current JWT', async () => {
    await loadConnections();
    sessionStorage.setItem('accessToken', 'ROTATED');
    await revokeConnection(123);
    expect(apiFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer ROTATED');
    expect(apiFetch.mock.calls[1][1].body).toBe('application_id=123');
  });
  test('backend errors are shown without treating them as successful responses', async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      json: async () => ({
        error_description: 'Invalid callback.',
      }),
    });
    await expect(loadConsent('?invalid')).rejects.toThrow('Invalid callback.');
  });

  const operations = [
    ['load action', () => loadActionApproval('ref', '?approval_id=ref')],
    ['decide action', () => decideActionApproval('SIGNED', 'allow', '?approval_id=ref')],
    ['load consent', () => loadConsent('?state=original')],
    ['decide consent', () => decideConsent('SIGNED-TICKET', 'allow', '?state=original')],
    ['list connections', () => loadConnections()],
    ['revoke connection', () => revokeConnection(123)],
  ];

  // Parse actual response bodies so syntax failures exercise the shared safe reader.
  function mockResponse(status, body) {
    apiFetch.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => JSON.parse(body),
    });
  }

  describe.each(operations)('%s response handling', (_name, operation) => {
    test.each([
      [502, '<html>Bad Gateway: PRIVATE-PROXY-DATA</html>'],
      [504, '<html>Gateway timeout: PRIVATE-PROXY-DATA</html>'],
      [503, 'Unavailable: PRIVATE-PROXY-DATA'],
      [500, ''],
      [400, '{"error_description":"PRIVATE-PARTIAL-DATA"'],
      [401, '<html>Unauthorized: PRIVATE-SESSION-DATA</html>'],
    ])('uses only HTTP %s for an unreadable error body', async (status, body) => {
      mockResponse(status, body);
      await expect(operation()).rejects.toEqual(new Error(`HTTP ${status}`));
    });

    test.each([
      ['<html>PRIVATE-SUCCESS-DATA</html>'],
      ['plaintext PRIVATE-SUCCESS-DATA'],
      [''],
      ['{"ticket":"PRIVATE-PARTIAL-TICKET"'],
      ['null'],
      ['false'],
      ['42'],
      ['"PRIVATE-JSON-STRING"'],
      ['[]'],
    ])('rejects an invalid success payload (%s) predictably', async (body) => {
      mockResponse(200, body);
      await expect(operation()).rejects.toEqual(new Error('Request failed.'));
    });
  });

  test.each([
    [
      { error_description: 'Invalid callback.', detail: 'Detail', error: 'invalid_request' },
      'Invalid callback.',
    ],
    [{ detail: 'Session expired.', error: 'invalid_token' }, 'Session expired.'],
    [{ error: 'invalid_consent' }, 'invalid_consent'],
    [{ error_description: {}, detail: 'Useful detail.' }, 'Useful detail.'],
    [{ error_description: ' ', detail: [], error: false }, 'HTTP 400'],
    [
      { access: 'PRIVATE-ACCESS', refresh: 'PRIVATE-REFRESH', ticket: 'PRIVATE-TICKET' },
      'HTTP 400',
    ],
    [{ error: { token: 'PRIVATE-TOKEN' } }, 'HTTP 400'],
    [null, 'HTTP 400'],
    ['PRIVATE-JSON-STRING', 'HTTP 400'],
  ])(
    'preserves documented string errors without exposing unrelated data (%j)',
    async (data, expected) => {
      mockResponse(400, JSON.stringify(data));
      await expect(loadConsent('?invalid')).rejects.toEqual(new Error(expected));
    },
  );

  test.each([
    ['consent', () => loadConsent('?state=x'), { ticket: 'SIGNED-TICKET', permissions: [] }],
    [
      'decision',
      () => decideConsent('SIGNED-TICKET', 'cancel', '?state=x'),
      { redirect_url: 'https://callback.example/?error=access_denied&state=x' },
    ],
    ['listing', () => loadConnections(), { applications: [] }],
    ['revocation', () => revokeConnection(123), { revoked: true }],
  ])('returns the valid JSON %s result', async (_name, operation, data) => {
    mockResponse(200, JSON.stringify(data));
    await expect(operation()).resolves.toEqual(data);
  });

  test('action approval uses JWT-only requests, encoded opaque references and signed decisions', async () => {
    await loadActionApproval('ref&injected=1', '?approval_id=ref');
    expect(apiFetch.mock.calls[0][0]).toBe(
      '/auth/mcp/action-approval/?approval_id=ref%26injected%3D1',
    );
    expect(apiFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer JWT');
    expect(apiFetch.mock.calls[0][1].credentials).toBe('omit');
    await decideActionApproval('SIGNED+ACTION', 'allow', '?approval_id=ref');
    const [path, options] = apiFetch.mock.calls[1];
    expect(path).toBe('/auth/mcp/action-approval/');
    expect(options.authReturnTo).toBe('/connections/authorize?approval_id=ref');
    expect(options.credentials).toBe('omit');
    expect(Object.fromEntries(new URLSearchParams(options.body))).toEqual({
      ticket: 'SIGNED+ACTION',
      decision: 'allow',
    });
  });

  afterEach(() => vi.doUnmock('./requestClient'));
});

describe('connectionsClient with JWT recovery', () => {
  // Exercise the real request client: parsing must not interfere with JWT recovery.
  beforeEach(() => {
    vi.doUnmock('./requestClient');
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('VITE_API_BASE_URL', '');
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

  test('action approval JWT recovery preserves the signed decision and sends no cookies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(401, '<html>Expired access</html>'))
      .mockResolvedValueOnce(response(200, '{"access":"NEW-ACCESS"}'))
      .mockResolvedValueOnce(
        response(200, '{"approval":{"status":"approved"},"ticket":"SIGNED-APPROVED"}'),
      )
      .mockResolvedValueOnce(response(200, '{"approval":{"status":"cancelled"}}'));
    vi.stubGlobal('fetch', fetchMock);
    const { decideActionApproval } = await import('./connectionsClient');
    const approved = await decideActionApproval('SIGNED-ACTION', 'allow', '?approval_id=ref');
    expect(approved).toEqual({ approval: { status: 'approved' }, ticket: 'SIGNED-APPROVED' });
    await expect(
      decideActionApproval(approved.ticket, 'cancel', '?approval_id=ref'),
    ).resolves.toEqual({ approval: { status: 'cancelled' } });
    expect(fetchMock.mock.calls[3][1].body).toBe('ticket=SIGNED-APPROVED&decision=cancel');
    const [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe('/auth/mcp/action-approval/');
    expect(options.headers.Authorization).toBe('Bearer NEW-ACCESS');
    expect(options.credentials).toBe('omit');
    expect(options.body).toBe('ticket=SIGNED-ACTION&decision=allow');
  });
});
