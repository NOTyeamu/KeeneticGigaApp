import { useAuth } from '../context/AuthContext';
import type { Credentials } from '../lib/digest';

export function useCreds(): Credentials {
  const { credentials } = useAuth();
  if (!credentials) throw new Error('Не авторизован');
  return credentials;
}
