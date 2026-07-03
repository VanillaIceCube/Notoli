import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
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

const alertStyles = {
  bgcolor: 'var(--background-color)',
  color: 'var(--text-color)',
  '& .MuiAlert-icon': { color: 'var(--primary-color)' },
};

const textFieldStyles = {
  '& .MuiInputBase-root': {
    color: 'var(--secondary-color)',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  '& .MuiInputLabel-root': { color: 'var(--secondary-color)' },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--secondary-color)',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--background-color)',
  },
};

const insetDividerStyles = {
  borderBottomWidth: 2,
  bgcolor: 'var(--secondary-color)',
  mx: 3,
};

function UserAccessSection({ title, users, emptyMessage, renderAction }) {
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight="bold" sx={{ textTransform: 'uppercase' }}>
        {title}
      </Typography>
      {users.length ? (
        <List dense disablePadding sx={{ pt: 0.5 }}>
          {users.map((user) => (
            <ListItem
              key={user?.id || title}
              disableGutters
              secondaryAction={renderAction?.(user)}
              sx={{ alignItems: 'flex-start', py: 0.75 }}
            >
              <ListItemText
                primary={userLabel(user)}
                secondary={
                  <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                    <Typography component="span" variant="caption" sx={{ color: 'inherit' }}>
                      Username: {user?.username || 'Not set'}
                    </Typography>
                    <Typography component="span" variant="caption" sx={{ color: 'inherit' }}>
                      Email: {user?.email || 'Not set'}
                    </Typography>
                  </Stack>
                }
                slotProps={{
                  primary: { sx: { fontWeight: 'bold', color: 'var(--secondary-color)' } },
                  secondary: { component: 'div', sx: { color: 'var(--secondary-color)' } },
                }}
              />
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography sx={{ py: 1, color: 'var(--secondary-color)' }}>{emptyMessage}</Typography>
      )}
    </Box>
  );
}

export default function WorkspaceShareDialog({
  open,
  workspace,
  token,
  onClose,
  onWorkspaceUpdated,
  showSnackbar,
}) {
  const [identifier, setIdentifier] = useState('');
  const [savingAdd, setSavingAdd] = useState(false);
  const [removingUserId, setRemovingUserId] = useState(null);

  const owner = workspace?.owner_details;
  const collaborators = useMemo(() => workspace?.collaborators_details || [], [workspace]);
  const currentUsername = sessionStorage.getItem('username');
  const currentEmail = sessionStorage.getItem('email');
  const isOwner = Boolean(
    owner &&
    ((currentUsername && owner.username === currentUsername) ||
      (currentEmail && owner.email === currentEmail)),
  );

  const showError = (message) => {
    showSnackbar?.('error', message);
  };

  const handleAdd = async () => {
    const trimmed = identifier.trim();
    if (!trimmed || !workspace) return;

    const duplicate = collaborators.some(
      (collaborator) =>
        collaborator.username?.toLowerCase() === trimmed.toLowerCase() ||
        collaborator.email?.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      showError('That user is already a collaborator.');
      return;
    }
    if (
      owner?.username?.toLowerCase() === trimmed.toLowerCase() ||
      owner?.email?.toLowerCase() === trimmed.toLowerCase()
    ) {
      showError('The workspace owner already has access.');
      return;
    }

    setSavingAdd(true);
    try {
      const response = await addWorkspaceCollaborator(workspace.id, { identifier: trimmed }, token);
      if (!response.ok)
        throw new Error(await getResponseErrorMessage(response, 'Unable to add collaborator.'));
      const updated = await response.json();
      onWorkspaceUpdated(updated);
      setIdentifier('');
    } catch (err) {
      showError(err.message || 'Unable to add collaborator.');
    } finally {
      setSavingAdd(false);
    }
  };

  const handleRemove = async (collaborator) => {
    if (!workspace || !collaborator?.id || collaborator.id === owner?.id) return;

    setRemovingUserId(collaborator.id);
    try {
      const response = await removeWorkspaceCollaborator(workspace.id, collaborator.id, token);
      if (!response.ok)
        throw new Error(await getResponseErrorMessage(response, 'Unable to remove collaborator.'));
      const updated = await response.json();
      onWorkspaceUpdated(updated);
    } catch (err) {
      showError(err.message || 'Unable to remove collaborator.');
    } finally {
      setRemovingUserId(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          sx: {
            backgroundColor: 'var(--secondary-background-color)',
            color: 'var(--secondary-color)',
            border: '2.5px solid var(--background-color)',
            borderRadius: 1.5,
          },
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 'bold', pb: 1 }}>Share {workspace?.name}</DialogTitle>
      <Divider sx={insetDividerStyles} />
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <UserAccessSection
            title="Workspace Owner"
            users={owner ? [owner] : []}
            emptyMessage="No owner found."
          />

          <Divider sx={insetDividerStyles} />

          <UserAccessSection
            title="Collaborators"
            users={collaborators}
            emptyMessage="No collaborators yet."
            renderAction={(collaborator) =>
              isOwner ? (
                <IconButton
                  edge="end"
                  aria-label={`Remove ${userLabel(collaborator)}`}
                  onClick={() => handleRemove(collaborator)}
                  disabled={removingUserId === collaborator.id || savingAdd}
                  sx={{ color: 'var(--secondary-color)' }}
                >
                  <Delete />
                </IconButton>
              ) : null
            }
          />

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
                sx={textFieldStyles}
              />
              <Button
                variant="contained"
                startIcon={<PersonAdd />}
                onClick={handleAdd}
                disabled={!identifier.trim() || savingAdd || Boolean(removingUserId)}
                sx={{
                  bgcolor: 'var(--secondary-color)',
                  color: 'var(--text-color)',
                  '&:hover': { bgcolor: 'var(--background-color)' },
                }}
              >
                {savingAdd ? 'Adding...' : 'Add'}
              </Button>
            </Stack>
          ) : (
            <Alert severity="info" sx={alertStyles}>
              Only the workspace owner can add or remove collaborators.
            </Alert>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
