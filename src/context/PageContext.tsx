import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface PageRef {
  id: string;
  title: string;
  page: string;
}

interface PageContextValue {
  page: PageRef | null;
  openPage: (page: PageRef) => void;
  clearPage: () => void;
}

const PageContext = createContext<PageContextValue | undefined>(undefined);

export function PageProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<PageRef | null>(null);

  const openPage = useCallback((p: PageRef) => setPage(p), []);
  const clearPage = useCallback(() => setPage(null), []);

  const value = useMemo<PageContextValue>(
    () => ({ page, openPage, clearPage }),
    [page, openPage, clearPage],
  );

  return <PageContext.Provider value={value}>{children}</PageContext.Provider>;
}

export function usePage(): PageContextValue {
  const ctx = useContext(PageContext);
  if (!ctx) throw new Error('usePage must be used within PageProvider');
  return ctx;
}
