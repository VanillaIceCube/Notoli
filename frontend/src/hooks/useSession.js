import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { getSessionSnapshot, getSessionVersion, subscribeSession } from '../services/sessionState';

export default function useSession() {
  return useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
}

// Async UI continuations must still belong to this mounted account before
// navigating, opening an OAuth callback, or updating application-wide UI.
export function useSessionGuard() {
  const { version } = useSession();
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  return useCallback(() => mountedRef.current && getSessionVersion() === version, [version]);
}
