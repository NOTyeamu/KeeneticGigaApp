import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { AuthError, HttpError, NetworkError } from '../lib/digest';

export interface LiveApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Как useApi, но с фоновым автообновлением, пока экран в фокусе.
 * Обновления «тихие»: старые данные остаются на экране до прихода новых,
 * а разовый сетевой сбой не роняет страницу — следующий тик её починит.
 */
export function useLiveApi<T>(key: string, fetcher: () => Promise<T>, intervalMs = 3000): LiveApiState<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const isFocused = useIsFocused();

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<T | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const result = await fetcherRef.current();
      dataRef.current = result;
      setData(result);
      setError(null);
      setLoading(false);
    } catch (e: unknown) {
      if (dataRef.current == null) {
        let message: string;
        if (e instanceof AuthError || e instanceof HttpError || e instanceof NetworkError) message = e.message;
        else if (e instanceof Error) message = e.message || 'Произошла ошибка.';
        else message = 'Произошла неизвестная ошибка.';
        setError(message);
        setLoading(false);
      }
    } finally {
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    load();
    const id = setInterval(load, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, intervalMs, load, key]);

  return { data, loading, error, refetch: load };
}
