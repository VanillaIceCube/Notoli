import React, { useState } from 'react';
import { TextField, Button, Typography, Box, Paper, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { forgotPassword } from '../../services/notoliApiClient';
import { readOkJson } from '../../services/authSession';

export default function ForgotPassword({ showSnackbar }) {
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async () => {
    try {
      const response = await forgotPassword({ email: email.trim() });
      const data = await readOkJson(response, 'Password reset request failed :(');
      showSnackbar(
        'success',
        data?.message || 'If that account exists, we sent a password reset link.',
      );
      navigate('/login');
    } catch (err) {
      const isNetworkError =
        err instanceof TypeError ||
        (typeof err?.message === 'string' && err.message.toLowerCase().includes('network'));
      showSnackbar(
        'error',
        isNetworkError ? 'Network error :(' : err?.message || 'Password reset request failed :(',
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
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            fullWidth
            sx={{ backgroundColor: 'var(--secondary-color)' }}
            type="submit"
            variant="contained"
          >
            <Typography variant="h6" align="center">
              Send Reset Link
            </Typography>
          </Button>
          <Box
            sx={{
              mt: 0.25,
              pt: 0.75,
              borderTop: '1px solid rgba(0,0,0,0.2)',
              textAlign: 'center',
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: 'var(--secondary-color)', textAlign: 'center', width: '100%' }}
            >
              <Box
                component="span"
                sx={{ textDecoration: 'underline', cursor: 'pointer' }}
                onClick={() => navigate('/login')}
              >
                Back to Login
              </Box>
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Stack>
  );
}
