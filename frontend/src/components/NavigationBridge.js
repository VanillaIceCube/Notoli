import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearNavigate, setNavigate } from '../services/navigationService';

export default function NavigationBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    setNavigate(navigate);
    return () => clearNavigate();
  }, [navigate]);

  return null;
}

