import { Typography, Container, Paper } from '@mui/material';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';

export default function TodoLists() {
  return (
    <Container
      maxWidth="sm"
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'top',
        py: 2
      }}
    >
      <Paper elevation={3} sx={{ p: 2, width: '100%' }}>
        <Typography variant="h5" align="center" gutterBottom>
          Todo Lists
        </Typography>
        <Stack spacing={2}>
          <Card
            sx={{
              display: 'flex',
              alignItems: 'center',
              p: 1,
            }}
          >
            <Typography> Hubby & Wifey </Typography>
          </Card>
        </Stack>
      </Paper>
    </Container>
  );
}
