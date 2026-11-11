import { test, expect } from '@playwright/test';

const renderErrors = new WeakMap();

test.beforeEach(async ({ page, hasTouch, browserName }) => {
  const errors = [];
  renderErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /maximum update depth|too many re-renders/i.test(message.text())
    ) {
      errors.push(message.text());
    }
  });
  if (hasTouch && browserName === 'webkit') {
    // Windows WebKit reports zero even with Playwright's hasTouch emulation.
    // Supply the mobile capability for these layout/gesture fixtures only.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 1 });
    });
  }
});

test.afterEach(({ page }) => {
  expect(
    renderErrors.get(page),
    'page interactions must not cause render loops or uncaught errors',
  ).toEqual([]);
});

// Synthetic authenticated API responses keep this visual journey read-only. The
// same fixtures can exercise a deployed immutable frontend without customer data.
async function fixture(page) {
  const board = {
    id: 901,
    name: 'Visual board',
    owner: 1,
    owner_details: { id: 1, username: 'visual-owner', email: 'visual@example.test' },
    collaborators_details: [],
  };
  const list = { id: 902, board: 901, name: 'Visual list' };
  const notes = [
    { id: 903, list: 902, note: 'Visual task', status: 'Not Started' },
    { id: 904, list: 902, note: 'Second task', status: 'Complete' },
  ];
  await page.addInitScript(() => {
    sessionStorage.setItem('accessToken', 'synthetic-visual-session');
    sessionStorage.setItem('username', 'visual-owner');
    sessionStorage.setItem('email', 'visual@example.test');
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.includes('/notifications')
      ? []
      : url.pathname === '/api/boards/'
        ? [board]
        : url.pathname.startsWith('/api/boards/')
          ? board
          : url.pathname === '/api/lists/'
            ? [list]
            : url.pathname.startsWith('/api/lists/')
              ? list
              : notes;
    await route.fulfill({ json: body });
  });
  await page.goto('/board/901/list/902');
  await expect(page.getByText('Visual task', { exact: true })).toBeVisible();
}

for (const mobile of [false, true]) {
  test.describe(mobile ? 'mobile' : 'desktop', () => {
    test.use({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      hasTouch: mobile,
    });
    test('board menu exits as one surface, restores focus and reopens; task actions work', async ({
      page,
    }) => {
      await fixture(page);
      await page.getByRole('button', { name: 'menu', exact: true }).click();
      await page.getByRole('button', { name: 'Board Visual board', exact: true }).click();
      const trigger = page.getByRole('button', { name: 'Board actions for Visual board' });
      for (const method of ['escape', 'outside', 'escape']) {
        await trigger.click();
        const menu = page.getByRole('menu');
        await expect(menu.getByRole('menuitem')).toHaveCount(3);
        await menu.evaluate((element) => {
          window.menuExitCounts = [];
          const sample = () => {
            if (!element.isConnected) return;
            window.menuExitCounts.push(element.querySelectorAll('[role="menuitem"]').length);
            requestAnimationFrame(sample);
          };
          sample();
        });
        if (method === 'escape') await page.keyboard.press('Escape');
        else await page.mouse.click(4, 200);
        await expect(menu).toHaveCount(0);
        expect(await page.evaluate(() => window.menuExitCounts.every((count) => count === 3))).toBe(
          true,
        );
        await expect(trigger).toBeFocused();
      }
      await trigger.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('textbox')).toHaveValue('Visual board');
      await page.keyboard.press('Escape');
      await page.mouse.click(4, 200);
      const taskTrigger = page.getByRole('button', { name: 'Note actions for Visual task' });
      await taskTrigger.click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(taskTrigger).toBeFocused();
      await taskTrigger.click();
      await page.getByRole('menuitem', { name: 'Rename' }).click();
      await expect(page.getByRole('textbox')).toHaveValue('Visual task');
    });
  });
}

for (const colorScheme of ['light', 'dark']) {
  test.describe(`pull refresh ${colorScheme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme });
    test('one proportional displacement, pending/success/failure/cancel and normal scrolling', async ({
      page,
    }) => {
      await fixture(page);
      const title = page.getByTestId('notepad-page-title');
      const originalY = (await title.boundingBox()).y;
      const pull = async (end) => {
        await title.dispatchEvent('touchstart', {
          touches: [{ identifier: 1, clientX: 150, clientY: 150 }],
        });
        await title.dispatchEvent('touchmove', {
          touches: [{ identifier: 1, clientX: 150, clientY: 240 }],
        });
        await expect(page.getByRole('status', { name: 'Release to refresh' })).toBeVisible();
        const offset = (await title.boundingBox()).y - originalY;
        expect(offset).toBeGreaterThan(30);
        expect(offset).toBeLessThanOrEqual(40);
        await title.dispatchEvent(end, { touches: [] });
      };
      await pull('touchcancel');
      await expect(page.getByRole('status')).toHaveCount(0);
      await expect.poll(async () => (await title.boundingBox()).y).toBeCloseTo(originalY, 0);
      for (const fail of [false, true]) {
        let finish;
        const pending = new Promise((resolve) => {
          finish = resolve;
        });
        await page.route('**/api/notes/?list=902', async (route) => {
          await pending;
          await route.fulfill(
            fail
              ? { status: 500, json: { detail: 'Synthetic refresh failure' } }
              : { json: [{ id: 903, note: 'Visual task', status: 'Not Started' }] },
          );
        });
        await pull('touchend');
        await expect(page.getByRole('status', { name: 'Refreshing' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.style.overscrollBehaviorY)).toBe(
          'none',
        );
        await expect
          .poll(async () => (await title.boundingBox()).y - originalY)
          .toBeCloseTo(33.6, 0);
        await expect(page.getByText('Visual task', { exact: true })).toBeVisible();
        finish();
        await expect(page.getByRole('status')).toHaveCount(0);
        await expect(page.getByText('Visual task', { exact: true })).toBeVisible();
        await expect.poll(async () => (await title.boundingBox()).y).toBeCloseTo(originalY, 0);
      }
      // A gesture started below the document boundary must remain ordinary scroll.
      await page.evaluate(() => {
        document.body.style.minHeight = '2000px';
        window.scrollTo(0, 100);
      });
      await title.dispatchEvent('touchstart', {
        touches: [{ identifier: 1, clientX: 150, clientY: 150 }],
      });
      await title.dispatchEvent('touchmove', {
        touches: [{ identifier: 1, clientX: 150, clientY: 240 }],
      });
      await expect(page.getByRole('status')).toHaveCount(0);
    });
  });
}
