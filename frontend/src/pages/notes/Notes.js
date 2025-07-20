import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography,
  Container,
  Paper,
  Stack,
  Button,
  Menu,
  MenuItem,
  Box,
  TextField,
  IconButton
} from '@mui/material';
import { Add, Close, MoreVert } from '@mui/icons-material';
import Divider from '@mui/material/Divider';
import { useNavigate, useParams } from 'react-router-dom';

export default function Notes() {
  // Pull Todolist ID
  const { todolistId } = useParams();

  // Pull Note List
  const token = sessionStorage.getItem('accessToken');
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/api/notes/?todolist=${todolistId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setLists(data);
      setError(null);
    } catch (err) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  }, [token, todolistId]);

  useEffect(() => {
    if (todolistId) {
      fetchNotes();
    }
  }, [todolistId, fetchNotes]);

  // Triple Dot Menu Functions
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

  // Add New Note
  const [isAdding, setIsAdding] = useState(false);
  const [newNoteName, setNewNoteName] = useState('');
  
  const onAdd = async () => {
    if (!newNoteName.trim()) return;
    setError(null);
    
    try {
      const response = await fetch(`http://localhost:8000/api/notes/?todolist=${todolistId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` })
        },
        body: JSON.stringify({
          name: newNoteName,
          todolist: todolistId,
          description: '',
        }),
      });
      
      // Pessimistic Local Merge
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = await response.json();
      setLists(prev => [...prev, created]);

      setIsAdding(false);
      setNewNoteName('');
    } catch (err) {
      setError(err.toString());
    }
  }

  // Edit Note
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteName, setEditNoteName] = useState('');

  const startEditing = () => {
    setEditingNoteId(selectedNote.id);
    setEditNoteName(selectedNote.name);
    handleTripleDotClose();
  };

  const onEdit = async () => {
    if (!editNoteName.trim()) return;
    setError(null);

    try {
      const response = await fetch(
        `http://localhost:8000/api/notes/${editingNoteId}/`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({ name: editNoteName }),
        }
      );

      // Pessimistic Local Merge
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updated = await response.json();
      setLists(prev => prev.map(note => (note.id === updated.id ? updated : note)));

      closeEdit();
    } catch (err) {
      setError(err.toString());
    }
  };

  const closeEdit = () => {
    setEditingNoteId(null);
    setEditNoteName('');
  };

  // Delete Note
  const onDelete = async (id) => {
    setError(null);

    try {
      const response = await fetch(`http://localhost:8000/api/notes/${id}/`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` })
        },
      });
      
      // Pessimistic Local Merge
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setLists(prev => prev.filter(note => note.id !== id));
    } catch (err) {
      setError(err.toString());
    } finally {
      handleTripleDotClose();
    }
  }

  return (
    <Container maxWidth="sm" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', py: 2 }}>
      <Paper elevation={3} sx={{ px: 1.5, py: 1.5, width: '100%', background:'var(--secondary-background-color)' }}>
        {/* Header */}
        <Typography variant="h4" align="center" gutterBottom sx={{ mt: 1.5, fontWeight: 'bold', color: 'var(--secondary-color)'}}>
          Notes
        </Typography>

        {/* This is for loading */}
        {loading && (
          <Typography align="center"> Loading… </Typography>
        )}
        
        {/* This is for errors */}
        {error && (
          <Typography color="error" align="center">
            Error: {error}
          </Typography>
        )}

        {/* If we're done loading and there are no errors */}
        <Divider sx={{ borderBottomWidth: 2, marginBottom: 1, bgcolor: 'var(--secondary-color)' }} />
        {!loading && !error && (
          <Stack spacing={1}>
            {lists.length ? lists.map(list => (
              <React.Fragment key={list.id}>
                {editingNoteId === list.id ? (
                  <React.Fragment>
                    {/* Editing Mode */}
                    <Box sx={{ display:'flex', alignItems:'center', px:1, py:0.5 }}>
                      <TextField autoFocus variant="standard" size="small"
                        sx={{ flexGrow:1, mr:1, justifyContent: 'space-between', color: 'var(--secondary-color)' }}
                        slotProps={{ input:{ sx:{
                          color: 'var(--secondary-color)',
                          '&:after': {borderBottomColor: 'var(--secondary-color)' }}}}}
                        value={editNoteName}
                        onChange={event => setEditNoteName(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') onEdit();
                          if (event.key === 'Escape') closeEdit();
                        }}
                      />
                      <IconButton size="small" onClick={onEdit} disabled={!editNoteName.trim()}>
                        <Add/>
                      </IconButton>
                      <IconButton size="small" onClick={closeEdit}>
                        <Close/>
                      </IconButton>
                    </Box>
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    {/* Normal Mode */}
                    <Button variant="text" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background:'var(--secondary-background-color)', color: 'var(--secondary-color)' }}>
                      <Typography variant="body1" fontWeight="bold" sx={{ fontSize: '1.1rem', textAlign: 'left' }}>
                        {list.name}
                      </Typography>
                      <MoreVert onClick={(event) => handleTripleDotClick(event, list)} />
                    </Button>
                  </React.Fragment>
                )}
                <Divider sx={{ borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }} />
              </React.Fragment>
            )) : (
              <Typography variant="body1" align="center" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
                No to-do lists found.
              </Typography>
            )}
            {/* By default show the Add New button, otherwise show a TextField & save Note*/}
            { !isAdding ? (
              <Button variant="text" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'left', background:'var(--secondary-background-color)', color: 'var(--secondary-color)' }}
                startIcon={<Add/>}
                onClick={() => setIsAdding(true)}
              >
                <Typography variant="body1" align="center" fontWeight="bold" sx={{ fontSize: '1.1rem' }}>
                  Add New
                </Typography>
              </Button>
            ) : (
              <Box sx={{ display:'flex', alignItems:'center', px:1, py:0.5 }}>
                <TextField autoFocus variant="standard" size="small"
                  sx={{ flexGrow:1, mr:1, justifyContent: 'space-between', color: 'var(--secondary-color)' }}
                  slotProps={{ input:{ sx:{
                    color: 'var(--secondary-color)',
                    '&:after': {borderBottomColor: 'var(--secondary-color)' }}}}}
                  placeholder="New Note Name…"
                  value={newNoteName}
                  onChange={event => setNewNoteName(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') onAdd();
                    if (event.key === 'Escape') setIsAdding(false);
                  }}
                />
                <IconButton size="small" onClick={onAdd} disabled={!newNoteName.trim()}>
                  <Add />
                </IconButton>
                <IconButton size="small" onClick={() => setIsAdding(false)}>
                  <Close />
                </IconButton>
              </Box>
            )}
          </Stack>
        )}

        {/* Triple dot menu */}
        <Menu slotProps={{ paper:{ sx:{ backgroundColor: 'var(--secondary-background-color)', color: 'var(--secondary-color)', boxShadow: 3, border: '2.5px solid var(--background-color)', borderRadius: 1.5 }}}}
          anchorEl={tripleDotAnchorElement}
          open={open}
          onClose={handleTripleDotClose}
        >
          <MenuItem sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight:"bold" }}
            onClick={startEditing}
          >
            Edit
          </MenuItem>
          <Divider variant="middle" sx={{ my: 0, mx: 1, borderBottomWidth: 2, bgcolor: 'var(--secondary-color)' }} />
          <MenuItem sx={{ py: 0.1, px: 1.5, minHeight: 'auto', fontWeight:"bold" }}
            onClick={() => onDelete(selectedNote.id)}
          >
            Delete
          </MenuItem>
        </Menu>
      </Paper>
    </Container>
  );
}
