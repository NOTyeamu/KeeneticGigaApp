import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { Row } from '../../components/Row';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { PageCard } from '../../components/PageParts';
import { useApi } from '../../hooks/useApi';
import { useCreds } from '../../hooks/useCreds';
import { Api, toArray } from '../../lib/api';
import { formatBytes, isOnline } from '../../lib/format';
import { useSettings } from '../../context/SettingsContext';
import { FONT, Radius, Spacing } from '../../theme/colors';

interface Device {
  ip?: string;
  mac?: string;
  hwaddr?: string;
  name?: string;
  hostname?: string;
  interface?: string;
  iface?: string;
  link?: string;
  state?: string;
  connected?: string;
  rx_bytes?: number;
  tx_bytes?: number;
  rx?: any;
  tx?: any;
  expires?: number;
  type?: string;
  _source?: string;
}

function normalizeDevices(arp: unknown, hotspot: unknown): Device[] {
  const map = new Map<string, Device>();

  for (const d of toArray(arp)) {
    const dev: Device = {
      ip: d.ip || d['ip-name'] || d.address,
      mac: d.mac || d.hwaddr || d['mac-address'],
      name: d.name || d.hostname || d['host-name'],
      interface: d.interface || d.iface,
      link: d.link || d.state || d.connected,
      expires: d.expires,
      type: 'lan',
      _source: 'arp',
    };
    const key = (dev.mac || dev.ip || JSON.stringify(d)).toLowerCase();
    map.set(key, dev);
  }

  for (const c of toArray(hotspot).flatMap((ap) => (ap && (ap as any).clients ? (ap as any).clients : [ap]))) {
    const dev: Device = {
      ip: c.ip,
      mac: c.mac || c.hwaddr,
      name: c.name || c.hostname,
      interface: c.interface || c.ap,
      link: c.link || c.state || c.connected,
      rx_bytes: c.rx_bytes ?? c.rx?.bytes,
      tx_bytes: c.tx_bytes ?? c.tx?.bytes,
      type: 'wifi',
      _source: 'hotspot',
    };
    const key = (dev.mac || dev.ip || JSON.stringify(c)).toLowerCase();
    const existing = map.get(key);
    if (existing) {
      map.set(key, {
        ...existing,
        name: existing.name || dev.name,
        rx_bytes: dev.rx_bytes ?? existing.rx_bytes,
        tx_bytes: dev.tx_bytes ?? existing.tx_bytes,
        type: 'wifi',
      });
    } else {
      map.set(key, dev);
    }
  }

  return Array.from(map.values());
}

export default function Devices() {
  const creds = useCreds();
  const { colors } = useSettings();
  const arpReq = useApi('arp', () => Api.arp(creds));
  const hsReq = useApi('hotspot-devices', () => Api.hotspot(creds));
  const [query, setQuery] = useState('');

  const loading = arpReq.loading && hsReq.loading;
  const error = arpReq.error;
  const refetch = arpReq.refetch;

  const devices = useMemo(() => normalizeDevices(arpReq.data, hsReq.data), [arpReq.data, hsReq.data]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((d) =>
      [d.name, d.ip, d.mac, d.interface].some((f) => String(f ?? '').toLowerCase().includes(q)),
    );
  }, [devices, query]);

  const onlineCount = devices.filter((d) => isOnline(d.link ?? d.state ?? d.connected)).length;

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (devices.length === 0) return <EmptyState icon="phone-portrait-outline" title="Нет устройств" subtitle="К роутеру не подключено ни одного устройства." />;

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={[styles.summary, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: FONT.bold, fontSize: 26, color: colors.accent }}>{onlineCount}</Text>
          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.accent }}>онлайн</Text>
        </View>
        <View style={{ width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.accent, opacity: 0.3 }} />
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: FONT.bold, fontSize: 26, color: colors.accent }}>{devices.length}</Text>
          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.accent }}>всего</Text>
        </View>
      </View>

      <View style={[styles.search, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск устройств"
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, fontFamily: FONT.regular, fontSize: 14, color: colors.text, paddingHorizontal: 8 }}
        />
        {query ? <Ionicons name="close-circle" size={16} color={colors.textMuted} onPress={() => setQuery('')} /> : null}
      </View>

      {filtered.map((d, i) => {
        const online = isOnline(d.link ?? d.state ?? d.connected);
        return (
          <Card key={String(d.mac || d.ip || 'dev') + '-' + i}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 }}>
              <View style={[styles.iconBox, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name={d.type === 'wifi' ? 'wifi-outline' : 'phone-portrait-outline'} size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONT.semiBold, fontSize: 15, color: colors.text }} numberOfLines={1}>
                  {d.name || 'Без названия'}
                </Text>
                <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  {d.ip || '—'}{d.mac ? ` · ${d.mac}` : ''}
                </Text>
              </View>
              <StatusBadge online={online} />
            </View>
            {d.interface ? <Row label="Интерфейс" value={String(d.interface)} /> : null}
            {d.type ? <Row label="Подключение" value={d.type === 'wifi' ? 'Wi-Fi' : 'Проводное'} /> : null}
            {d.rx_bytes != null || d.tx_bytes != null ? (
              <Row label="Трафик" value={`↓ ${formatBytes(d.rx_bytes)} · ↑ ${formatBytes(d.tx_bytes)}`} last />
            ) : (
              <Row label="Трафик" value="—" last />
            )}
          </Card>
        );
      })}

      {filtered.length === 0 ? (
        <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 }}>
          Ничего не найдено
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 18,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
