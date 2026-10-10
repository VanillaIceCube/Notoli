import { apiFetch } from './requestClient';
import { decideConsent, loadConsent, loadConnections, revokeConnection } from './connectionsClient';

jest.mock('./requestClient', () => ({ apiFetch: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem('accessToken', 'JWT');
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ ticket: 'TICKET' }) });
});

test('consent uses an explicit JWT header, JSON response, no cookies and an exact return request', async () => {
  const query = '?state=x%26y&resource=https%3A%2F%2Fnotoli.example%2Fmcp';
  await loadConsent(query);
  expect(apiFetch).toHaveBeenCalledWith(`/auth/mcp/authorize/${query}`, {
    method: 'GET',
    credentials: 'omit',
    headers: { Accept: 'application/json', Authorization: 'Bearer JWT' },
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
    json: async () => ({ error_description: 'Invalid callback.' }),
  });
  await expect(loadConsent('?invalid')).rejects.toThrow('Invalid callback.');
});
