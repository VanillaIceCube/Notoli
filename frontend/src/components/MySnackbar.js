import { Snackbar, Alert } from '@mui/material';

export default function MySnackbar({
  open,
  severity,
  message,
  onClose
}) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={3600}
      onClose={onClose}
      anchorOrigin={{ vertical:'bottom', horizontal:'right' }}
    >
      <Alert
        sx={{ width:'100%' }}
        onClose={onClose}
        severity={severity}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
