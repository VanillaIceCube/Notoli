import { useState } from 'react';
import { TextField } from '@mui/material';
import { useNavigate } from 'react-router';
import { forgotPassword } from '../../services/notoliApiClient';
import AuthForm, { AuthLink } from './AuthForm';

export default function ForgotPassword({ showSnackbar }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const data = await forgotPassword({ email: email.trim() });
      showSnackbar(
        'success',
        data?.message || 'If that account exists, we sent a password reset link.',
      );
      navigate('/login');
    } catch (err) {
      const isNetworkError =
        err instanceof TypeError ||
        (typeof err?.message === 'string' && err.message.toLowerCase().includes('network'));
      showSnackbar(
        'error',
        isNetworkError ? 'Network error :(' : err?.message || 'Password reset request failed :(',
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
