import { useState } from 'react';
import { TextField } from '@mui/material';
import { useNavigate } from 'react-router';
import { register } from '../../services/authApiClient';
import { isAuthNetworkError } from '../../services/apiResponse';
import { startSession } from '../../services/sessionState';
import { useSessionGuard } from '../../hooks/useSession';
import AuthForm, { AuthLink } from '../../components/app-core/AuthForm';

export default function Register({ showSnackbar }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const navigate = useNavigate();
  const isCurrentSession = useSessionGuard({ trackLocation: true });

  const handleRegister = async () => {
    if (isSubmitting) return;
    if (!password || password !== confirmPassword) {
      showSnackbar('error', 'Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    let acceptedResponse = false;
    try {
      const data = await register({ email, username, password });
      if (!isCurrentSession()) return;
      acceptedResponse = true;
      startSession(data);

      showSnackbar('success', 'Account created! Welcome to Notoli!');
      if (data?.board_id) {
        navigate(`/board/${data.board_id}`);
      } else {
        navigate('/');
      }
    } catch (err) {
      // A session storage failure can also advance the session version.
      if (!acceptedResponse && !isCurrentSession()) return;
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
