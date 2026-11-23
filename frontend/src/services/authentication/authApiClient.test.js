// @vitest-environment node

import { login, register, forgotPassword, resetPassword } from './authApiClient';
import { apiFetch } from '../http/requestClient';
vi.mock('../http/requestClient', () => ({
  apiFetch: vi.fn(),
}));
describe('authApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue(Response.json({ id: 1 }));
  });
  test('when login uses email, it posts the email payload', async () => {
    await login({
      email: 'user@example.com',
      password: 'secret',
    });
    expect(apiFetch).toHaveBeenCalledWith('/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
    });
    const [, options] = apiFetch.mock.calls[0];
    await expect(JSON.parse(options.body)).toEqual({
      email: 'user@example.com',
      password: 'secret',
    });
  });
  test('when login uses username, it posts the username payload', async () => {
    await login({
      username: 'user1',
      password: 'secret',
    });
    expect(apiFetch).toHaveBeenCalledWith('/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
    });
    const [, options] = apiFetch.mock.calls[0];
    await expect(JSON.parse(options.body)).toEqual({
      username: 'user1',
      password: 'secret',
    });
  });
  test('when login includes email and username, it prefers email', async () => {
    await login({
      email: 'user@example.com',
      username: 'user1',
      password: 'secret',
    });
    const [, options] = apiFetch.mock.calls[0];
    await expect(JSON.parse(options.body)).toEqual({
      email: 'user@example.com',
      password: 'secret',
    });
  });
  test('when register trims inputs, it posts trimmed values', async () => {
    await register({
      email: ' user@example.com ',
      username: ' user1 ',
      password: 'secret',
    });
    expect(apiFetch).toHaveBeenCalledWith('/auth/register/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
    });
    const [, options] = apiFetch.mock.calls[0];
    await expect(JSON.parse(options.body)).toEqual({
      email: 'user@example.com',
      username: 'user1',
      password: 'secret',
    });
  });
  test('when register has blank username, it omits the username', async () => {
    await register({
      email: 'user@example.com',
      username: '   ',
      password: 'secret',
    });
    expect(apiFetch).toHaveBeenCalledWith('/auth/register/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
    });
    const [, options] = apiFetch.mock.calls[0];
    await expect(JSON.parse(options.body)).toEqual({
      email: 'user@example.com',
      password: 'secret',
    });
  });
  test('when forgotPassword is called, it posts trimmed email', async () => {
    await forgotPassword({
      email: ' user@example.com ',
    });
    expect(apiFetch).toHaveBeenCalledWith('/auth/forgot-password/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'user@example.com',
      }),
    });
  });
  test('when resetPassword is called, it posts uid/token/password', async () => {
    await resetPassword({
      uid: 'abc',
      token: 'tok',
      password: 'secret',
    });
    expect(apiFetch).toHaveBeenCalledWith('/auth/reset-password/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uid: 'abc',
        token: 'tok',
        password: 'secret',
      }),
    });
  });
});
