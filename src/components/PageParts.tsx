import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Card, CardTitle } from './Card';
import { ConfigTree } from './ConfigTree';
import { ObjectView } from './ObjectView';
import { LoadingState, ErrorState, EmptyState } from './States';
import { useApi } from '../hooks/useApi';
import { useCreds } from '../hooks/useCreds';
import { Api, getValue } from '../lib/api';
import { Spacing } from '../theme/colors';

export function PageCard({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: Spacing.md }}>
      {title ? <CardTitle action={action}>{title}</CardTitle> : null}
      {children}
    </Card>
  );
}

export function InfoCard({ title, data }: { title?: string; data: unknown }) {
  return (
    <PageCard title={title}>
      <ObjectView data={data} />
    </PageCard>
  );
}

interface ConfigPageProps {
  keys: string[][];
  maxDepth?: number;
  emptyHint?: string;
}

export function ConfigPage({ keys, maxDepth = 2, emptyHint }: ConfigPageProps) {
  const creds = useCreds();
  const { data, loading, error, refetch } = useApi('rc', () => Api.rc(creds));

  const matched = useMemo(() => {
    if (!data) return null;
    for (const path of keys) {
      const v = getValue(data, path);
      if (v != null && typeof v === 'object') return { path, value: v };
    }
    return null;
  }, [data, keys]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return <EmptyState title="Нет данных" subtitle={emptyHint} />;

  if (matched) {
    const title = matched.path[matched.path.length - 1];
    return (
      <PageCard title={`Раздел: ${title}`}>
        <ConfigTree data={matched.value} maxDepth={maxDepth} />
      </PageCard>
    );
  }

  return (
    <PageCard title="Конфигурация роутера">
      <ConfigTree data={data} maxDepth={maxDepth} />
    </PageCard>
  );
}

export { LoadingState, ErrorState, EmptyState };

interface EndpointPageProps {
  fetcher: (c: import('../lib/digest').Credentials) => Promise<unknown>;
  cacheKey: string;
  title?: string;
  emptyHint?: string;
}

export function EndpointPage({ fetcher, cacheKey, title, emptyHint }: EndpointPageProps) {
  const creds = useCreds();
  const { data, loading, error, refetch } = useApi(cacheKey, () => fetcher(creds));

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (data == null || (Array.isArray(data) && data.length === 0)) {
    return <EmptyState title="Нет данных" subtitle={emptyHint} />;
  }
  return (
    <PageCard title={title}>
      <ObjectView data={data} maxDepth={4} />
    </PageCard>
  );
}

interface ConfigSection {
  title: string;
  keys: string[][];
}

interface MultiConfigPageProps {
  sections: ConfigSection[];
  showFullFallback?: boolean;
  emptyHint?: string;
}

export function MultiConfigPage({ sections, showFullFallback = true, emptyHint }: MultiConfigPageProps) {
  const creds = useCreds();
  const { data, loading, error, refetch } = useApi('rc', () => Api.rc(creds));

  const rendered = useMemo(() => {
    if (!data) return [];
    return sections
      .map((s) => {
        for (const path of s.keys) {
          const v = getValue(data, path);
          if (v != null) return { title: s.title, value: v };
        }
        return null;
      })
      .filter((x): x is { title: string; value: unknown } => x !== null);
  }, [data, sections]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return <EmptyState title="Нет данных" subtitle={emptyHint} />;

  return (
    <View style={{ gap: Spacing.md }}>
      {rendered.length > 0 ? (
        rendered.map((r, i) => (
          <PageCard key={i} title={r.title}>
            <ObjectView data={r.value} maxDepth={3} />
          </PageCard>
        ))
      ) : null}
      {showFullFallback ? (
        <PageCard title="Конфигурация роутера">
          <ConfigTree data={data} maxDepth={2} />
        </PageCard>
      ) : null}
      {rendered.length === 0 && !showFullFallback ? (
        <EmptyState title="Нет данных" subtitle={emptyHint} />
      ) : null}
    </View>
  );
}
