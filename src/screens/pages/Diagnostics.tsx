import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Row } from '../../components/Row';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState, ErrorState } from '../../components/States';
import { PageCard } from '../../components/PageParts';
import { ObjectView } from '../../components/ObjectView';
import { useApi } from '../../hooks/useApi';
import { useCreds } from '../../hooks/useCreds';
import { Api, toArray } from '../../lib/api';
import { asInterfaces, ifaceName, isUp } from '../../lib/interfaces';
import { useSettings } from '../../context/SettingsContext';
import { FONT, Radius, Spacing } from '../../theme/colors';

export default function Diagnostics() {
  const creds = useCreds();
  const { colors, haptic } = useSettings();
  const ifaceReq = useApi('diag-interface', () => Api.interface(creds));

  const [host, setHost] = useState('8.8.8.8');
  const [mode, setMode] = useState<'ping' | 'traceroute'>('ping');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [pingError, setPingError] = useState<string | null>(null);

  const run = async () => {
    if (!host.trim()) return;
    haptic();
    setRunning(true);
    setPingError(null);
    setResult(null);
    try {
      const res = mode === 'ping' ? await Api.ping(creds, host.trim(), 4) : await Api.traceroute(creds, host.trim());
      setResult(res);
    } catch (e: any) {
      setPingError(e?.message || 'Не удалось выполнить команду.');
    } finally {
      setRunning(false);
    }
  };

  if (ifaceReq.loading) return <LoadingState />;
  if (ifaceReq.error) return <ErrorState message={ifaceReq.error} onRetry={ifaceReq.refetch} />;

  const interfaces = asInterfaces(ifaceReq.data);
  const upCount = interfaces.filter(isUp).length;

  return (
    <View style={{ gap: Spacing.md }}>
      <PageCard title="Состояние интерфейсов">
        <Row label="Всего интерфейсов" value={String(interfaces.length)} />
        <Row label="Активных" value={String(upCount)} />
        <Row label="Неактивных" value={String(interfaces.length - upCount)} last />
      </PageCard>

      <PageCard title="Список интерфейсов">
        {interfaces.slice(0, 12).map((iface, i) => (
          <View
            key={i}
            style={[styles.ifaceRow, { borderBottomColor: colors.divider }, i === Math.min(interfaces.length, 12) - 1 && { borderBottomWidth: 0 }]}
          >
            <Text style={{ flex: 1, fontFamily: FONT.regular, fontSize: 14, color: colors.text }} numberOfLines={1}>
              {ifaceName(iface)}
            </Text>
            <StatusBadge online={isUp(iface)} />
          </View>
        ))}
        {interfaces.length > 12 ? (
          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textMuted, marginTop: 8 }}>
            и ещё {interfaces.length - 12}…
          </Text>
        ) : null}
      </PageCard>

      <PageCard title="Ping / Traceroute">
        <View style={[styles.segWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Pressable
            onPress={() => {
              haptic();
              setMode('ping');
            }}
            style={[styles.segBtn, mode === 'ping' && { backgroundColor: colors.accent }]}
          >
            <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: mode === 'ping' ? '#fff' : colors.textSecondary }}>Ping</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              haptic();
              setMode('traceroute');
            }}
            style={[styles.segBtn, mode === 'traceroute' && { backgroundColor: colors.accent }]}
          >
            <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: mode === 'traceroute' ? '#fff' : colors.textSecondary }}>Traceroute</Text>
          </Pressable>
        </View>

        <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <TextInput
            value={host}
            onChangeText={setHost}
            placeholder="IP-адрес или домен"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={{ flex: 1, fontFamily: FONT.regular, fontSize: 15, color: colors.text, paddingHorizontal: 12 }}
          />
        </View>

        <Pressable
          onPress={run}
          disabled={running}
          android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
          style={({ pressed }) => [styles.runBtn, { backgroundColor: running ? colors.accentDim : colors.accent }, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="pulse-outline" size={18} color="#fff" />
          <Text style={{ fontFamily: FONT.semiBold, fontSize: 15, color: '#fff', marginLeft: 10 }}>
            {running ? 'Выполнение…' : mode === 'ping' ? 'Выполнить Ping' : 'Выполнить Traceroute'}
          </Text>
        </Pressable>

        {pingError ? (
          <View style={[styles.errBox, { backgroundColor: 'rgba(255,92,92,0.10)', borderColor: colors.danger }]}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={{ flex: 1, marginLeft: 8, fontFamily: FONT.regular, fontSize: 13, color: colors.danger }}>{pingError}</Text>
          </View>
        ) : null}

        {result != null ? (
          <View style={[styles.resultBox, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
            <Text style={{ fontFamily: FONT.semiBold, fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>Результат</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <ObjectView data={result} maxDepth={4} />
            </ScrollView>
          </View>
        ) : null}
      </PageCard>
    </View>
  );
}

const styles = StyleSheet.create({
  ifaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segWrap: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: Radius.sm,
  },
  errBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
  resultBox: {
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginTop: 10,
  },
});
