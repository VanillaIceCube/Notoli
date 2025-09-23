import { useState } from 'react';
import axios from 'axios';
import {
  TextField,
  Button,
  Typography,
  Container,
  Box,
  Paper
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function Login({ showSnackbar }) {
  // Basics
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const navigate = useNavigate();

  // Login function
  const handleLogin = async () => {
    try {
      const { data } = await axios.post('http://localhost:8000/auth/login/', {
        username,
        password,
      });

      // Save tokens
      sessionStorage.setItem('accessToken', data.access);
      sessionStorage.setItem('refreshToken', data.refresh);

      // Update Snackbar
      showSnackbar('success', 'Login successful!');

      navigate('/')
    } catch (err) {

      // Update Snackbar
      showSnackbar('error', 'Login failed :(');
      console.error(err);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh' }}>
      <Paper elevation={3} sx={{ p:4, width:'100%', background:'var(--secondary-background-color)'}}>
        <Box component="form" sx={{ display:'flex', flexDirection:'column', gap:2 }}
          onSubmit={e => { e.preventDefault(); handleLogin(); }}
        >
          <TextField fullWidth sx={{background: 'white'}}
            label="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          <TextField fullWidth sx={{background: 'white'}}
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <Button fullWidth sx={{ backgroundColor: 'var(--secondary-color)' }}
            type="submit"
            variant="contained"
          >
            <Typography variant="h5" align="center">
              Login
            </Typography>
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}
