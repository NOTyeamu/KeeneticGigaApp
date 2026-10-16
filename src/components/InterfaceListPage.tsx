import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../hooks/useApi';
import { useCreds } from '../hooks/useCreds';
import { Api } from '../lib/api';
import { asInterfaces, hasRole, ifaceId, ifaceName, ifaceType, isUp, type Iface } from '../lib/interfaces';
import { formatBytes, formatPackets } from '../lib/format';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius, Spacing } from '../theme/colors';
import { Card } from './Card';
import { Row } from './Row';
import { StatusBadge } from './StatusBadge';
import { LoadingState, ErrorState, EmptyState } from './States';

interface InterfaceListPageProps {
  filter: (i: Iface) => boolean;
  showTraffic?: boolean;
  fallbackAll?: boolean;
  emptyTitle?: string;
  emptySubtitle?: string;
}

export function InterfaceListPage({
  filter,
  showTraffic = false,
  fallbackAll = true,
  emptyTitle = 'Нет подключений',
  emptySubtitle = 'На роутере не найдено подключений этого типа.',
}: InterfaceListPageProps) {
  const creds = useCreds();
  const { colors } = useSettings();
  const { data, loading, error, refetch } = useApi('interface', () => Api.interface(creds));

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const all = asInterfaces(data);
  let list = all.filter(filter);
  const usedFallback = list.length === 0 && fallbackAll;
  if (usedFallback) list = all;

  if (list.length === 0) return <EmptyState icon="cloud-offline-outline" title={emptyTitle} subtitle={emptySubtitle} />;

  return (
    <View style={{ gap: Spacing.md }}>
      {usedFallback ? (
        <View style={[styles.note, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
          <Text style={{ flex: 1, fontFamily: FONT.regular, fontSize: 12, color: colors.accent, marginLeft: 8 }}>
            Тип подключения не удалось определить автоматически — показаны все интерфейсы.
          </Text>
        </View>
      ) : null}
      {list.map((iface, i) => (
        <InterfaceCard key={ifaceId(iface) + i} iface={iface} showTraffic={showTraffic} />
      ))}
    </View>
  );
}

function InterfaceCard({ iface, showTraffic }: { iface: Iface; showTraffic: boolean }) {
  const { colors } = useSettings();
  const up = isUp(iface);
  const rxBytes = iface.rx?.bytes ?? iface.rx?.packets;
  const txBytes = iface.tx?.bytes ?? iface.tx?.packets;
  const roles = Array.isArray(iface.role) ? iface.role : iface.role ? [iface.role] : [];

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ fontFamily: FONT.semiBold, fontSize: 15, color: colors.text }} numberOfLines={1}>
            {ifaceName(iface)}
          </Text>
          {ifaceType(iface) ? (
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' }}>
              {ifaceType(iface)}
              {iface.speed ? ` · ${iface.speed}` : ''}
              {iface.duplex ? ` · ${iface.duplex}` : ''}
            </Text>
          ) : null}
        </View>
        <StatusBadge online={up} />
      </View>

      <Row label="Идентификатор" value={ifaceId(iface)} />
      {iface.mac || iface.hwaddr ? <Row label="MAC" value={iface.mac || iface.hwaddr} /> : null}
      {iface.ssid ? <Row label="SSID" value={iface.ssid} /> : null}
      {iface.channel != null ? <Row label="Канал" value={String(iface.channel)} /> : null}
      {iface.mtu != null ? <Row label="MTU" value={String(iface.mtu)} /> : null}
      {roles.length > 0 ? <Row label="Роль" value={roles.join(', ')} /> : null}

      {showTraffic ? (
        <View style={{ marginTop: 10 }}>
          <View style={[styles.trafficWrap, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
            <TrafficCell label="Приём" bytes={iface.rx?.bytes} packets={iface.rx?.packets} color={colors.online} icon="arrow-down-outline" />
            <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginVertical: 2 }} />
            <TrafficCell label="Передача" bytes={iface.tx?.bytes} packets={iface.tx?.packets} color={colors.accent} icon="arrow-up-outline" />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function TrafficCell({
  label,
  bytes,
  packets,
  color,
  icon,
}: {
  label: string;
  bytes?: number | string;
  packets?: number | string;
  color: string;
  icon: string;
}) {
  const { colors } = useSettings();
  return (
    <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Ionicons name={icon as any} size={14} color={color} />
        <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textSecondary }}>{label}</Text>
      </View>
      <Text style={{ fontFamily: FONT.semiBold, fontSize: 16, color: colors.text }}>{formatBytes(bytes)}</Text>
      {packets != null ? (
        <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
          {formatPackets(packets)} пак.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  trafficWrap: {
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
