import { useState, useEffect } from 'react';
import { TextField } from '@mui/material';
import { useLocation, useNavigate } from 'react-router';
import { login } from '../../services/notoliApiClient';
import { isAuthNetworkError } from '../../services/authSession';
import { startSession } from '../../services/sessionState';
import { connectionReturnTo } from '../../services/authRedirect';
import AuthForm, { AuthLink } from '../../components/app-core/AuthForm';

export default function Login({ showSnackbar }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = connectionReturnTo(new URLSearchParams(location.search).get('next'));

  useEffect(() => {
    const raw = sessionStorage.getItem('pendingSnackbar');
    if (!raw) return;

    sessionStorage.removeItem('pendingSnackbar');

    if (typeof showSnackbar !== 'function') return;

    try {
      const payload = JSON.parse(raw);
      const severity = payload?.severity || 'error';
      const message = payload?.message || 'Please log in again.';
      showSnackbar(severity, message);
    } catch (_err) {
      showSnackbar('error', 'Please log in again.');
    }
  }, [showSnackbar]);

  const handleLogin = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const data = await login({ email: email.trim(), password });
      startSession(data);

      const welcomeName =
        data?.username ||
        data?.email?.split?.('@')?.[0] ||
        email.trim().split?.('@')?.[0] ||
        'there';
      showSnackbar('success', `Welcome ${welcomeName}!`);

      navigate(returnTo || '/', { replace: true });
    } catch (err) {
      showSnackbar('error', isAuthNetworkError(err) ? 'Network error :(' : 'Login failed :(');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthForm
      title="Login"
      onSubmit={handleLogin}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? 'Logging in...' : 'Login'}
      footer={
        <>
          <AuthLink to="/forgot-password">Forgot Password?</AuthLink>
          {' | '}
          <AuthLink to="/register">Create Account!</AuthLink>
        </>
      }
    >
      <TextField
        fullWidth
        label="Email"
        type="email"
        name="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        fullWidth
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    </AuthForm>
  );
}
