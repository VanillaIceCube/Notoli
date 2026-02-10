import { getResponseErrorMessage, persistAuthSession, readOkJson } from './authSession';

function makeResponse({ ok, status = 200, json }) {
  return { ok, status, json };
}

describe('authSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
    jest.restoreAllMocks();
  });

  describe('getResponseErrorMessage', () => {
    test('when response json includes error, it returns error', async () => {
      const response = makeResponse({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Email already exists.' }),
      });

      await expect(getResponseErrorMessage(response, 'fallback')).resolves.toBe(
        'Email already exists.',
      );
    });

    test('when response json includes detail, it returns detail', async () => {
      const response = makeResponse({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Invalid credentials' }),
      });

      await expect(getResponseErrorMessage(response, 'fallback')).resolves.toBe(
        'Invalid credentials',
      );
    });

    test('when response json cannot be read, it returns fallback', async () => {
      const response = makeResponse({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('bad json');
        },
      });

      await expect(getResponseErrorMessage(response, 'fallback')).resolves.toBe('fallback');
    });
  });

  describe('readOkJson', () => {
    test('when response is not ok, it throws the best server message', async () => {
      const response = makeResponse({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Email already exists.' }),
      });

      await expect(readOkJson(response, 'fallback')).rejects.toThrow('Email already exists.');
    });

    test('when response is not ok and body has no message, it throws HTTP <status>', async () => {
      const response = makeResponse({
        ok: false,
        status: 403,
        json: async () => ({}),
      });

      await expect(readOkJson(response, 'fallback')).rejects.toThrow('HTTP 403');
    });

    test('when response is ok, it returns parsed json', async () => {
      const response = makeResponse({
        ok: true,
        status: 200,
        json: async () => ({ access: 'A', refresh: 'R' }),
      });

      await expect(readOkJson(response, 'fallback')).resolves.toEqual({ access: 'A', refresh: 'R' });
    });

    test('when response is ok but json is null, it throws fallbackMessage', async () => {
      const response = makeResponse({
        ok: true,
        status: 200,
        json: async () => null,
      });

      await expect(readOkJson(response, 'fallbackMessage')).rejects.toThrow('fallbackMessage');
    });

    test('when response is ok but json throws, it throws fallbackMessage', async () => {
      const response = makeResponse({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('bad json');
        },
      });

      await expect(readOkJson(response, 'fallbackMessage')).rejects.toThrow('fallbackMessage');
    });
  });

  describe('persistAuthSession', () => {
    test('when tokens are missing, it throws', () => {
      expect(() => persistAuthSession({})).toThrow('Auth response missing tokens.');
      expect(() => persistAuthSession({ access: 'A' })).toThrow('Auth response missing tokens.');
      expect(() => persistAuthSession({ refresh: 'R' })).toThrow('Auth response missing tokens.');
    });

    test('when tokens are present, it stores them', () => {
      persistAuthSession({ access: 'A', refresh: 'R' });

      expect(sessionStorage.getItem('accessToken')).toBe('A');
      expect(sessionStorage.getItem('refreshToken')).toBe('R');
    });

    test('when profile fields are present, it stores them', () => {
      persistAuthSession({ access: 'A', refresh: 'R', username: 'u', email: 'e@example.com' });

      expect(sessionStorage.getItem('username')).toBe('u');
      expect(sessionStorage.getItem('email')).toBe('e@example.com');
    });

    test('when username/email are missing, it does not store "undefined"', () => {
      persistAuthSession({ access: 'A', refresh: 'R', username: undefined, email: undefined });

      expect(sessionStorage.getItem('username')).toBeNull();
      expect(sessionStorage.getItem('email')).toBeNull();
    });

    test('when sessionStorage throws, it does not throw', () => {
      const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      expect(() =>
        persistAuthSession({ access: 'A', refresh: 'R', username: 'u', email: 'e@example.com' }),
      ).not.toThrow();

      setItem.mockRestore();
    });
  });
});

