import { useState } from 'react';
import { TextField } from '@mui/material';
import { useNavigate } from 'react-router';
import { register } from '../../services/notoliApiClient';
import { isAuthNetworkError } from '../../services/authSession';
import { startSession } from '../../services/sessionState';
import AuthForm, { AuthLink } from './AuthForm';

export default function Register({ showSnackbar }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const navigate = useNavigate();

  const handleRegister = async () => {
    if (isSubmitting) return;
    if (!password || password !== confirmPassword) {
      showSnackbar('error', 'Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await register({ email, username, password });
      startSession(data);

      showSnackbar('success', 'Account created! Welcome to Notoli!');
      if (data?.board_id) {
        navigate(`/board/${data.board_id}`);
      } else {
        navigate('/');
      }
    } catch (err) {
      showSnackbar(
        'error',
        isAuthNetworkError(err) ? 'Network error :(' : err?.message || 'Registration failed :(',
      );
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthForm
      title="Create account"
      onSubmit={handleRegister}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? 'Registering...' : 'Register'}
      footer={
        <>
          Already have an account? <AuthLink to="/login">Sign in now!</AuthLink>
        </>
      }
    >
      <TextField
        fullWidth
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        fullWidth
        label="Username (optional)"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <TextField
        fullWidth
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <TextField
        fullWidth
        label="Confirm Password"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />
    </AuthForm>
  );
}
