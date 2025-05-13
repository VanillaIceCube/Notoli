import { useState } from 'react';
import axios from 'axios';
import {
  TextField,
  Button,
  Typography,
  Container,
  Box,
  Paper,
  Snackbar,
  Alert,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  // Username & pasword
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Snackbar states
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const navigate = useNavigate();

  // Login function
  const handleLogin = async () => {
    try {
      const { data } = await axios.post('http://localhost:8000/auth/login/', {
        username,
        password,
      });

      // Save tokens
      localStorage.setItem('accessToken', data.access);
      localStorage.setItem('refreshToken', data.refresh);

      // Sucess state
      setSnackbarSeverity('success');
      setSnackbarMessage('Login successful!');
      setSnackbarOpen(true);

      setTimeout(() => navigate('/'), 1000);
    } catch (err) {
      console.error(err);

      // Failure state
      setSnackbarSeverity('error');
      setSnackbarMessage('Login failed :(');
      setSnackbarOpen(true);
    }
  };

  // Snackbar function
  const handleSnackbarClose = (_event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbarOpen(false);
  };

  return (
    <Container maxWidth="sm" sx={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh' }}>
      <Paper elevation={3} sx={{ p:4, width:'100%' }}>
        <Typography variant="h5" align="center" gutterBottom>
          Login
        </Typography>

        <Box
          component="form"
          onSubmit={e => { e.preventDefault(); handleLogin(); }}
          sx={{ display:'flex', flexDirection:'column', gap:2 }}
        >
          <TextField
            label="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            fullWidth
          />
          <Button type="submit" variant="contained" fullWidth>
            Log In
          </Button>
        </Box>
      </Paper>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical:'bottom', horizontal:'right' }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbarSeverity}
          sx={{ width:'100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
}
