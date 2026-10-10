import { Navigate, useLocation } from 'react-router-dom';
import { loginPath } from '../services/authRedirect';

export default function AuthenticatedRoute({ children }) {
  const location = useLocation();
  const token = sessionStorage.getItem('accessToken');
  if (!token) {
    return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />;
  }
  return children;
}
