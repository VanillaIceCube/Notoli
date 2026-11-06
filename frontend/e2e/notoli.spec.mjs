import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'http://127.0.0.1:8001';

test('isolated board/list/task fixture preserves collaboration and revocation boundaries', async ({
  page,
  browser,
  request,
}) => {
  async function user() {
    const email = `e2e-${randomUUID()}@example.test`;
    const result = await request.post(`${api}/auth/register/`, {
      data: { email, password: 'Disposable-Fixture-Password-493!' },
    });
    expect(result.status()).toBe(201);
    return { ...(await result.json()), email };
  }
  const owner = await user();
  const collaborator = await user();
  const headers = { Authorization: `Bearer ${owner.access}` };
  const collaboratorHeaders = { Authorization: `Bearer ${collaborator.access}` };
  const boardResult = await request.post(`${api}/api/boards/`, {
    headers,
    data: { name: 'Isolated browser board' },
  });
  expect(boardResult.status()).toBe(201);
  const board = await boardResult.json();
  const listResult = await request.post(`${api}/api/lists/?board=${board.id}`, {
    headers,
    data: { board: board.id, name: 'Isolated browser list' },
  });
  expect(listResult.status()).toBe(201);
  const list = await listResult.json();
  const noteResult = await request.post(`${api}/api/notes/?list=${list.id}`, {
    headers,
    data: { list: list.id, note: 'Isolated browser task', status: 'Not Started' },
  });
  expect(noteResult.status()).toBe(201);
  const note = await noteResult.json();
  expect(
    (
      await request.get(`${api}/api/boards/${board.id}/`, { headers: collaboratorHeaders })
    ).status(),
  ).toBe(404);
  await page.addInitScript((tokens) => {
    sessionStorage.setItem('accessToken', tokens.access);
    sessionStorage.setItem('refreshToken', tokens.refresh);
  }, owner);
  await page.goto(`/board/${board.id}/list/${list.id}`);
  const checkbox = page.getByRole('checkbox', { name: /mark isolated browser task complete/i });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect
    .poll(
      async () =>
        (await (await request.get(`${api}/api/notes/${note.id}/`, { headers })).json()).status,
    )
    .toBe('Complete');
  const shared = await request.post(`${api}/api/boards/${board.id}/collaborators/`, {
    headers,
    data: { identifier: collaborator.email },
  });
  expect(shared.status()).toBe(200);
  const sharedBoard = await shared.json();
  const identity = sharedBoard.collaborators_details.find(
    (user) => user.email === collaborator.email,
  ).id;
  const other = await browser.newContext();
  try {
    await other.addInitScript(
      (tokens) => sessionStorage.setItem('accessToken', tokens.access),
      collaborator,
    );
    const sharedPage = await other.newPage();
    await sharedPage.goto(`http://127.0.0.1:3001/board/${board.id}/list/${list.id}`);
    await expect(sharedPage.getByText('Isolated browser task', { exact: true })).toBeVisible();
    expect(
      (
        await request.delete(`${api}/api/boards/${board.id}/collaborators/${identity}/`, {
          headers,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.get(`${api}/api/boards/${board.id}/`, { headers: collaboratorHeaders })
      ).status(),
    ).toBe(404);
  } finally {
    await other.close();
  }
});
