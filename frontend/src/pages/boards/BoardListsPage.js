// BoardListsPage loads one board's lists and plugs board-specific CRUD/navigation into notepad UI.
import { Box, Button, IconButton, Typography } from '@mui/material';
import Add from '@mui/icons-material/Add';
import DragIndicator from '@mui/icons-material/DragIndicator';
import MoreVert from '@mui/icons-material/MoreVert';
import { useNavigate, useParams } from 'react-router-dom';
import InlineTextEditor from '../../components/notepadPages/InlineTextEditor';
import NotepadPageShell from '../../components/notepadPages/NotepadPageShell';
import NotepadRowActionMenu from '../../components/notepadPages/NotepadRowActionMenu';
import SortableNotepadItems, {
  NOTEPAD_ITEM_ROW_MIN_HEIGHT,
  DRAG_HANDLE_TOUCH_STYLE,
} from '../../components/notepadPages/SortableNotepadItems';
import { useBoardLists } from '../../hooks/useBoardLists';

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

const rowTitleSx = { fontSize: '1.1rem', textAlign: 'left' };

export default function BoardListsPage({ active = true, onPageReady = () => {}, setAppBarHeader }) {
  const navigate = useNavigate();
  const { boardId } = useParams();

  const {
    boardName,
    lists,
    loading,
    error,
    isReordering,
    setIsReordering,
    actionMenuAnchorEl,
    actionMenuOpen,
    isAdding,
    setIsAdding,
    newListName,
    setNewListName,
    editingListId,
    editListName,
    setEditListName,
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
    onDelete,
    onDragEnd,
  } = useBoardLists({ boardId, active, onPageReady, setAppBarHeader });

  const renderListRow = (list, handleProps = null) => {
    if (editingListId === list.id) {
      return (
        <InlineTextEditor
          value={editListName}
          onChange={setEditListName}
          onSubmit={onEdit}
          onCancel={closeEdit}
        />
      );
    }

    if (isReordering) {
      return (
        <Box data-testid={`list-reorder-row-${list.id}`} sx={{ ...rowSx, px: 1, py: 0.5 }}>
          <Typography variant="body1" fontWeight="bold" sx={rowTitleSx}>
            {list.name}
          </Typography>
          <IconButton
            size="small"
            aria-label={`Drag ${list.name}`}
            data-testid={`list-drag-handle-${list.id}`}
            sx={{ color: 'var(--secondary-color)', cursor: 'grab' }}
            style={DRAG_HANDLE_TOUCH_STYLE}
            {...handleProps}
          >
            <DragIndicator />
          </IconButton>
        </Box>
      );
    }

    return (
      <Box data-testid={`list-row-${list.id}`} sx={rowSx}>
        <Button
          variant="text"
          data-pull-refresh-start="true"
          data-testid={`list-row-button-${list.id}`}
          sx={{
            flexGrow: 1,
            justifyContent: 'flex-start',
            color: 'var(--secondary-color)',
            textTransform: 'none',
          }}
          onClick={() =>
            navigate(`/board/${boardId}/list/${list.id}`, {
              state: { boardName, listName: list.name },
            })
          }
        >
          <Typography variant="body1" fontWeight="bold" sx={rowTitleSx}>
            {list.name}
          </Typography>
        </Button>
        <IconButton
          size="small"
          aria-label={`List actions for ${list.name}`}
          onClick={(event) => openActionMenu(event, list)}
          sx={{ color: 'var(--secondary-color)' }}
        >
          <MoreVert />
        </IconButton>
      </Box>
    );
  };

  return (
    <>
      <NotepadPageShell
        title={isReordering ? 'Reorder Lists' : boardName}
        loading={loading}
        error={error}
        hasContent={lists.length > 0}
        pullDistance={pullDistance}
        refreshReady={refreshReady}
        isRefreshing={isRefreshing}
        pullContentOffset={pullContentOffset}
      >
        <SortableNotepadItems
          items={lists}
          emptyMessage="No lists found."
          isReordering={isReordering}
          onDragEnd={onDragEnd}
          renderItem={renderListRow}
          testIdPrefix="list"
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
            placeholder="New List Name..."
            value={newListName}
            onChange={setNewListName}
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
        reorderDisabled={lists.length < 2}
      />
    </>
  );
}
