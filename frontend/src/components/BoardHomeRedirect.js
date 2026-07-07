import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBoards } from '../services/notoliApiClient';
import { getPreferredBoardId } from '../services/lastBoard';

export default function BoardHomeRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const token = sessionStorage.getItem('accessToken');

    (async () => {
      try {
        const response = await fetchBoards(token);
        if (!response.ok) return;

        const boards = await response.json();
        if (!isMounted || !boards.length) return;

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
  }, [navigate]);

  return null;
}
