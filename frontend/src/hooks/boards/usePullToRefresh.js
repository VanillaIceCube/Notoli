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
  if (target?.closest?.('[data-pull-refresh-start="true"]')) {
    return false;
  }

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

function isInsideScrolledContainer(target) {
  for (
    let element = target;
    element && element !== document.body;
    element = element.parentElement
  ) {
    if (element.scrollTop > 0) return true;
  }
  return false;
}

export function usePullToRefresh({ enabled = true, active = true, onRefresh }) {
  const touchStartRef = useRef(null);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const updatePullDistance = useCallback((distance) => {
    pullDistanceRef.current = distance;
    setPullDistance(distance);
  }, []);

  const resetPull = useCallback(() => updatePullDistance(0), [updatePullDistance]);

  const onTouchStart = useCallback(
    (event) => {
      if (
        !enabled ||
        !active ||
        refreshingRef.current ||
        !onRefresh ||
        !isMobileTouchViewport() ||
        isInteractiveTarget(event.target)
      ) {
        touchStartRef.current = null;
        resetPull();
        return;
      }

      const touch = event.touches?.[0];
      if (
        !touch ||
        event.touches.length !== 1 ||
        window.scrollY > 0 ||
        isInsideScrolledContainer(event.target)
      ) {
        touchStartRef.current = null;
        resetPull();
        return;
      }

      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    },
    [active, enabled, onRefresh, resetPull],
  );

  const onTouchMove = useCallback(
    (event) => {
      const start = touchStartRef.current;
      const touch = event.touches?.[0];
      if (!start || !touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (
        !enabled ||
        !active ||
        event.touches.length !== 1 ||
        window.scrollY > 0 ||
        deltaY <= 0 ||
        Math.abs(deltaX) > MAX_HORIZONTAL_DRIFT_PX
      ) {
        touchStartRef.current = null;
        resetPull();
        return;
      }

      event.preventDefault?.();
      updatePullDistance(Math.min(deltaY, PULL_REFRESH_PX));
    },
    [active, enabled, resetPull, updatePullDistance],
  );

  const onTouchCancel = useCallback(() => {
    touchStartRef.current = null;
    resetPull();
  }, [resetPull]);

  const onTouchEnd = useCallback(() => {
    const shouldRefresh =
      active && enabled && !refreshingRef.current && pullDistanceRef.current >= PULL_REFRESH_PX;
    touchStartRef.current = null;
    resetPull();

    if (shouldRefresh) {
      refreshingRef.current = true;
      setIsRefreshing(true);
      // Pages own their error UI; always settle the gesture, even on a throw.
      const refresh = async () => {
        try {
          await onRefresh();
        } catch {
          // The refresh callback reports its own failure to the page.
        } finally {
          refreshingRef.current = false;
          setIsRefreshing(false);
        }
      };
      void refresh();
    }
  }, [active, enabled, onRefresh, resetPull]);

  useEffect(() => {
    if (!active || !enabled) onTouchCancel();
  }, [active, enabled, onTouchCancel]);

  useEffect(() => {
    if (!active || (!enabled && !isRefreshing) || !isMobileTouchViewport()) return;
    // The custom indicator owns refresh; prevent the browser's competing bounce.
    const root = document.documentElement;
    const previous = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = 'none';
    return () => {
      root.style.overscrollBehaviorY = previous;
    };
  }, [active, enabled, isRefreshing]);

  useEffect(() => {
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [onTouchCancel, onTouchEnd, onTouchMove, onTouchStart]);

  return {
    isRefreshing,
    pullDistance,
    refreshReady: pullDistance >= PULL_READY_PX,
  };
}
