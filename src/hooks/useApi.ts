import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { AuthError, HttpError, NetworkError } from '../lib/digest';

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useApi<T>(key: string, fetcher: () => Promise<T>): ApiState<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lastLoadRef = useRef(0);

  const load = useCallback(async () => {
    lastLoadRef.current = Date.now();
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      setData(result);
    } catch (e: unknown) {
      let message: string;
      if (e instanceof AuthError) message = e.message;
      else if (e instanceof HttpError) message = e.message;
      else if (e instanceof NetworkError) message = e.message;
      else if (e instanceof Error) message = e.message || 'Произошла ошибка.';
      else message = 'Произошла неизвестная ошибка.';
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [key, load]);

  // Перезапрашиваем данные при возврате на экран, чтобы информация
  // не оставалась устаревшей при переключении вкладок.
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoadRef.current > 4000) load();
    }, [load]),
  );

  return { data, loading, error, refetch: load };
}
