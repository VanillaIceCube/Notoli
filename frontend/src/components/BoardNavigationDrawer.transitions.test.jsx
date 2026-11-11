/* eslint-disable testing-library/no-node-access -- Real MUI portal/exit layout must be measured and its backdrop clicked. */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BoardNavigationDrawer from './BoardNavigationDrawer';
import { boardFixtures } from '../test-support/fixtures';
import { renderWithProviders } from '../test-support/utils';

vi.unmock('@mui/material');
vi.mock('../services/notoliApiClient', () => ({
  fetchBoard: vi.fn(async () => ({ ok: true, json: async () => boardFixtures[0] })),
  fetchBoards: vi.fn(async () => ({ ok: true, json: async () => boardFixtures })),
}));

async function openMenu() {
  sessionStorage.setItem('accessToken', 'fixture');
  sessionStorage.setItem('username', 'owner');
  renderWithProviders(
    <BoardNavigationDrawer
      open
      setDrawerOpen={vi.fn()}
      drawerBoardsLabel=""
      setDrawerBoardsLabel={vi.fn()}
      showSnackbar={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Board' }));
  const icon = (await screen.findAllByTestId('MoreVertIcon'))[0];
  const trigger = icon.closest('button') || icon;
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
    top: 20,
    left: 20,
    right: 40,
    bottom: 40,
    width: 20,
    height: 20,
  });
  await userEvent.click(trigger);
  return trigger;
}

test.each(['escape', 'outside'])(
  'all owner actions survive the entire %s dismissal transition',
  async (method) => {
    const trigger = await openMenu();
    const menu = screen.getByRole('menu');
    const actions = screen.getAllByRole('menuitem');
    expect(actions.map((item) => item.textContent)).toEqual(['Share', 'Rename', 'Remove']);
    // Force a measurable exit interval in jsdom (it does not lay out the paper).
    vi.spyOn(menu.parentElement, 'clientHeight', 'get').mockReturnValue(180);
    if (method === 'escape') fireEvent.keyDown(menu, { key: 'Escape' });
    else fireEvent.click(menu.closest('.MuiModal-root').querySelector('.MuiBackdrop-root'));
    for (const action of actions) expect(menu).toContainElement(action);
    await waitFor(() => expect(menu).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  },
);

test('rapid reopen cancels exit cleanup and keyboard actions stay available', async () => {
  const trigger = await openMenu();
  const menu = screen.getByRole('menu');
  vi.spyOn(menu.parentElement, 'clientHeight', 'get').mockReturnValue(180);
  // Reopen while the previous exit is pending, without waiting for its timeout.
  fireEvent.keyDown(menu, { key: 'Escape' });
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeVisible());
  await userEvent.keyboard('{ArrowDown}{Enter}');
  expect(screen.getByRole('textbox')).toHaveValue('test_board_01');
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
});
