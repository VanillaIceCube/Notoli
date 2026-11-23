import { useMemo, useState } from 'react';
import { TextField } from '@mui/material';
import { useLocation, useNavigate } from 'react-router';
import { resetPassword } from '../../services/notoliApiClient';
import { isAuthNetworkError } from '../../services/authSession';
import AuthForm, { AuthLink } from './AuthForm';

export default function ResetPassword({ showSnackbar }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const uid = params.get('uid') || '';
  const token = params.get('token') || '';
  const missingResetParams = !uid || !token;

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (missingResetParams) {
      showSnackbar('error', 'Invalid or expired reset link.');
      return;
    }

    if (!password || password !== confirmPassword) {
      showSnackbar('error', 'Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await resetPassword({ uid, token, password });
      showSnackbar('success', data?.message || 'Password reset successful.');
      navigate('/login');
    } catch (err) {
      showSnackbar(
        'error',
        isAuthNetworkError(err) ? 'Network error :(' : err?.message || 'Password reset failed :(',
      );
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthForm
      title="Choose a new password"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? 'Resetting...' : 'Reset Password'}
      footer={
        <>
          Back to <AuthLink to="/login">Login</AuthLink>
        </>
      }
    >
      <TextField
        fullWidth
        label="New Password"
        type="password"
        name="new-password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <TextField
        fullWidth
        label="Confirm Password"
        type="password"
        name="confirm-password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />
    </AuthForm>
  );
}
