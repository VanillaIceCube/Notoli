import { Box } from '@mui/material';
import Refresh from '@mui/icons-material/Refresh';

const FULL_PULL_DISTANCE = 84;

export default function PullToRefreshIndicator({ pullDistance, refreshReady, isRefreshing }) {
  const active = isRefreshing || pullDistance > 0;
  const ariaLabel = isRefreshing
    ? 'Refreshing'
    : refreshReady
      ? 'Release to refresh'
      : 'Pull to refresh';
  const pullProgress = Math.min(pullDistance / FULL_PULL_DISTANCE, 1);
  const pullRotation = refreshReady ? 360 : Math.round(pullProgress * 270);

  return (
    <Box
      data-testid="pull-to-refresh-indicator"
      role={active ? 'status' : undefined}
      aria-label={active ? ariaLabel : undefined}
      aria-hidden={active ? undefined : true}
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: active ? 32 : 0,
        mb: active ? 1 : 0,
        overflow: 'hidden',
        transition: 'height 120ms ease, margin-bottom 120ms ease',
      }}
    >
      <Box
        sx={{
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--secondary-color)',
          opacity: active ? 1 : 0,
          transition: 'opacity 120ms ease',
          '@keyframes notoliRefreshSpin': {
            from: { transform: 'rotate(0deg)' },
            to: { transform: 'rotate(360deg)' },
          },
          '& svg': {
            fontSize: 28,
            transform: isRefreshing ? undefined : `rotate(${pullRotation}deg)`,
            transition: isRefreshing ? 'none' : 'transform 80ms linear',
            animation: isRefreshing ? 'notoliRefreshSpin 750ms linear infinite' : 'none',
          },
        }}
      >
        <Refresh />
      </Box>
    </Box>
  );
}
