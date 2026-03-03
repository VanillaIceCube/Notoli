import React, { useMemo, useState } from 'react';
import { TextField, Button, Typography, Box, Paper, Stack } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { resetPassword } from '../../services/notoliApiClient';
import { readOkJson } from '../../services/authSession';

export default function ResetPassword({ showSnackbar }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const uid = params.get('uid') || '';
  const token = params.get('token') || '';
  const missingResetParams = !uid || !token;

  const handleSubmit = async () => {
    if (missingResetParams) {
      showSnackbar('error', 'Invalid or expired reset link.');
      return;
    }

    if (!password || password !== confirmPassword) {
      showSnackbar('error', 'Passwords do not match.');
      return;
    }

    try {
      const response = await resetPassword({ uid, token, password });
      const data = await readOkJson(response, 'Password reset failed :(');
      showSnackbar('success', data?.message || 'Password reset successful.');
      navigate('/login');
    } catch (err) {
      const isNetworkError =
        err instanceof TypeError ||
        (typeof err?.message === 'string' && err.message.toLowerCase().includes('network'));
      showSnackbar(
        'error',
        isNetworkError ? 'Network error :(' : err?.message || 'Password reset failed :(',
      );
      console.error(err);
    }
  };

  return (
    <Stack
      spacing={2}
      alignItems="center"
      maxWidth="sm"
      sx={{
        p: 5.5,
        mx: 'auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '85vh',
      }}
    >
      <Typography variant="h3" sx={{ mt: 2, fontWeight: 'bold', color: 'white' }}>
        notoli
      </Typography>
      <Paper
        elevation={3}
        sx={{ p: 4, pb: 2, width: '100%', background: 'var(--secondary-background-color)' }}
      >
        <Box
          component="form"
          autoComplete="on"
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <TextField
            fullWidth
            sx={{ background: 'white' }}
            label="New Password"
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <TextField
            fullWidth
            sx={{ background: 'white' }}
            label="Confirm Password"
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <Button
            fullWidth
            sx={{ backgroundColor: 'var(--secondary-color)' }}
            type="submit"
            variant="contained"
          >
            <Typography variant="h6" align="center">
              Reset Password
            </Typography>
          </Button>
          <Typography
            variant="caption"
            sx={{ color: 'var(--secondary-color)', textAlign: 'center', width: '100%' }}
          >
            Back to{' '}
            <Box
              component="span"
              sx={{ textDecoration: 'underline', cursor: 'pointer' }}
              onClick={() => navigate('/login')}
            >
              Login
            </Box>
          </Typography>
        </Box>
      </Paper>
    </Stack>
  );
}
