import { screen } from '@testing-library/react';

import SortableNotepadItems, {
  DRAG_HANDLE_TOUCH_STYLE,
  NOTEPAD_ITEM_ROW_MIN_HEIGHT,
  NOTEPAD_ITEM_VERTICAL_GAP,
} from './SortableNotepadItems';
import { renderWithProviders } from '../../test-support/utils';

const items = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
];

describe('SortableNotepadItems', () => {
  test('when items are empty, it shows the empty message', () => {
    renderWithProviders(
      <SortableNotepadItems
        items={[]}
        emptyMessage="No rows found."
        isReordering={false}
        onDragEnd={jest.fn()}
        renderItem={(item) => <div>{item.name}</div>}
        testIdPrefix="row"
      />,
    );

    expect(screen.getByText('No rows found.')).toBeInTheDocument();
  });

  test('when not reordering, it renders the rows in a stable vertical list', () => {
    renderWithProviders(
      <SortableNotepadItems
        items={items}
        emptyMessage="No rows found."
        isReordering={false}
        onDragEnd={jest.fn()}
        renderItem={(item) => <div data-testid={`row-${item.id}`}>{item.name}</div>}
        testIdPrefix="row"
      />,
    );

    expect(screen.getByTestId('row-list')).toHaveStyle(`gap: ${NOTEPAD_ITEM_VERTICAL_GAP}`);
    expect(screen.getByTestId('row-1')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('row-2')).toHaveTextContent('Beta');
  });

  test('when reordering, it wraps rows with sortable drag props', () => {
    renderWithProviders(
      <SortableNotepadItems
        items={items}
        emptyMessage="No rows found."
        isReordering
        onDragEnd={jest.fn()}
        renderItem={(item, handleProps) => (
          <button
            type="button"
            data-testid={`drag-${item.id}`}
            style={DRAG_HANDLE_TOUCH_STYLE}
            {...handleProps}
          >
            {item.name}
          </button>
        )}
        testIdPrefix="row"
      />,
    );

    expect(screen.getByTestId('row-reorder-list')).toHaveStyle(`gap: ${NOTEPAD_ITEM_VERTICAL_GAP}`);
    expect(screen.getByTestId('row-sortable-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('drag-1').style.touchAction).toBe('none');
    expect(NOTEPAD_ITEM_ROW_MIN_HEIGHT).toBe(42);
  });
});
