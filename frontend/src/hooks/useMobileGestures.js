import { useCallback, useRef, useState } from 'react';

const MOBILE_MAX_WIDTH = 768;
const MAX_HORIZONTAL_DRIFT_PX = 44;
const PULL_REFRESH_PX = 84;
const PULL_READY_PX = 52;

function isMobileTouchViewport() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= MOBILE_MAX_WIDTH && navigator.maxTouchPoints !== 0;
}

function isInteractiveTarget(target) {
  return Boolean(
    target?.closest?.(
      [
        'input',
        'textarea',
        'select',
        'button',
        '[contenteditable="true"]',
        '[role="button"]',
        '[role="menu"]',
        '[role="menuitem"]',
        '[role="dialog"]',
        '.MuiModal-root',
      ].join(','),
    ),
  );
}

export function usePullToRefresh({ enabled = true, onRefresh }) {
  const touchStartRef = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);

  const resetPull = useCallback(() => setPullDistance(0), []);

  const onTouchStart = useCallback(
    (event) => {
      if (!enabled || !onRefresh || !isMobileTouchViewport() || isInteractiveTarget(event.target)) {
        touchStartRef.current = null;
        resetPull();
        return;
      }

      const touch = event.touches?.[0];
      if (!touch || window.scrollY > 0) {
        touchStartRef.current = null;
        resetPull();
        return;
      }

      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    },
    [enabled, onRefresh, resetPull],
  );

  const onTouchMove = useCallback(
    (event) => {
      const start = touchStartRef.current;
      const touch = event.touches?.[0];
      if (!start || !touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (deltaY <= 0 || Math.abs(deltaX) > MAX_HORIZONTAL_DRIFT_PX) {
        resetPull();
        return;
      }

      setPullDistance(Math.min(deltaY, PULL_REFRESH_PX));
    },
    [resetPull],
  );

  const onTouchEnd = useCallback(() => {
    const shouldRefresh = pullDistance >= PULL_REFRESH_PX;
    touchStartRef.current = null;
    resetPull();

    if (shouldRefresh) {
      onRefresh();
    }
  }, [onRefresh, pullDistance, resetPull]);

  return {
    pullDistance,
    refreshReady: pullDistance >= PULL_READY_PX,
    touchHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
    },
  };
}
