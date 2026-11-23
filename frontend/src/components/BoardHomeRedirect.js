import useSession, { useSessionGuard } from '../hooks/useSession';
import { getSessionSnapshot } from '../services/sessionState';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { fetchBoards } from '../services/notoliApiClient';
import { getPreferredBoardId } from '../services/lastBoard';

export default function BoardHomeRedirect() {
  const navigate = useNavigate();
  const { version } = useSession();
  const isCurrentSession = useSessionGuard();

  useEffect(() => {
    let isMounted = true;
    const token = getSessionSnapshot().accessToken;
    if (!token || !isCurrentSession()) return;

    (async () => {
      try {
        const boards = await fetchBoards();
        if (!isMounted || !isCurrentSession() || !boards.length) return;

        const boardId = getPreferredBoardId(boards);
        if (boardId) {
          navigate(`/board/${boardId}`, { replace: true });
        }
      } catch (_err) {
        // Leave the root route empty; board management is available in the drawer.
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [navigate, version, isCurrentSession]);

  return null;
}
