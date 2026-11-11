import { test, expect } from '@playwright/test';

const journeys = [
  { from: '/login', name: 'Forgot Password?', to: '/forgot-password', tabs: 4 },
  { from: '/login', name: 'Create Account!', to: '/register', tabs: 5 },
  { from: '/register', name: 'Sign in now!', to: '/login', tabs: 6 },
  { from: '/forgot-password', name: 'Back to Login', to: '/login', tabs: 3 },
  { from: '/reset-password?uid=test&token=test', name: 'Login', to: '/login', tabs: 4 },
];

for (const { from, name, to, tabs } of journeys) {
  test(`${from} → ${to}: keyboard and new-tab navigation`, async ({ page, context }) => {
    const submissions = [];
    page.on('request', (request) => {
      if (request.method() === 'POST') submissions.push(request.url());
    });
    await page.goto(from);
    const link = page.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', to);
    // A native modified click must open the destination without navigating this form.
    const newPagePromise = context.waitForEvent('page');
    await link.click({ modifiers: ['ControlOrMeta'] });
    const other = await newPagePromise;
    await other.waitForLoadState();
    await expect(other).toHaveURL(new RegExp(`${to}$`));
    await expect(other.getByLabel('Email', { exact: true })).toBeVisible();
    await other.close();
    await expect(page).toHaveURL(new RegExp(from.replace('?', '\\?') + '$'));
    await page.reload();
    for (let i = 0; i < tabs; i += 1) await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${to}$`));
    expect(submissions).toEqual([]);
  });
}
