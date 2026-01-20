import React, { useState } from 'react';
import { TextField, Button, Typography, Box, Paper, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { register } from '../../services/backendClient';

export default function Register({ showSnackbar }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const navigate = useNavigate();

  const handleRegister = async () => {
    try {
      const response = await register({ email, username, password });

      if (!response.ok) {
        let message = 'Registration failed :(';
        try {
          const data = await response.json();
          message = data?.error || data?.detail || message;
        } catch {
          // ignore json parsing errors
        }
        throw new Error(message);
      }

      let data = {};
      try {
        data = await response.json();
      } catch {
        // ignore json parsing errors
      }

      if (data?.access && data?.refresh) {
        sessionStorage.setItem('accessToken', data.access);
        sessionStorage.setItem('refreshToken', data.refresh);
      }

      showSnackbar('success', 'Account created! Welcome to Notoli!');
      if (data?.workspace_id) {
        navigate(`/workspace/${data.workspace_id}`);
      } else {
        navigate('/');
      }
    } catch (err) {
      const isNetworkError =
        err instanceof TypeError ||
        (typeof err?.message === 'string' && err.message.toLowerCase().includes('network'));
      showSnackbar(
        'error',
        isNetworkError ? 'Network error :(' : err?.message || 'Registration failed :(',
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
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          onSubmit={(e) => {
            e.preventDefault();
            handleRegister();
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
            label="Username (optional)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
              Register
            </Typography>
          </Button>
          <Typography
            variant="caption"
            sx={{ color: 'var(--secondary-color)', textAlign: 'center', width: '100%' }}
          >
            Already have an account?{' '}
            <Box
              component="span"
              sx={{ textDecoration: 'underline', cursor: 'pointer' }}
              onClick={() => navigate('/login')}
            >
              Sign in now!
            </Box>
          </Typography>
        </Box>
      </Paper>
    </Stack>
  );
}
