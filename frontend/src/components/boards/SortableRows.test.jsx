import { screen } from '@testing-library/react';
import SortableRows, {
  DRAG_HANDLE_TOUCH_STYLE,
  SORTABLE_ROW_ROW_MIN_HEIGHT,
  SORTABLE_ROW_FOOTPRINT_HEIGHT,
  SORTABLE_ROW_VERTICAL_GAP,
} from './SortableRows';
import { renderWithProviders } from '../../test-helpers/utils';
const rows = [
  {
    id: 1,
    name: 'Alpha',
  },
  {
    id: 2,
    name: 'Beta',
  },
];
describe('SortableRows', () => {
  test('when rows are empty, it shows the empty message', () => {
    renderWithProviders(
      <SortableRows
        rows={[]}
        emptyMessage="No rows found."
        isReordering={false}
        onDragEnd={vi.fn()}
        renderRow={(row) => <div>{row.name}</div>}
        testIdPrefix="row"
      />,
    );
    expect(screen.getByText('No rows found.')).toBeInTheDocument();
    expect(screen.getByTestId('row-empty-state')).toHaveStyle({
      minHeight: '52px',
      boxSizing: 'border-box',
    });
  });
  test('when not reordering, it renders the rows in a stable vertical list', () => {
    renderWithProviders(
      <SortableRows
        rows={rows}
        emptyMessage="No rows found."
        isReordering={false}
        onDragEnd={vi.fn()}
        renderRow={(row) => <div data-testid={`row-${row.id}`}>{row.name}</div>}
        testIdPrefix="row"
      />,
    );
    expect(screen.getByTestId('row-list')).toHaveStyle(`gap: ${SORTABLE_ROW_VERTICAL_GAP}`);
    expect(screen.getByTestId('row-1')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('row-2')).toHaveTextContent('Beta');
  });
  test('when reordering, it wraps rows with sortable drag props', () => {
    renderWithProviders(
      <SortableRows
        rows={rows}
        emptyMessage="No rows found."
        isReordering
        onDragEnd={vi.fn()}
        renderRow={(row, handleProps) => (
          <button
            type="button"
            data-testid={`drag-${row.id}`}
            style={DRAG_HANDLE_TOUCH_STYLE}
            {...handleProps}
          >
            {row.name}
          </button>
        )}
        testIdPrefix="row"
      />,
    );
    expect(screen.getByTestId('row-reorder-list')).toHaveStyle(`gap: ${SORTABLE_ROW_VERTICAL_GAP}`);
    expect(screen.getByTestId('row-sortable-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('drag-1').style.touchAction).toBe('none');
    expect(SORTABLE_ROW_ROW_MIN_HEIGHT).toBe(42);
    expect(SORTABLE_ROW_FOOTPRINT_HEIGHT).toBe(52);
  });
});
