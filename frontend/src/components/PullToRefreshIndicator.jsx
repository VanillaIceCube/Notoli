import { Box } from '@mui/material';
import Refresh from '@mui/icons-material/Refresh';

const FULL_PULL_DISTANCE = 84;
const ACTIVE_SPIN_DURATION_MS = 1400;
const ACTIVE_SPIN_START_DELAY_MS = -(ACTIVE_SPIN_DURATION_MS * 0.75);

export default function PullToRefreshIndicator({ pullDistance, refreshReady, isRefreshing }) {
  const active = isRefreshing || pullDistance > 0;
  const ariaLabel = isRefreshing
    ? 'Refreshing'
    : refreshReady
      ? 'Release to refresh'
      : 'Pull to refresh';
  const pullProgress = Math.min(pullDistance / FULL_PULL_DISTANCE, 1);
  const pullRotation = Math.round(pullProgress * 270);
  // One in-flow spacer owns the entire pull displacement. Do not also translate
  // the page or change its padding: those independent motions jump on release.
  const height = isRefreshing ? 40 : Math.min(pullDistance / 2.5, 40);

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
        height,
        flexShrink: 0,
        overflow: 'hidden',
        transition: pullDistance > 0 ? 'none' : 'height 180ms ease-out',
      }}
    >
      <Box
        sx={{
          width: 30,
          height: 30,
          flexShrink: 0,
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
            animation: isRefreshing
              ? `notoliRefreshSpin ${ACTIVE_SPIN_DURATION_MS}ms linear infinite ${ACTIVE_SPIN_START_DELAY_MS}ms`
              : 'none',
          },
        }}
      >
        <Refresh />
      </Box>
    </Box>
  );
}
