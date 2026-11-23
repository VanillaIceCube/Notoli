import { Box, Button, Link, Paper, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';

export function AuthLink({ to, children }) {
  return (
    <Link component={RouterLink} to={to} underline="always" sx={{ color: 'inherit' }}>
      {children}
    </Link>
  );
}

export default function AuthForm({ title, onSubmit, isSubmitting, submitLabel, footer, children }) {
  return (
    <Stack
      spacing={2}
      sx={{
        maxWidth: 'sm',
        p: 5.5,
        mx: 'auto',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '85vh',
      }}
    >
      <Typography variant="h3" sx={{ mt: 2, fontWeight: 'bold', color: 'white' }}>
        notoli
      </Typography>
      <Paper elevation={3} sx={{ p: 4, pb: 2, width: '100%' }}>
        <Box
          component="form"
          aria-label={title}
          autoComplete="on"
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {children}
          <Button fullWidth type="submit" disabled={isSubmitting} variant="contained">
            <Typography variant="h5" align="center">
              {submitLabel}
            </Typography>
          </Button>
          <Typography
            variant="caption"
            sx={{
              mt: 0.25,
              pt: 0.75,
              borderTop: '1px solid rgba(0,0,0,0.2)',
              textAlign: 'center',
              color: 'var(--secondary-color)',
            }}
          >
            {footer}
          </Typography>
        </Box>
      </Paper>
    </Stack>
  );
}
