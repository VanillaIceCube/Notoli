import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBoards } from '../../services/boards/notoliApiClient';
import useSession, { useSessionGuard } from '../authentication/useSession';

export default function useBoardList() {
  const { accessToken } = useSession();
  const isCurrentSession = useSessionGuard();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(Boolean(accessToken));
  const [loadError, setLoadError] = useState(null);
  const pendingChangesRef = useRef(null);
  const loadBoards = useCallback(async () => {
    if (!accessToken) {
      setBoards([]);
      setLoadError(null);
      setLoading(false);
      return;
    }

    // Replay successful drawer mutations over a list request that started earlier.
    const changes = [];
    pendingChangesRef.current = changes;
    const isCurrent = () => pendingChangesRef.current === changes && isCurrentSession();
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchBoards();
      if (isCurrent()) setBoards(changes.reduce((list, apply) => apply(list), result));
    } catch (error) {
      if (isCurrent()) setLoadError(error);
    } finally {
      if (isCurrent()) {
        pendingChangesRef.current = null;
        setLoading(false);
      }
    }
  }, [accessToken, isCurrentSession]);

  useEffect(() => {
    loadBoards();
    return () => {
      pendingChangesRef.current = null;
    };
  }, [loadBoards]);

  function updateBoards(apply) {
    if (!isCurrentSession()) return;
    pendingChangesRef.current?.push(apply);
    setBoards(apply);
    setLoadError(null);
  }

  return { boards, loading, loadError, updateBoards, retry: loadBoards };
}
