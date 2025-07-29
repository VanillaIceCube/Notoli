import {
  Snackbar,
  Alert
} from '@mui/material';

export default function Login() {
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const handleSnackbarClose = (_event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbarOpen(false);
  }

  return (
    <Snackbar
      open={snackbarOpen}
      autoHideDuration={3000}
      onClose={handleSnackbarClose}
      anchorOrigin={{ vertical:'bottom', horizontal:'right' }}
    >
      <Alert sx={{ width:'100%' }}
        onClose={handleSnackbarClose}
        severity={snackbarSeverity}
      >
        {snackbarMessage}
    </Alert>
    </Snackbar>
  );
}