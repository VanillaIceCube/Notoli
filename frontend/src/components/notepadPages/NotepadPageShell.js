// Shared notepad page frame for title, pull-to-refresh offset, loading/error states, and row content.
import { Box, Container, Paper, Stack, Typography } from '@mui/material';
import Divider from '@mui/material/Divider';
import PullToRefreshIndicator from '../PullToRefreshIndicator';

export default function NotepadPageShell({
  title,
  loading,
  error,
  hasContent = false,
  pullDistance,
  refreshReady,
  isRefreshing,
  pullContentOffset,
  children,
}) {
  const showLoading = loading && !hasContent;
  const showContent = hasContent || (!loading && !error);

  return (
    <Container
      maxWidth="sm"
      sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', py: 2, pt: 0.5 }}
    >
      <Paper
        elevation={3}
        sx={{
          px: 1.5,
          pt: 1.5,
          pb: `calc(12px + ${pullContentOffset}px)`,
          width: '100%',
          background: 'var(--secondary-background-color)',
        }}
      >
        <Box
          sx={{
            transform: `translateY(${pullContentOffset}px)`,
            transition: pullDistance > 0 ? 'none' : 'transform 180ms ease-out',
          }}
        >
          <PullToRefreshIndicator
            pullDistance={pullDistance}
            refreshReady={refreshReady}
            isRefreshing={isRefreshing}
          />
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}
          >
            <Box sx={{ width: 40 }} />
            <Typography
              variant="h4"
              align="center"
              gutterBottom
              sx={{ fontWeight: 'bold', color: 'var(--secondary-color)' }}
            >
              {title}
            </Typography>
            <Box sx={{ width: 40 }} />
          </Box>

          {showLoading && <Typography align="center"> Loading... </Typography>}

          {error && (
            <Typography color="error" align="center">
              Error: {error}
            </Typography>
          )}

          <Divider
            sx={{ borderBottomWidth: 2, marginBottom: 1, bgcolor: 'var(--secondary-color)' }}
          />
          {showContent && <Stack spacing={1}>{children}</Stack>}
        </Box>
      </Paper>
    </Container>
  );
}
