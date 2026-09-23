// ListTasksPage loads one list's tasks and adds task-specific completion behavior to notepad UI.
import { Box, Button, Checkbox, IconButton, Typography } from '@mui/material';
import Add from '@mui/icons-material/Add';
import DragIndicator from '@mui/icons-material/DragIndicator';
import MoreVert from '@mui/icons-material/MoreVert';
import { useLocation, useParams } from 'react-router-dom';
import InlineTextEditor from '../../components/notepadPages/InlineTextEditor';
import NotepadPageShell from '../../components/notepadPages/NotepadPageShell';
import NotepadRowActionMenu from '../../components/notepadPages/NotepadRowActionMenu';
import SortableNotepadItems, {
  NOTEPAD_ITEM_ROW_MIN_HEIGHT,
  DRAG_HANDLE_TOUCH_STYLE,
} from '../../components/notepadPages/SortableNotepadItems';
import { useListTasks, isTaskComplete } from '../../hooks/useListTasks';

const rowSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: 'var(--secondary-background-color)',
  color: 'var(--secondary-color)',
  borderRadius: 1,
  width: '100%',
  minHeight: NOTEPAD_ITEM_ROW_MIN_HEIGHT,
  boxSizing: 'border-box',
};

const pageActionButtonSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'left',
  background: 'var(--secondary-background-color)',
  color: 'var(--secondary-color)',
};

export default function ListTasksPage({ active = true, onPageReady = () => {}, setAppBarHeader }) {
  const { boardId, listId } = useParams();
  const location = useLocation();

  const {
    listName,
    tasks,
    loading,
    error,
    isReordering,
    setIsReordering,
    actionMenuAnchorEl,
    actionMenuOpen,
    isAdding,
    setIsAdding,
    newTask,
    setNewTask,
    editingTaskId,
    editTask,
    setEditTask,
    isRefreshing,
    pullDistance,
    refreshReady,
    pullContentOffset,
    openActionMenu,
    closeActionMenu,
    startEditing,
    closeEdit,
    startReordering,
    onAdd,
    onEdit,
    onToggleStatus,
    onDelete,
    onDragEnd,
  } = useListTasks({
    boardId,
    listId,
    locationStateBoardName: location.state?.boardName,
    locationStateListName: location.state?.listName,
    active,
    onPageReady,
    setAppBarHeader,
  });

  const renderTaskRow = (task, handleProps = null) => {
    if (editingTaskId === task.id) {
      return (
        <InlineTextEditor
          value={editTask}
          onChange={setEditTask}
          onSubmit={onEdit}
          onCancel={closeEdit}
        />
      );
    }

    const complete = isTaskComplete(task);
    const taskRowSx = { ...rowSx, px: 1, py: 0.5, opacity: complete ? 0.72 : 1 };

    return (
      <Box
        data-testid={`${isReordering ? 'note-reorder-row' : 'note-row'}-${task.id}`}
        sx={taskRowSx}
      >
        <Checkbox
          checked={complete}
          onClick={(event) => event.stopPropagation()}
          onChange={isReordering ? undefined : (event) => onToggleStatus(event, task)}
          inputProps={{ 'aria-label': `Mark ${task.note} complete` }}
          sx={{
            color: 'var(--secondary-color)',
            p: 0.5,
            mr: 1,
            pointerEvents: isReordering ? 'none' : 'auto',
            '&.Mui-checked': { color: 'var(--secondary-color)' },
          }}
        />
        <Typography
          variant="body1"
          fontWeight="bold"
          sx={{
            flexGrow: 1,
            fontSize: '1.1rem',
            textAlign: 'left',
            textDecoration: complete ? 'line-through' : 'none',
          }}
        >
          {task.note}
        </Typography>
        {isReordering ? (
          <IconButton
            size="small"
            aria-label={`Drag ${task.note}`}
            data-testid={`note-drag-handle-${task.id}`}
            sx={{ color: 'var(--secondary-color)', cursor: 'grab' }}
            style={DRAG_HANDLE_TOUCH_STYLE}
            {...handleProps}
          >
            <DragIndicator />
          </IconButton>
        ) : (
          <IconButton
            size="small"
            aria-label={`Note actions for ${task.note}`}
            onClick={(event) => {
              event.stopPropagation();
              openActionMenu(event, task);
            }}
            sx={{ color: 'var(--secondary-color)' }}
          >
            <MoreVert />
          </IconButton>
        )}
      </Box>
    );
  };

  return (
    <>
      <NotepadPageShell
        title={isReordering ? 'Reorder Notes' : listName}
        loading={loading}
        error={error}
        hasContent={tasks.length > 0}
        pullDistance={pullDistance}
        refreshReady={refreshReady}
        isRefreshing={isRefreshing}
        pullContentOffset={pullContentOffset}
      >
        <SortableNotepadItems
          items={tasks}
          emptyMessage="No notes found."
          isReordering={isReordering}
          onDragEnd={onDragEnd}
          renderItem={renderTaskRow}
          testIdPrefix="note"
        />
        {isReordering ? (
          <Button variant="text" sx={pageActionButtonSx} onClick={() => setIsReordering(false)}>
            <Typography
              variant="body1"
              align="center"
              fontWeight="bold"
              sx={{ fontSize: '1.1rem' }}
            >
              Done Reordering
            </Typography>
          </Button>
        ) : !isAdding ? (
          <Button
            variant="text"
            sx={pageActionButtonSx}
            startIcon={<Add />}
            onClick={() => setIsAdding(true)}
          >
            <Typography
              variant="body1"
              align="center"
              fontWeight="bold"
              sx={{ fontSize: '1.1rem' }}
            >
              Add New
            </Typography>
          </Button>
        ) : (
          <InlineTextEditor
            placeholder="New Note..."
            value={newTask}
            onChange={setNewTask}
            onSubmit={onAdd}
            onCancel={() => setIsAdding(false)}
          />
        )}
      </NotepadPageShell>

      <NotepadRowActionMenu
        anchorEl={actionMenuAnchorEl}
        open={actionMenuOpen}
        onClose={closeActionMenu}
        onRename={startEditing}
        onReorder={startReordering}
        onRemove={onDelete}
        reorderDisabled={tasks.length < 2}
      />
    </>
  );
}
