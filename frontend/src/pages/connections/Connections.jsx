import { useSessionGuard } from '../../hooks/useSession';
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router';
import {
  decideConsent,
  followOAuthCallback,
  loadConnections,
  loadConsent,
  revokeConnection,
} from '../../services/connectionsClient';

function ConnectionSurface({ title, children }) {
  return (
    <Stack spacing={2} sx={{ p: 3, mx: 'auto', maxWidth: 560, mt: 8 }}>
      <Typography variant="h4" sx={{ color: 'white', fontWeight: 'bold' }}>
        {title}
      </Typography>
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>{children}</Stack>
      </Paper>
    </Stack>
  );
}

export function OAuthConsent() {
  const isCurrentSession = useSessionGuard();
  const { search } = useLocation();
  const [consent, setConsent] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setConsent(null);
    setError('');
    loadConsent(search)
      .then((data) => {
        if (!active || !isCurrentSession()) return;
        if (data.redirect_url) followOAuthCallback(data.redirect_url);
        else setConsent(data);
      })
      .catch((err) => {
        if (active && isCurrentSession()) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [search, isCurrentSession]);

  const decide = async (decision) => {
    if (!isCurrentSession()) return;
    setBusy(true);
    setError('');
    try {
      const data = await decideConsent(consent.ticket, decision, search);
      if (isCurrentSession()) followOAuthCallback(data.redirect_url);
    } catch (err) {
      if (!isCurrentSession()) return;
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <ConnectionSurface title="Connect to Notoli">
      {error && <Alert severity="error">{error}</Alert>}
      {!consent && !error && <Typography role="status">Loading permissions…</Typography>}
      {consent && (
        <>
          <Typography variant="h6">{consent.application.name}</Typography>
          <Typography variant="body2">Application ID: {consent.application.client_id}</Typography>
          <Typography>Signed in as {consent.user.username}</Typography>
          <Typography>This application is requesting permission to:</Typography>
          <Box component="ul" sx={{ pl: 3, my: 0 }}>
            {consent.permissions.map((permission) => (
              <li key={permission.scope}>{permission.description}</li>
            ))}
          </Box>
          <Stack direction="row" spacing={2}>
            <Button disabled={busy} variant="outlined" onClick={() => decide('cancel')}>
              Cancel
            </Button>
            <Button disabled={busy} variant="contained" onClick={() => decide('allow')}>
              Allow
            </Button>
          </Stack>
        </>
      )}
    </ConnectionSurface>
  );
}

export default function ConnectedApps() {
  const isCurrentSession = useSessionGuard();
  const navigate = useNavigate();
  const [applications, setApplications] = useState(null);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState(null);

  useEffect(() => {
    let active = true;
    loadConnections()
      .then((data) => {
        if (active && isCurrentSession()) setApplications(data.applications);
      })
      .catch((err) => {
        if (active && isCurrentSession()) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [isCurrentSession]);

  const revoke = async (id) => {
    if (!isCurrentSession()) return;
    setRevoking(id);
    setError('');
    try {
      await revokeConnection(id);
      if (!isCurrentSession()) return;
      setApplications((apps) => apps.filter((app) => app.id !== id));
    } catch (err) {
      if (!isCurrentSession()) return;
      setError(err.message);
    } finally {
      if (isCurrentSession()) setRevoking(null);
    }
  };

  return (
    <ConnectionSurface title="Connected Apps">
      {error && <Alert severity="error">{error}</Alert>}
      {!applications && !error && <Typography role="status">Loading connected apps…</Typography>}
      {applications?.length === 0 && <Typography>No connected apps.</Typography>}
      {applications?.map((app) => (
        <Stack
          key={app.id}
          direction="row"
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 'bold' }}>{app.name}</Typography>
            <Typography variant="body2">{app.client_id}</Typography>
          </Box>
          <Button
            disabled={revoking !== null}
            onClick={() => revoke(app.id)}
            aria-label={`Revoke ${app.name}`}
          >
            Revoke
          </Button>
        </Stack>
      ))}
      <Button onClick={() => navigate('/')}>Back to Notoli</Button>
    </ConnectionSurface>
  );
}
