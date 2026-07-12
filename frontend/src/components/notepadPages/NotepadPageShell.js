// Shared notepad page frame for title, pull-to-refresh offset, loading/error states, and row content.
import { Box, Container, Paper, Skeleton, Stack, Typography } from '@mui/material';
import Divider from '@mui/material/Divider';
import PullToRefreshIndicator from '../PullToRefreshIndicator';

const skeletonWaveSx = {
  bgcolor: 'rgba(85, 85, 85, 0.18)',
  '&::after': {
    background:
      'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.28), transparent)',
  },
  '@media (prefers-reduced-motion: reduce)': {
    animation: 'none',
    '&::after': { animation: 'none' },
  },
};

function NotepadLoadingSkeleton() {
  const rowWidths = ['78%', '64%', '72%'];

  return (
    <Stack
      spacing={1}
      role="status"
      aria-label="Loading content"
      data-testid="notepad-loading-skeleton"
    >
      {rowWidths.map((width) => (
        <Box
          key={width}
          sx={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 52,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            bgcolor: 'var(--secondary-background-color)',
            borderBottom: '2px solid rgba(85, 85, 85, 0.42)',
            boxSizing: 'border-box',
          }}
        >
          <Skeleton
            variant="circular"
            animation="wave"
            width={24}
            height={24}
            sx={{ ...skeletonWaveSx, mr: 1.5, flex: '0 0 auto' }}
          />
          <Skeleton
            variant="rounded"
            animation="wave"
            width={width}
            height={22}
            sx={{ ...skeletonWaveSx, borderRadius: 1 }}
          />
          <Skeleton
            variant="circular"
            animation="wave"
            width={24}
            height={24}
            sx={{ ...skeletonWaveSx, ml: 'auto', flex: '0 0 auto' }}
          />
        </Box>
      ))}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 52,
          px: 1,
          py: 0.5,
          borderRadius: 1,
          bgcolor: 'var(--secondary-background-color)',
          boxSizing: 'border-box',
        }}
        aria-hidden="true"
      >
        <Skeleton
          variant="circular"
          animation="wave"
          width={24}
          height={24}
          sx={{ ...skeletonWaveSx, mr: 1.5, flex: '0 0 auto' }}
        />
        <Skeleton
          variant="rounded"
          animation="wave"
          width="34%"
          height={22}
          sx={{ ...skeletonWaveSx, borderRadius: 1 }}
        />
      </Box>
    </Stack>
  );
}

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

          {error && (
            <Typography color="error" align="center">
              Error: {error}
            </Typography>
          )}

          <Divider
            sx={{ borderBottomWidth: 2, marginBottom: 1, bgcolor: 'var(--secondary-color)' }}
          />
          {showLoading && <NotepadLoadingSkeleton />}
          {showContent && <Stack spacing={1}>{children}</Stack>}
        </Box>
      </Paper>
    </Container>
  );
}
