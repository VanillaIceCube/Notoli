import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useSessionGuard } from '../../hooks/useSession';
import { fetchBoards } from '../../services/notoliApiClient';
import { getPreferredBoardId } from '../../services/lastBoard';

export default function BoardHomeRedirect({ showSnackbar }) {
  const navigate = useNavigate();
  const isCurrentSession = useSessionGuard();

  useEffect(() => {
    let cancelled = false;

    async function openPreferredBoard() {
      try {
        const boards = await fetchBoards();
        if (cancelled || !isCurrentSession()) return;

        const boardId = getPreferredBoardId(boards);
        if (boardId) navigate(`/board/${boardId}`, { replace: true });
      } catch (error) {
        if (cancelled || !isCurrentSession()) return;

        const message = Number.isInteger(error?.status)
          ? 'Board load failed :('
          : 'Network error :(';
        showSnackbar('error', message);
      }
    }

    openPreferredBoard();
    return () => {
      cancelled = true;
    };
  }, [navigate, isCurrentSession, showSnackbar]);

  return null;
}
