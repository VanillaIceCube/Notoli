import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useSessionGuard } from '../../hooks/authentication/useSession';
import { getPreferredBoardId } from '../../services/notepad/lastBoard';

export default function BoardHomeRedirect({ boardList, showSnackbar }) {
  const navigate = useNavigate();
  const isCurrentSession = useSessionGuard();
  const handledRef = useRef(false);
  const { boards, loading, loadError, retry } = boardList;
  const failedBeforeArrivalRef = useRef(Boolean(loadError));

  useEffect(() => {
    if (loading || handledRef.current || !isCurrentSession()) return;
    if (loadError && failedBeforeArrivalRef.current) {
      failedBeforeArrivalRef.current = false;
      retry();
      return;
    }
    handledRef.current = true;
    if (loadError) {
      showSnackbar(
        'error',
        Number.isInteger(loadError.status) ? 'Board load failed :(' : 'Network error :(',
      );
      return;
    }
    const boardId = getPreferredBoardId(boards);
    if (boardId) navigate(`/board/${boardId}`, { replace: true });
  }, [boards, loading, loadError, retry, navigate, isCurrentSession, showSnackbar]);

  return null;
}
