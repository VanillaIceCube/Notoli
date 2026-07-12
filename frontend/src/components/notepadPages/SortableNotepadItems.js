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

export const NOTEPAD_ITEM_VERTICAL_GAP = '8px';
export const NOTEPAD_ITEM_ROW_MIN_HEIGHT = 42;
export const NOTEPAD_ITEM_FOOTPRINT_HEIGHT = 52;
export const VERTICAL_REORDER_DRAG_MODIFIERS = [
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
  gap: NOTEPAD_ITEM_VERTICAL_GAP,
};

const dividerSx = { borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' };

function SortableNotepadItem({ itemId, testIdPrefix, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId,
  });

  return (
    <Box
      ref={setNodeRef}
      data-testid={`${testIdPrefix}-sortable-row-${itemId}`}
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

export default function SortableNotepadItems({
  items,
  emptyMessage,
  isReordering,
  onDragEnd,
  renderItem,
  testIdPrefix,
}) {
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (!items.length) {
    return (
      <Typography
        data-testid={`${testIdPrefix}-empty-state`}
        variant="body1"
        align="center"
        fontWeight="bold"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Match one rendered list item: 42px row + 8px list gap + 2px divider.
          minHeight: NOTEPAD_ITEM_FOOTPRINT_HEIGHT,
          boxSizing: 'border-box',
          px: 2,
          borderRadius: 1,
          borderBottom: '2px solid var(--secondary-color)',
          bgcolor: 'var(--secondary-background-color)',
          color: 'var(--secondary-color)',
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
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <Box data-testid={`${testIdPrefix}-reorder-list`} style={listStyle}>
            {items.map((item) => (
              <SortableNotepadItem key={item.id} itemId={item.id} testIdPrefix={testIdPrefix}>
                {({ handleProps }) => (
                  <Box data-testid={`${testIdPrefix}-reorder-item-${item.id}`} style={listStyle}>
                    {renderItem(item, handleProps)}
                    <Divider sx={dividerSx} />
                  </Box>
                )}
              </SortableNotepadItem>
            ))}
          </Box>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <Box data-testid={`${testIdPrefix}-list`} style={listStyle}>
      {items.map((item) => (
        <React.Fragment key={item.id}>
          {renderItem(item)}
          <Divider sx={dividerSx} />
        </React.Fragment>
      ))}
    </Box>
  );
}
