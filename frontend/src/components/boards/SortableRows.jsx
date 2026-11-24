// Shared ordered-row renderer; parent pages provide row UI while this component owns sortable wiring.
import React from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box, Typography } from '@mui/material';
import Divider from '@mui/material/Divider';

export const SORTABLE_ROW_VERTICAL_GAP = '8px';
export const SORTABLE_ROW_ROW_MIN_HEIGHT = 42;
export const SORTABLE_ROW_FOOTPRINT_HEIGHT = 52;
const VERTICAL_REORDER_DRAG_MODIFIERS = [
  ({ transform }) => ({
    ...transform,
    x: 0,
  }),
];
export const DRAG_HANDLE_TOUCH_STYLE = {
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};

const listStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: SORTABLE_ROW_VERTICAL_GAP,
};

const dividerSx = { borderBottomWidth: 2, bgcolor: 'var(--surface-text)' };

function SortableRow({ rowId, testIdPrefix, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rowId,
  });

  return (
    <Box
      ref={setNodeRef}
      data-testid={`${testIdPrefix}-sortable-row-${rowId}`}
      sx={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.78 : 1,
        zIndex: isDragging ? 1 : 'auto',
      }}
    >
      {children({ handleProps: { ...attributes, ...listeners } })}
    </Box>
  );
}

export default function SortableRows({
  rows,
  emptyMessage,
  isReordering,
  onDragEnd,
  renderRow,
  testIdPrefix,
}) {
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (!rows.length) {
    return (
      <Typography
        data-testid={`${testIdPrefix}-empty-state`}
        variant="body1"
        align="center"
        sx={{
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',

          // Match one rendered row: 42px row + 8px list gap + 2px divider.
          minHeight: SORTABLE_ROW_FOOTPRINT_HEIGHT,

          boxSizing: 'border-box',
          px: 2,
          borderRadius: 1,
          borderBottom: '2px solid var(--surface-text)',
          bgcolor: 'var(--surface-background)',
          color: 'var(--surface-text)',
          fontSize: '1.1rem',
        }}
      >
        {emptyMessage}
      </Typography>
    );
  }

  if (isReordering) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={VERTICAL_REORDER_DRAG_MODIFIERS}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
          <Box data-testid={`${testIdPrefix}-reorder-list`} style={listStyle}>
            {rows.map((row) => (
              <SortableRow key={row.id} rowId={row.id} testIdPrefix={testIdPrefix}>
                {({ handleProps }) => (
                  <Box
                    data-testid={`${testIdPrefix}-reorder-container-${row.id}`}
                    style={listStyle}
                  >
                    {renderRow(row, handleProps)}
                    <Divider sx={dividerSx} />
                  </Box>
                )}
              </SortableRow>
            ))}
          </Box>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <Box data-testid={`${testIdPrefix}-list`} style={listStyle}>
      {rows.map((row) => (
        <React.Fragment key={row.id}>
          {renderRow(row)}
          <Divider sx={dividerSx} />
        </React.Fragment>
      ))}
    </Box>
  );
}
