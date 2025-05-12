import { Typography, Container, Paper } from '@mui/material';

export default function HomePage() {
  return (
    <Container maxWidth="sm" sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      mx: 'auto', 
      }}
    >
      <Paper elevation={3} sx={{ padding: 4 }}>
        <Typography variant="h5" component="h1" align="center">
          Welcome to the Home Page!
        </Typography>
      </Paper>
    </Container>
  );
}
