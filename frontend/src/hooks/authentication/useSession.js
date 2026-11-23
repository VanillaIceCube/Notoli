import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  getSessionSnapshot,
  getSessionVersion,
  subscribeSession,
} from '../../services/authentication/sessionState';

export default function useSession() {
  return useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
}

// Async UI continuations must still belong to this mounted account before
// navigating, opening an OAuth callback, or updating application-wide UI.
export function useSessionGuard({ trackLocation = false } = {}) {
  const { version } = useSession();
  // A lazy route change can update the URL before React unmounts the previous form.
  const formLocation = trackLocation ? window.location.href : null;
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  return useCallback(
    () =>
      mountedRef.current &&
      getSessionVersion() === version &&
      (formLocation === null || window.location.href === formLocation),
    [version, formLocation],
  );
}
