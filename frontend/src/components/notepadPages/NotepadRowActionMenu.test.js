import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NotepadRowActionMenu from './NotepadRowActionMenu';
import { renderWithProviders } from '../../test-support/utils';

function renderMenu(props = {}) {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  const menuProps = {
    anchorEl: anchor,
    open: true,
    onClose: jest.fn(),
    onRename: jest.fn(),
    onReorder: jest.fn(),
    onRemove: jest.fn(),
    ...props,
  };

  const view = renderWithProviders(<NotepadRowActionMenu {...menuProps} />);
  return { ...view, menuProps, anchor };
}

describe('NotepadRowActionMenu', () => {
  test('when opened, it shows rename, reorder, and remove actions with icons', () => {
    renderMenu();

    expect(screen.getByRole('menuitem', { name: /rename/i })).toContainElement(
      screen.getByTestId('EditIcon'),
    );
    expect(screen.getByRole('menuitem', { name: /reorder/i })).toContainElement(
      screen.getByTestId('ReorderIcon'),
    );
    expect(screen.getByRole('menuitem', { name: /remove/i })).toContainElement(
      screen.getByTestId('DeleteIcon'),
    );
  });

  test('when actions are clicked, it calls the parent handlers', async () => {
    const { menuProps } = renderMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /reorder/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /remove/i }));

    expect(menuProps.onRename).toHaveBeenCalledTimes(1);
    expect(menuProps.onReorder).toHaveBeenCalledTimes(1);
    expect(menuProps.onRemove).toHaveBeenCalledTimes(1);
  });

  test('when reordering is disabled, the reorder action is disabled', () => {
    renderMenu({ reorderDisabled: true });

    expect(screen.getByRole('menuitem', { name: /reorder/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
