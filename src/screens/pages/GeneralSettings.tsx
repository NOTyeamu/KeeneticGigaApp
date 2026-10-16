import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import { ConfigTree } from '../../components/ConfigTree';
import { Row } from '../../components/Row';
import { LoadingState, ErrorState } from '../../components/States';
import { PageCard } from '../../components/PageParts';
import { useApi } from '../../hooks/useApi';
import { useCreds } from '../../hooks/useCreds';
import { Api } from '../../lib/api';
import { useSettings } from '../../context/SettingsContext';
import { FONT, Spacing } from '../../theme/colors';

export default function GeneralSettings() {
  const creds = useCreds();
  const { colors } = useSettings();
  const sysReq = useApi('system-general', () => Api.system(creds));
  const rcReq = useApi('rc-general', () => Api.rc(creds));

  if (sysReq.loading || rcReq.loading) return <LoadingState />;
  if (sysReq.error) return <ErrorState message={sysReq.error} onRetry={sysReq.refetch} />;

  const sys = sysReq.data || {};
  const rc = rcReq.data || {};
  const topLevelScalars = rc && typeof rc === 'object' ? Object.keys(rc).filter((k) => {
    const v = (rc as any)[k];
    return v == null || typeof v !== 'object';
  }) : [];

  return (
    <View style={{ gap: Spacing.md }}>
      <PageCard title="Устройство">
        <Row label="Название" value={String(sys.title ?? sys.name ?? '—')} />
        <Row label="Домен" value={String(sys.domain ?? '—')} />
        <Row label="Модель" value={String(sys.model ?? '—')} />
        <Row label="Версия ПО" value={String(sys.fw_version ?? sys.firmware?.version ?? '—')} last />
      </PageCard>

      <PageCard title="Общие параметры">
        {topLevelScalars.length > 0 ? (
          topLevelScalars.map((k, i) => (
            <Row key={k} label={k} value={String((rc as any)[k] ?? '—')} last={i === topLevelScalars.length - 1} />
          ))
        ) : (
          <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: colors.textSecondary }}>Параметры недоступны.</Text>
        )}
      </PageCard>

      <PageCard title="Полная конфигурация">
        <ConfigTree data={rcReq.error ? null : rc} maxDepth={1} />
      </PageCard>
    </View>
  );
}
