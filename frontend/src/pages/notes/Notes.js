import React, { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Box,
  Button,
  Checkbox,
  Container,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Close from '@mui/icons-material/Close';
import DragIndicator from '@mui/icons-material/DragIndicator';
import MoreVert from '@mui/icons-material/MoreVert';
import Divider from '@mui/material/Divider';
import { useParams } from 'react-router-dom';
import {
  createNote,
  deleteNote,
  fetchNotes as fetchNotesApi,
  fetchTodoList as fetchTodoListApi,
  reorderNotes,
  updateNote,
} from '../../services/notoliApiClient';

const NOTE_STATUS_NOT_STARTED = 'Not Started';
const NOTE_STATUS_COMPLETE = 'Complete';
const isNoteComplete = (note) => note.status === NOTE_STATUS_COMPLETE;

function SortableNoteRow({ note, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
  });

  return (
    <Box
      ref={setNodeRef}
      data-testid={`note-row-${note.id}`}
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

export default function Notes({ setAppBarHeader }) {
  const { todoListId } = useParams();
  const token = sessionStorage.getItem('accessToken');
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReordering, setIsReordering] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchNotesApi(todoListId, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setLists(data);
      setError(null);
    } catch (err) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }, [token, todoListId]);

  const fetchTodoListName = useCallback(async () => {
    if (!todoListId) return;
    try {
      const response = await fetchTodoListApi(todoListId, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const todoListData = await response.json();
      setAppBarHeader(todoListData?.name ?? '');
    } catch (err) {
      setError(err.toString());
    }
  }, [todoListId, token, setAppBarHeader]);

  useEffect(() => {
    if (todoListId) {
      fetchNotes();
      fetchTodoListName();
    }
  }, [todoListId, fetchNotes, fetchTodoListName]);

  const [pageMenuAnchorElement, setPageMenuAnchorElement] = useState(null);
  const pageMenuOpen = Boolean(pageMenuAnchorElement);

  const handlePageMenuClose = () => {
    setPageMenuAnchorElement(null);
  };

  const startReordering = () => {
    closeEdit();
    setIsAdding(false);
    handleTripleDotClose();
    handlePageMenuClose();
    setIsReordering(true);
  };

  const stopReordering = () => {
    setIsReordering(false);
  };

  const [tripleDotAnchorElement, setTripleDotAnchorElement] = useState(null);
  const [selectedNote, setSelectedNote] = useState(null);
  const open = Boolean(tripleDotAnchorElement);

  const handleTripleDotClick = (event, list) => {
    setTripleDotAnchorElement(event.currentTarget);
    setSelectedNote(list);
  };

  const handleTripleDotClose = () => {
    setTripleDotAnchorElement(null);
    setSelectedNote(null);
  };

  const [isAdding, setIsAdding] = useState(false);
  const [newNote, setNewNote] = useState('');

  const onAdd = async () => {
    if (!newNote.trim()) return;
    setError(null);

    try {
      const response = await createNote(
        todoListId,
        {
          note: newNote,
          todo_list: todoListId,
          description: '',
        },
        token,
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = await response.json();
      setLists((prev) => [...prev, created]);

      setIsAdding(false);
      setNewNote('');
    } catch (err) {
      setError(err.toString());
    }
  };

  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNote, setEditNote] = useState('');

  const startEditing = () => {
    setEditingNoteId(selectedNote.id);
    setEditNote(selectedNote.note);
    handleTripleDotClose();
  };

  const onEdit = async () => {
    if (!editNote.trim()) return;
    setError(null);

    try {
      const response = await updateNote(editingNoteId, { note: editNote }, token);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updated = await response.json();
      setLists((prev) =>
        prev.map((note) => (note.id === updated.id ? { ...note, ...updated } : note)),
      );

      closeEdit();
    } catch (err) {
      setError(err.toString());
    }
  };

  const onToggleStatus = async (event, noteToToggle) => {
    event.stopPropagation();
    const status = event.target.checked ? NOTE_STATUS_COMPLETE : NOTE_STATUS_NOT_STARTED;
    setError(null);
    setLists((prev) =>
      prev.map((note) => (note.id === noteToToggle.id ? { ...note, status } : note)),
    );

    try {
      const response = await updateNote(noteToToggle.id, { status }, token);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updated = await response.json();
      setLists((prev) =>
        prev.map((note) => (note.id === updated.id ? { ...note, ...updated } : note)),
      );
    } catch (err) {
      setLists((prev) =>
        prev.map((note) =>
          note.id === noteToToggle.id ? { ...note, status: noteToToggle.status } : note,
        ),
      );
      setError(err.toString());
    }
  };

  const closeEdit = () => {
    setEditingNoteId(null);
    setEditNote('');
  };

  const onDelete = async (id) => {
    setError(null);

    try {
      const response = await deleteNote(id, token);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setLists((prev) => prev.filter((note) => note.id !== id));
    } catch (err) {
      setError(err.toString());
    } finally {
      handleTripleDotClose();
    }
  };

  const onDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;

    const oldIndex = lists.findIndex((note) => note.id === active.id);
    const newIndex = lists.findIndex((note) => note.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previousNotes = lists;
    const reorderedNotes = arrayMove(lists, oldIndex, newIndex);
    setLists(reorderedNotes);
    setError(null);

    try {
      const response = await reorderNotes(
        todoListId,
        reorderedNotes.map((note) => note.id),
        token,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updatedNotes = await response.json();
      setLists(updatedNotes);
    } catch (err) {
      setLists(previousNotes);
      setError(err.toString());
    }
  };

  const renderRowContent = (list, handleProps = null) => {
    if (editingNoteId === list.id) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5 }}>
          <TextField
            autoFocus
            variant="standard"
            size="small"
            sx={{
              flexGrow: 1,
              mr: 1,
              justifyContent: 'space-between',
              color: 'var(--secondary-color)',
            }}
            slotProps={{
              input: {
                sx: {
                  color: 'var(--secondary-color)',
                  '&:after': { borderBottomColor: 'var(--secondary-color)' },
                },
              },
            }}
            value={editNote}
            onChange={(event) => setEditNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onEdit();
              if (event.key === 'Escape') closeEdit();
            }}
          />
          <IconButton size="small" onClick={onEdit} disabled={!editNote.trim()}>
            <Add />
          </IconButton>
          <IconButton size="small" onClick={closeEdit}>
            <Close />
          </IconButton>
        </Box>
      );
    }

    const complete = isNoteComplete(list);
    const rowSx = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'var(--secondary-background-color)',
      color: 'var(--secondary-color)',
      borderRadius: 1,
      width: '100%',
      boxSizing: 'border-box',
      opacity: complete && !isReordering ? 0.72 : 1,
    };

    const rowContent = (
      <>
        <Checkbox
          checked={complete}
          onClick={(event) => event.stopPropagation()}
          onChange={isReordering ? undefined : (event) => onToggleStatus(event, list)}
          inputProps={{ 'aria-label': `Mark ${list.note} complete` }}
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
          {list.note}
        </Typography>
        {isReordering ? (
          <IconButton
            size="small"
            aria-label={`Drag ${list.note}`}
            data-testid={`note-drag-handle-${list.id}`}
            sx={{ color: 'var(--secondary-color)', cursor: 'grab' }}
            {...handleProps}
          >
            <DragIndicator />
          </IconButton>
        ) : (
          <IconButton
            size="small"
            aria-label={`Note actions for ${list.note}`}
            onClick={(event) => {
              event.stopPropagation();
              handleTripleDotClick(event, list);
            }}
            sx={{ color: 'var(--secondary-color)' }}
          >
            <MoreVert />
          </IconButton>
        )}
      </>
    );

    if (isReordering) {
      return (
        <Box data-testid={`note-reorder-row-${list.id}`} sx={{ ...rowSx, px: 1, py: 0.5 }}>
          {rowContent}
        </Box>
      );
    }

    return <Box sx={rowSx}>{rowContent}</Box>;
  };

  const renderListRows = () => {
    if (!lists.length) {
      return (
        <Typography variant="body1" align="center" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
          No notes found.
        </Typography>
      );
    }

    if (isReordering) {
      return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={lists.map((list) => list.id)}
            strategy={verticalListSortingStrategy}
          >
            {lists.map((list) => (
              <SortableNoteRow key={list.id} note={list}>
                {({ handleProps }) => (
                  <>
                    {renderRowContent(list, handleProps)}
                    <Divider sx={{ borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }} />
                  </>
                )}
              </SortableNoteRow>
            ))}
          </SortableContext>
        </DndContext>
      );
    }

    return lists.map((list) => (
      <React.Fragment key={list.id}>
        {renderRowContent(list)}
        <Divider sx={{ borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }} />
      </React.Fragment>
    ));
  };

  return (
    <Container
      maxWidth="sm"
      sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', py: 2, pt: 0.5 }}
    >
      <Paper
        elevation={3}
        sx={{ px: 1.5, py: 1.5, width: '100%', background: 'var(--secondary-background-color)' }}
      >
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}
        >
          <Box sx={{ width: 40 }} />
          <Typography
            variant="h4"
            align="center"
            gutterBottom
            sx={{ fontWeight: 'bold', color: 'var(--secondary-color)' }}
          >
            {isReordering ? 'Reorder Notes' : 'Notes'}
          </Typography>
          {isReordering ? (
            <Button
              variant="text"
              size="small"
              onClick={stopReordering}
              sx={{ minWidth: 40, color: 'var(--secondary-color)', fontWeight: 'bold' }}
            >
              Done
            </Button>
          ) : (
            <IconButton
              size="small"
              aria-label="Notes page actions"
              onClick={(event) => setPageMenuAnchorElement(event.currentTarget)}
              sx={{ color: 'var(--secondary-color)' }}
            >
              <MoreVert />
            </IconButton>
          )}
        </Box>

        {loading && <Typography align="center"> Loading... </Typography>}

        {error && (
          <Typography color="error" align="center">
            Error: {error}
          </Typography>
        )}

        <Divider
          sx={{ borderBottomWidth: 2, marginBottom: 1, bgcolor: 'var(--secondary-color)' }}
        />
        {!loading && !error && (
          <Stack spacing={1}>
            {renderListRows()}
            {!isReordering &&
              (!isAdding ? (
                <Button
                  variant="text"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'left',
                    background: 'var(--secondary-background-color)',
                    color: 'var(--secondary-color)',
                  }}
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
                <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5 }}>
                  <TextField
                    autoFocus
                    variant="standard"
                    size="small"
                    sx={{
                      flexGrow: 1,
                      mr: 1,
                      justifyContent: 'space-between',
                      color: 'var(--secondary-color)',
                    }}
                    slotProps={{
                      input: {
                        sx: {
                          color: 'var(--secondary-color)',
                          '&:after': { borderBottomColor: 'var(--secondary-color)' },
                        },
                      },
                    }}
                    placeholder="New Note..."
                    value={newNote}
                    onChange={(event) => setNewNote(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') onAdd();
                      if (event.key === 'Escape') setIsAdding(false);
                    }}
                  />
                  <IconButton size="small" onClick={onAdd} disabled={!newNote.trim()}>
                    <Add />
                  </IconButton>
                  <IconButton size="small" onClick={() => setIsAdding(false)}>
                    <Close />
                  </IconButton>
                </Box>
              ))}
          </Stack>
        )}

        <Menu
          slotProps={{
            paper: {
              sx: {
                backgroundColor: 'var(--secondary-background-color)',
                color: 'var(--secondary-color)',
                boxShadow: 3,
                border: '2.5px solid var(--background-color)',
                borderRadius: 1.5,
              },
            },
          }}
          anchorEl={pageMenuAnchorElement}
          open={pageMenuOpen}
          onClose={handlePageMenuClose}
        >
          <MenuItem
            sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
            onClick={startReordering}
            disabled={lists.length < 2}
          >
            Reorder Notes
          </MenuItem>
        </Menu>

        <Menu
          slotProps={{
            paper: {
              sx: {
                backgroundColor: 'var(--secondary-background-color)',
                color: 'var(--secondary-color)',
                boxShadow: 3,
                border: '2.5px solid var(--background-color)',
                borderRadius: 1.5,
              },
            },
          }}
          anchorEl={tripleDotAnchorElement}
          open={open}
          onClose={handleTripleDotClose}
        >
          <MenuItem
            sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
            onClick={startEditing}
          >
            Edit
          </MenuItem>
          <Divider
            variant="middle"
            sx={{ my: 0, mx: 1, borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }}
          />
          <MenuItem
            sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight: 'bold' }}
            onClick={() => onDelete(selectedNote.id)}
          >
            Delete
          </MenuItem>
        </Menu>
      </Paper>
    </Container>
  );
}
