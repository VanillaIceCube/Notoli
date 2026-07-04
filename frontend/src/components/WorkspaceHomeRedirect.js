import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWorkspaces } from '../services/notoliApiClient';

export default function WorkspaceHomeRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const token = sessionStorage.getItem('accessToken');

    (async () => {
      try {
        const response = await fetchWorkspaces(token);
        if (!response.ok) return;

        const workspaces = await response.json();
        if (!isMounted || !workspaces.length) return;

        const firstWorkspaceId = Math.min(...workspaces.map((workspace) => workspace.id));
        navigate(`/workspace/${firstWorkspaceId}`, { replace: true });
      } catch (_err) {
        // Leave the root route empty; workspace management is available in the drawer.
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return null;
}
