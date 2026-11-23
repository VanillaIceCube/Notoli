import { useState } from 'react';
import { TextField } from '@mui/material';
import { useNavigate } from 'react-router';
import { forgotPassword } from '../../services/authApiClient';
import { isAuthNetworkError } from '../../services/apiResponse';
import { useSessionGuard } from '../../hooks/useSession';
import AuthForm, { AuthLink } from '../../components/app-core/AuthForm';

export default function ForgotPassword({ showSnackbar }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const navigate = useNavigate();
  const isCurrentSession = useSessionGuard({ trackLocation: true });

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const data = await forgotPassword({ email: email.trim() });
      if (!isCurrentSession()) return;
      showSnackbar(
        'success',
        data?.message || 'If that account exists, we sent a password reset link.',
      );
      navigate('/login');
    } catch (err) {
      if (!isCurrentSession()) return;
      showSnackbar(
        'error',
        isAuthNetworkError(err)
          ? 'Network error :('
          : err?.message || 'Password reset request failed :(',
      );
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthForm
      title="Reset your password"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? 'Sending...' : 'Send Reset Link'}
      footer={<AuthLink to="/login">Back to Login</AuthLink>}
    >
      <TextField
        fullWidth
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </AuthForm>
  );
}
