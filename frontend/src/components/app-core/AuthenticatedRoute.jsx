import { Fragment } from 'react';
import useSession from '../../hooks/authentication/useSession';
import { Navigate, useLocation } from 'react-router';
import { loginPath } from '../../services/authentication/authRedirect';

export default function AuthenticatedRoute({ children }) {
  const location = useLocation();
  const session = useSession();
  if (!session.accessToken) {
    return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />;
  }
  return <Fragment key={session.version}>{children}</Fragment>;
}
