import React, { useState, useEffect, useCallback } from 'react';
import { TextField, Button, Typography, Box, Paper, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { fetchWorkspaces as fetchWorkspacesApi, login } from '../../services/BackendClient';

export default function Login({ showSnackbar }) {
  // Basics
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const navigate = useNavigate();

  // Pull Workspace List
  const fetchWorkspaces = useCallback(
    async (token, showError) => {
      try {
        const response = await fetchWorkspacesApi(token);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data;
      } catch (err) {
        if (showError) {
          const isHttpError = typeof err?.message === 'string' && err.message.startsWith('HTTP ');
          showSnackbar('error', isHttpError ? 'Workspace load failed :(' : 'Network error :(');
        }
        return [];
      }
    },
    [showSnackbar],
  );

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Login function
  const handleLogin = async () => {
    try {
      const response = await login({ email: email.trim(), password });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Save tokens
      sessionStorage.setItem('accessToken', data.access);
      sessionStorage.setItem('refreshToken', data.refresh);

      // Update Snackbar
      showSnackbar('success', 'Login successful!');

      // Navigate to first Workspace, if empty, navigate to root
      const workspaces = await fetchWorkspaces(data.access, true);
      if (workspaces.length > 0) {
        navigate(`/workspace/${Math.min(...workspaces.map((ws) => ws.id))}`);
      } else {
        navigate('/');
      }
    } catch (err) {
      // Update Snackbar
      const isNetworkError =
        err instanceof TypeError ||
        (typeof err?.message === 'string' && err.message.toLowerCase().includes('network'));
      showSnackbar('error', isNetworkError ? 'Network error :(' : 'Login failed :(');
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
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <TextField
            fullWidth
            sx={{ background: 'white' }}
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            fullWidth
            sx={{ background: 'white' }}
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            fullWidth
            sx={{ backgroundColor: 'var(--secondary-color)' }}
            type="submit"
            variant="contained"
          >
            <Typography variant="h5" align="center">
              Login
            </Typography>
          </Button>
          <Typography
            variant="caption"
            sx={{ color: 'var(--secondary-color)', textAlign: 'center', width: '100%' }}
          >
            Need an account?{' '}
            <Box
              component="span"
              sx={{ textDecoration: 'underline', cursor: 'pointer' }}
              onClick={() => navigate('/register')}
            >
              Register here!
            </Box>
          </Typography>
        </Box>
      </Paper>
    </Stack>
  );
}
