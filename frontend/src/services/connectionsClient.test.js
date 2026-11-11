import { apiFetch } from './requestClient';
import { decideConsent, loadConsent, loadConnections, revokeConnection } from './connectionsClient';
vi.mock('./requestClient', () => ({
  apiFetch: vi.fn(),
}));
beforeEach(() => {
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
  [{ access: 'PRIVATE-ACCESS', refresh: 'PRIVATE-REFRESH', ticket: 'PRIVATE-TICKET' }, 'HTTP 400'],
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
