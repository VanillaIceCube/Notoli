import { connectionReturnTo, loginPath } from './authRedirect';

test('pending consent is preserved without decoding its query', () => {
  const pending =
    '/connections/authorize?state=a%26b%3D%3F&resource=https%3A%2F%2Fnotoli.example%2Fmcp';
  expect(connectionReturnTo(pending)).toBe(pending);
  expect(new URLSearchParams(loginPath(pending).split('?')[1]).get('next')).toBe(pending);
});

test.each([
  'https://attacker.example/connections',
  '//attacker.example/connections',
  '/\\attacker.example/connections',
  '/login',
  '/board/1',
  'data:text/html,example',
  null,
])('external or unsupported return destinations fall back to ordinary login: %s', (path) => {
  expect(connectionReturnTo(path)).toBeNull();
  expect(loginPath(path)).toBe('/login');
});
