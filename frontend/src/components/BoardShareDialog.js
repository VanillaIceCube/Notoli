import React, { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import Delete from '@mui/icons-material/Delete';
import PersonAdd from '@mui/icons-material/PersonAdd';
import { addBoardCollaborator, removeBoardCollaborator } from '../services/notoliApiClient';
import { getResponseErrorMessage } from '../services/authSession';

const userLabel = (user) =>
  user?.display_name || user?.username || user?.email || `User ${user?.id}`;
const userEmail = (user) => user?.email || '';
const userInitials = (user) => {
  const base = userLabel(user).trim();
  return (base || '?').slice(0, 2).toUpperCase();
};

const textFieldStyles = {
  '& .MuiInputBase-root': {
    color: 'var(--secondary-color)',
    bgcolor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 2,
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--secondary-color)',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--secondary-color)',
  },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--secondary-color)',
    borderWidth: 2,
  },
};

function AccessRow({ user, role, canRemove, removing, saving, onRemove }) {
  const label = userLabel(user);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '40px minmax(0, 1fr) auto auto',
        alignItems: 'center',
        columnGap: 1.5,
        py: 1.25,
      }}
    >
      <Avatar
        sx={{
          width: 36,
          height: 36,
          bgcolor: 'var(--secondary-color)',
          color: 'var(--secondary-background-color)',
          fontSize: '0.82rem',
          fontWeight: 'bold',
        }}
      >
        {userInitials(user)}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="body2"
          sx={{
            color: 'var(--secondary-color)',
            fontWeight: 'bold',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'var(--secondary-color)',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {userEmail(user) || 'No email on file'}
        </Typography>
      </Box>
      <Chip
        label={role}
        size="small"
        variant={role === 'Owner' ? 'filled' : 'outlined'}
        sx={{
          borderColor: 'var(--secondary-color)',
          bgcolor: role === 'Owner' ? 'rgba(85, 85, 85, 0.16)' : 'transparent',
          color: 'var(--secondary-color)',
          fontWeight: 'bold',
          height: 24,
        }}
      />
      {canRemove ? (
        <IconButton
          size="small"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          disabled={removing || saving}
          sx={{ color: 'var(--secondary-color)' }}
        >
          <Delete fontSize="small" />
        </IconButton>
      ) : (
        <Box sx={{ width: 34 }} />
      )}
    </Box>
  );
}

export default function BoardShareDialog({
  open,
  board,
  token,
  onClose,
  onExited,
  onBoardUpdated,
  showSnackbar,
}) {
  const [identifier, setIdentifier] = useState('');
  const [savingAdd, setSavingAdd] = useState(false);
  const [removingUserId, setRemovingUserId] = useState(null);

  const owner = board?.owner_details;
  const collaborators = useMemo(() => board?.collaborators_details || [], [board]);
  const currentUsername = sessionStorage.getItem('username');
  const currentEmail = sessionStorage.getItem('email');
  const isOwner = Boolean(
    owner &&
    ((currentUsername && owner.username === currentUsername) ||
      (currentEmail && owner.email === currentEmail)),
  );
  const people = [
    ...(owner ? [{ user: owner, role: 'Owner' }] : []),
    ...collaborators.map((collaborator) => ({ user: collaborator, role: 'Collaborator' })),
  ];

  const showError = (message) => {
    showSnackbar?.('error', message);
  };

  const handleAdd = async () => {
    const trimmed = identifier.trim();
    if (!trimmed || !board || !isOwner) return;

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
      showError('The board owner already has access.');
      return;
    }

    setSavingAdd(true);
    try {
      const response = await addBoardCollaborator(board.id, { identifier: trimmed }, token);
      if (!response.ok)
        throw new Error(await getResponseErrorMessage(response, 'Unable to add collaborator.'));
      const updated = await response.json();
      onBoardUpdated(updated);
      setIdentifier('');
    } catch (err) {
      showError(err.message || 'Unable to add collaborator.');
    } finally {
      setSavingAdd(false);
    }
  };

  const handleRemove = async (collaborator) => {
    if (!board || !collaborator?.id || collaborator.id === owner?.id || !isOwner) return;

    setRemovingUserId(collaborator.id);
    try {
      const response = await removeBoardCollaborator(board.id, collaborator.id, token);
      if (!response.ok)
        throw new Error(await getResponseErrorMessage(response, 'Unable to remove collaborator.'));
      const updated = await response.json();
      onBoardUpdated(updated);
    } catch (err) {
      showError(err.message || 'Unable to remove collaborator.');
    } finally {
      setRemovingUserId(null);
    }
  };

  if (!board) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={false}
      slotProps={{
        transition: { onExited },
        paper: {
          sx: {
            width: 'min(480px, calc(100vw - 32px))',
            bgcolor: 'var(--secondary-background-color)',
            color: 'var(--secondary-color)',
            border: '2.5px solid var(--background-color)',
            borderRadius: 2,
            boxShadow: '0 18px 50px rgba(0,0,0,0.22)',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          px: 3,
          pt: 2.5,
          pb: 1,
          color: 'var(--secondary-color)',
          fontWeight: 'bold',
        }}
      >
        <Typography component="span" variant="h6" fontWeight="bold" noWrap>
          Share "{board?.name}"
        </Typography>
        <IconButton aria-label="Close sharing dialog" onClick={onClose} size="small">
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Divider sx={{ mx: 3, borderColor: 'var(--secondary-color)', opacity: 0.45 }} />
      <DialogContent sx={{ px: 3, pt: 1.5, pb: 2.75 }}>
        <Stack spacing={2.25}>
          {isOwner ? (
            <Box>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
                Invite a collaborator
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Username or email address"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleAdd();
                  }}
                  disabled={savingAdd || Boolean(removingUserId)}
                  sx={textFieldStyles}
                  slotProps={{
                    htmlInput: {
                      'aria-label': 'Username or email address',
                    },
                  }}
                />
                <Button
                  variant="contained"
                  startIcon={<PersonAdd />}
                  onClick={handleAdd}
                  disabled={!identifier.trim() || savingAdd || Boolean(removingUserId)}
                  sx={{
                    minWidth: { xs: '100%', sm: 92 },
                    bgcolor: 'var(--secondary-color)',
                    color: 'var(--text-color)',
                    '&:hover': { bgcolor: 'var(--background-color)' },
                  }}
                >
                  {savingAdd ? 'Adding...' : 'Add'}
                </Button>
              </Stack>
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: 'var(--secondary-color)' }}>
              Sharing is read-only for collaborators.
            </Typography>
          )}

          <Box>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
              People with access
            </Typography>
            <Divider sx={{ borderColor: 'var(--secondary-color)', opacity: 0.45 }} />
            {people.length ? (
              <Box sx={{ py: 0.25 }}>
                {people.map(({ user, role }) => (
                  <AccessRow
                    key={`${role}-${user?.id}`}
                    user={user}
                    role={role}
                    saving={savingAdd}
                    removing={removingUserId === user?.id}
                    canRemove={role === 'Collaborator' && isOwner}
                    onRemove={() => handleRemove(user)}
                  />
                ))}
              </Box>
            ) : (
              <Typography sx={{ py: 1.25, color: 'var(--secondary-color)' }}>
                No people have access yet.
              </Typography>
            )}
            <Divider sx={{ borderColor: 'var(--secondary-color)', opacity: 0.45 }} />
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
