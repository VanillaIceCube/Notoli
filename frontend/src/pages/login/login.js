import { useState } from 'react';
import { TextField, Button, Typography, Container, Box, Paper } from '@mui/material';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <Container maxWidth="sm">
      <Paper elevation={3} sx={{ padding: 4}}>
        <Typography variant="h5" component="h1" align="center" gutterBottom>
          Login
        </Typography>
        <Box
          component="form"
          noValidate
          autoComplete="off"
          onSubmit={(e) => e.preventDefault()}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <TextField
            label="Email"
            type="email"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            variant="contained"
            color="primary"
            fullWidth
            onClick={() => {
              // TODO: Add login logic here
            }}
          >
            Log In
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}
