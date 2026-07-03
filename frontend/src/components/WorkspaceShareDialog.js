import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Delete from '@mui/icons-material/Delete';
import PersonAdd from '@mui/icons-material/PersonAdd';
import { addWorkspaceCollaborator, removeWorkspaceCollaborator } from '../services/notoliApiClient';
import { getResponseErrorMessage } from '../services/authSession';

const userLabel = (user) =>
  user?.display_name || user?.username || user?.email || `User ${user?.id}`;
const userSecondary = (user) => [user?.username, user?.email].filter(Boolean).join(' • ');

export default function WorkspaceShareDialog({
  open,
  workspace,
  token,
  onClose,
  onWorkspaceUpdated,
}) {
  const [identifier, setIdentifier] = useState('');
  const [savingAdd, setSavingAdd] = useState(false);
  const [removingUserId, setRemovingUserId] = useState(null);
  const [error, setError] = useState('');

  const owner = workspace?.owner_details;
  const collaborators = useMemo(() => workspace?.collaborators_details || [], [workspace]);
  const currentUsername = sessionStorage.getItem('username');
  const currentEmail = sessionStorage.getItem('email');
  const isOwner = Boolean(
    owner &&
    ((currentUsername && owner.username === currentUsername) ||
      (currentEmail && owner.email === currentEmail)),
  );

  const handleAdd = async () => {
    const trimmed = identifier.trim();
    if (!trimmed || !workspace) return;

    const duplicate = collaborators.some(
      (collaborator) =>
        collaborator.username?.toLowerCase() === trimmed.toLowerCase() ||
        collaborator.email?.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      setError('That user is already a collaborator.');
      return;
    }
    if (
      owner?.username?.toLowerCase() === trimmed.toLowerCase() ||
      owner?.email?.toLowerCase() === trimmed.toLowerCase()
    ) {
      setError('The workspace owner already has access.');
      return;
    }

    setSavingAdd(true);
    setError('');
    try {
      const response = await addWorkspaceCollaborator(workspace.id, { identifier: trimmed }, token);
      if (!response.ok)
        throw new Error(await getResponseErrorMessage(response, 'Unable to add collaborator.'));
      const updated = await response.json();
      onWorkspaceUpdated(updated);
      setIdentifier('');
    } catch (err) {
      setError(err.message || 'Unable to add collaborator.');
    } finally {
      setSavingAdd(false);
    }
  };

  const handleRemove = async (collaborator) => {
    if (!workspace || !collaborator?.id || collaborator.id === owner?.id) return;

    setRemovingUserId(collaborator.id);
    setError('');
    try {
      const response = await removeWorkspaceCollaborator(workspace.id, collaborator.id, token);
      if (!response.ok)
        throw new Error(await getResponseErrorMessage(response, 'Unable to remove collaborator.'));
      const updated = await response.json();
      onWorkspaceUpdated(updated);
    } catch (err) {
      setError(err.message || 'Unable to remove collaborator.');
    } finally {
      setRemovingUserId(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Share {workspace?.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Box>
            <Typography variant="subtitle2" fontWeight="bold">
              Workspace owner
            </Typography>
            <List dense>
              <ListItem>
                <ListItemText primary={userLabel(owner)} secondary={userSecondary(owner)} />
              </ListItem>
            </List>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" fontWeight="bold">
              Collaborators
            </Typography>
            {collaborators.length ? (
              <List dense>
                {collaborators.map((collaborator) => (
                  <ListItem
                    key={collaborator.id}
                    secondaryAction={
                      isOwner ? (
                        <IconButton
                          edge="end"
                          aria-label={`Remove ${userLabel(collaborator)}`}
                          onClick={() => handleRemove(collaborator)}
                          disabled={removingUserId === collaborator.id || savingAdd}
                        >
                          <Delete />
                        </IconButton>
                      ) : null
                    }
                  >
                    <ListItemText
                      primary={userLabel(collaborator)}
                      secondary={userSecondary(collaborator)}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography color="text.secondary" sx={{ py: 1 }}>
                No collaborators yet.
              </Typography>
            )}
          </Box>

          {isOwner ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="Username or email"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleAdd();
                }}
                disabled={savingAdd || Boolean(removingUserId)}
              />
              <Button
                variant="contained"
                startIcon={<PersonAdd />}
                onClick={handleAdd}
                disabled={!identifier.trim() || savingAdd || Boolean(removingUserId)}
              >
                {savingAdd ? 'Adding…' : 'Add'}
              </Button>
            </Stack>
          ) : (
            <Alert severity="info">Only the workspace owner can add or remove collaborators.</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
