import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Row } from '../../components/Row';
import { LoadingState, ErrorState } from '../../components/States';
import { PageCard } from '../../components/PageParts';
import { ConfigTree } from '../../components/ConfigTree';
import { useApi } from '../../hooks/useApi';
import { useCreds } from '../../hooks/useCreds';
import { Api } from '../../lib/api';
import { useSettings } from '../../context/SettingsContext';
import { FONT, Radius, Spacing } from '../../theme/colors';

export default function Backup() {
  const creds = useCreds();
  const { colors } = useSettings();
  const { data, loading, error, refetch } = useApi('rc-backup', () => Api.rc(creds));

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const topKeys = data && typeof data === 'object' ? Object.keys(data) : [];
  const sizeBytes = data ? JSON.stringify(data).length : 0;

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={[styles.note, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
        <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
        <Text style={{ flex: 1, marginLeft: 10, fontFamily: FONT.regular, fontSize: 13, color: colors.accent }}>
          Полная конфигурация роутера в формате JSON. Для создания резервной копии используйте веб-интерфейс.
        </Text>
      </View>

      <PageCard title="Сводка конфигурации">
        <Row label="Разделов" value={String(topKeys.length)} />
        <Row label="Размер (JSON)" value={`${(sizeBytes / 1024).toFixed(1)} КБ`} />
        <Row label="Источник" value="show/rc" last />
      </PageCard>

      <PageCard title={`Конфигурация (${topKeys.length})`}>
        <ConfigTree data={data} maxDepth={1} />
      </PageCard>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
