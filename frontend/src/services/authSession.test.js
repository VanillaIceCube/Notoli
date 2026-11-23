import {
  getResponseErrorMessage,
  isAuthNetworkError,
  readOkJson,
  safeReadJson,
} from './authSession';
function makeResponse({ ok, status = 200, json }) {
  return {
    ok,
    status,
    json,
  };
}
describe('authSession', () => {
  test('recognizes browser network failures by type or message', () => {
    expect(isAuthNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isAuthNetworkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(
      true,
    );
  });

  test('distinguishes validation errors and values without a string message', () => {
    expect(isAuthNetworkError(new Error('Invalid email or password.'))).toBe(false);
    expect(isAuthNetworkError({ message: 400 })).toBe(false);
    expect(isAuthNetworkError(null)).toBe(false);
  });

  test('handles non_field_errors and field array errors', async () => {
    const nonField = makeResponse({
      ok: false,
      status: 400,
      json: async () => ({ non_field_errors: ['Invalid credentials.'] }),
    });
    await expect(getResponseErrorMessage(nonField, 'fallback')).resolves.toBe(
      'Invalid credentials.',
    );

    const fieldErr = makeResponse({
      ok: false,
      status: 400,
      json: async () => ({ email: ['This field is required.'] }),
    });
    await expect(getResponseErrorMessage(fieldErr, 'fallback')).resolves.toBe(
      'This field is required.',
    );
  });

  describe('safeReadJson', () => {
    test('returns parsed json on success', async () => {
      const response = makeResponse({ ok: true, json: async () => ({ foo: 'bar' }) });
      await expect(safeReadJson(response)).resolves.toEqual({ foo: 'bar' });
    });

    test('returns null when json parsing fails', async () => {
      const response = makeResponse({
        ok: false,
        json: async () => {
          throw new Error('bad json');
        },
      });
      await expect(safeReadJson(response)).resolves.toBeNull();
    });
  });

  test('when response json is an array of error strings, it extracts the first string', async () => {
    const response = makeResponse({
      ok: false,
      status: 400,
      json: async () => ['Accepted proposals cannot be deleted.'],
    });

    await expect(getResponseErrorMessage(response, 'fallback')).resolves.toBe(
      'Accepted proposals cannot be deleted.',
    );
  });

  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });
  describe('getResponseErrorMessage', () => {
    test('when response json includes error, it returns error', async () => {
      const response = makeResponse({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Email already exists.',
        }),
      });
      await expect(getResponseErrorMessage(response, 'fallback')).resolves.toBe(
        'Email already exists.',
      );
    });
    test('when response json includes detail, it returns detail', async () => {
      const response = makeResponse({
        ok: false,
        status: 401,
        json: async () => ({
          detail: 'Invalid credentials',
        }),
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
        json: async () => ({
          error: 'Email already exists.',
        }),
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
        json: async () => ({
          access: 'A',
          refresh: 'R',
        }),
      });
      await expect(readOkJson(response, 'fallback')).resolves.toEqual({
        access: 'A',
        refresh: 'R',
      });
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
  test('extracts nested password validation errors without stringifying arrays', async () => {
    const response = {
      json: async () => ({
        password: ['This password is too common.'],
      }),
    };
    await expect(getResponseErrorMessage(response, 'fallback')).resolves.toBe(
      'This password is too common.',
    );
  });
});
