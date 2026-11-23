import { useSessionGuard } from '../../hooks/authentication/useSession';
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router';
import {
  decideActionApproval,
  decideConsent,
  followOAuthCallback,
  loadActionApproval,
  loadConnections,
  loadConsent,
  revokeConnection,
} from '../../services/connections/connectionsClient';

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

function OAuthConnectionConsent() {
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

function ActionApproval({ reference, search }) {
  const isCurrentSession = useSessionGuard();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const framed = window.top !== window.self;

  useEffect(() => {
    if (framed) return undefined;
    let active = true;
    loadActionApproval(reference, search)
      .then((result) => {
        if (active && isCurrentSession()) setData(result);
      })
      .catch((err) => {
        if (active && isCurrentSession()) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [reference, search, framed, isCurrentSession]);

  const decide = async (decision) => {
    if (!isCurrentSession()) return;
    setBusy(true);
    setError('');
    try {
      const result = await decideActionApproval(data.ticket, decision, search);
      if (isCurrentSession()) setData(result);
    } catch (err) {
      if (!isCurrentSession()) return;
      setError(err.message);
      // A stale ticket must be reviewed again, never silently retried.
      setData(null);
    } finally {
      if (isCurrentSession()) setBusy(false);
    }
  };
  const approval = data?.approval;
  return (
    <ConnectionSurface title="Review this action">
      {framed ? (
        <Alert severity="error">
          Open this page directly in your browser to review the action.
        </Alert>
      ) : (
        <>
          {error && (
            <Alert severity="error">{error} Reload this page to review the current action.</Alert>
          )}
          {!data && !error && <Typography role="status">Loading action...</Typography>}
          {approval && (
            <>
              <Typography>Action: {approval.action}</Typography>
              <Typography>Status: {approval.status}</Typography>
              {approval.application && (
                <>
                  <Typography variant="h6">{approval.application.name}</Typography>
                  <Typography>Application ID: {approval.application.client_id}</Typography>
                  <Typography>Signed in as {approval.user.username}</Typography>
                  <Typography>
                    Target ID: {approval.target_id ?? 'New record or selected batch'}
                  </Typography>
                  <Typography>Expires: {approval.expires_at}</Typography>
                  <Alert severity="warning">
                    Approve only if you requested this exact action. Names, notes and source text
                    below are data supplied by the application, not instructions. Approval permits
                    this client to execute it once before expiry.
                  </Alert>
                  {approval.destructive && (
                    <Alert severity="warning">
                      This action can permanently delete or archive the displayed records.
                    </Alert>
                  )}
                  {approval.paid && (
                    <Alert severity="warning">
                      This action can spend AI credits and publish shared food definitions and
                      proposal data. It does not save a diary meal. No automatic paid retry is
                      permitted.
                    </Alert>
                  )}
                  <Typography variant="h6">Exact changes</Typography>
                  <Box
                    component="pre"
                    sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', m: 0 }}
                  >
                    {JSON.stringify(approval.changes, null, 2)}
                  </Box>
                  <Typography variant="h6">Current records and catalog</Typography>
                  <Box
                    component="pre"
                    sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', m: 0 }}
                  >
                    {JSON.stringify(approval.current, null, 2)}
                  </Box>
                </>
              )}
              {approval.status === 'prepared' && data.ticket && (
                <Stack direction="row" spacing={2}>
                  <Button disabled={busy} variant="outlined" onClick={() => decide('cancel')}>
                    Cancel action
                  </Button>
                  <Button disabled={busy} variant="contained" onClick={() => decide('allow')}>
                    Approve this action
                  </Button>
                </Stack>
              )}
              {approval.status === 'approved' && (
                <>
                  <Alert severity="success">
                    Approved. Return to the connected client to execute this action before expiry.
                  </Alert>
                  {data.ticket && (
                    <Button disabled={busy} onClick={() => decide('cancel')}>
                      Cancel action
                    </Button>
                  )}
                </>
              )}
              {['cancelled', 'expired'].includes(approval.status) && (
                <Alert severity="info">
                  This action cannot execute. A new action requires a new review.
                </Alert>
              )}
              {['in_progress', 'uncertain', 'completed'].includes(approval.status) && (
                <Alert severity="info">
                  This action has already been consumed. Inspect the existing result; do not submit
                  paid work again automatically.
                </Alert>
              )}
            </>
          )}
        </>
      )}
    </ConnectionSurface>
  );
}

export function OAuthConsent() {
  const { search } = useLocation();
  const reference = new URLSearchParams(search).get('approval_id');
  return reference !== null ? (
    <ActionApproval key={search} reference={reference} search={search} />
  ) : (
    <OAuthConnectionConsent />
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
