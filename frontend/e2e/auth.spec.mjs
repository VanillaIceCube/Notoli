import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const password = 'Disposable-Browser-Password-749!';
async function register(page) {
  const email = `e2e-${randomUUID()}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByLabel('user profile', { exact: true })).toBeVisible();
  return email;
}
async function logout(page) {
  await page.getByLabel('user profile', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
}
async function login(page, email, value = password) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

test('registration, persisted session, independent tab context and logout protect the existing route', async ({
  page,
  browser,
}) => {
  await register(page);
  const token = await page.evaluate(() => sessionStorage.getItem('accessToken'));
  expect(token).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel('user profile', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('accessToken'))).toBe(token);
  const independent = await browser.newContext();
  try {
    const other = await independent.newPage();
    await other.goto('http://127.0.0.1:3001/');
    await expect(other).toHaveURL(/\/login/);
  } finally {
    await independent.close();
  }
  await logout(page);
  expect(await page.evaluate(() => sessionStorage.getItem('accessToken'))).toBeNull();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('bad credentials and an expired session fail through the existing auth client', async ({
  page,
}) => {
  const email = await register(page);
  await logout(page);
  await login(page, email, 'incorrect-password');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('accessToken'))).toBeNull();
  await login(page, email);
  await expect(page.getByLabel('user profile', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    sessionStorage.setItem('accessToken', 'expired-fixture');
    sessionStorage.removeItem('refreshToken');
    const client = await import('/src/services/requestClient.js');
    await client.apiFetch('/api/notifications/');
  });
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => sessionStorage.getItem('accessToken'))).toBeNull();
});

test('password recovery uses local-only mail and validates reset tokens', async ({ page }) => {
  const email = await register(page);
  await logout(page);
  await page.goto('/forgot-password');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send Reset Link', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  const mail = path.join(process.env.E2E_STATE_DIR, 'emails');
  let message;
  await expect
    .poll(() => {
      message = fs
        .readdirSync(mail)
        .map((file) => fs.readFileSync(path.join(mail, file), 'utf8'))
        .find((text) => text.includes(email));
      return Boolean(message);
    })
    .toBe(true);
  const decoded = execFileSync(
    'python',
    [
      '-c',
      'from email import policy; from email.parser import Parser; import sys; mail=Parser(policy=policy.default).parsestr(sys.stdin.read()); body=mail.get_body(preferencelist=("plain",)); print(body.get_content() if body else mail.get_content())',
    ],
    { input: message, encoding: 'utf8' },
  );
  const link = decoded.match(/http:\/\/127\.0\.0\.1:3001\/reset-password\?[^\s<>]+/)?.[0];
  expect(link).toBeTruthy();
  const changed = 'Changed-Disposable-Password-832!';
  await page.goto(link);
  await page.getByLabel('New Password', { exact: true }).fill(changed);
  await page.getByLabel('Confirm Password', { exact: true }).fill(changed);
  await page.getByRole('button', { name: 'Reset Password', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, email, changed);
  await expect(page.getByLabel('user profile', { exact: true })).toBeVisible();
  await logout(page);
  await page.goto('/reset-password?uid=invalid&token=invalid');
  await page.getByLabel('New Password', { exact: true }).fill(changed);
  await page.getByLabel('Confirm Password', { exact: true }).fill(changed);
  await page.getByRole('button', { name: 'Reset Password', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});
