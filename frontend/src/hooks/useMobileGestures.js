import { useCallback, useEffect, useRef, useState } from 'react';

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
  const pullDistanceRef = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const updatePullDistance = useCallback((distance) => {
    pullDistanceRef.current = distance;
    setPullDistance(distance);
  }, []);

  const resetPull = useCallback(() => updatePullDistance(0), [updatePullDistance]);

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

      event.preventDefault?.();
      updatePullDistance(Math.min(deltaY, PULL_REFRESH_PX));
    },
    [resetPull, updatePullDistance],
  );

  const onTouchEnd = useCallback(() => {
    const shouldRefresh = pullDistanceRef.current >= PULL_REFRESH_PX;
    touchStartRef.current = null;
    resetPull();

    if (shouldRefresh) {
      setIsRefreshing(true);
      Promise.resolve(onRefresh()).finally(() => setIsRefreshing(false));
    }
  }, [onRefresh, resetPull]);

  useEffect(() => {
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onTouchEnd, onTouchMove, onTouchStart]);

  return {
    isRefreshing,
    pullDistance,
    refreshReady: pullDistance >= PULL_READY_PX,
  };
}
