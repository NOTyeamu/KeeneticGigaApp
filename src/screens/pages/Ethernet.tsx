import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import {
  ActionButton,
  CheckboxRow,
  FormSectionTitle,
  LabeledInput,
  SelectField,
} from '../../components/FormParts';
import { useAlert, useAlertDialog } from '../../components/AlertDialog';
import { useApi } from '../../hooks/useApi';
import { useCreds } from '../../hooks/useCreds';
import { Api, toArray } from '../../lib/api';
import { useSettings } from '../../context/SettingsContext';
import { FONT, Radius, Spacing } from '../../theme/colors';

/**
 * «Кабель Ethernet» — страница проводного интернет-подключения, повторяющая
 * веб-интерфейс KeeneticOS: список подключений, расписание, приоритет, имя
 * провайдера, порты и VLAN'ы, параметры IPv4/IPv6, требования провайдера,
 * аутентификация PPPoE/PPTP/L2TP, 802.1x и Ping Check.
 *
 * Данные берутся из RCI (`show/ip/interface` + `show rc interface`); состав
 * полей зависит от прошивки, поэтому отсутствующие значения показываются
 * как «—», а недоступные переключатели — заблокированными.
 */

const SCHEDULES = [
  { value: 'always', label: 'Работает постоянно' },
  { value: 'schedule', label: 'По расписанию' },
];

const PRIORITIES = [
  { value: 'default', label: 'Основное подключение' },
  { value: 'backup', label: 'Резервное подключение' },
];

const IPV4_MODES = [
  { value: 'dhcp', label: 'Автоматическая (DHCP)' },
  { value: 'static', label: 'Вручную' },
  { value: 'none', label: 'Не использовать' },
];

const IPV6_MODES = [
  { value: 'none', label: 'Не используется' },
  { value: 'auto', label: 'Автоматическая' },
  { value: 'manual', label: 'Вручную' },
];

const MAC_MODES = [
  { value: 'default', label: 'По умолчанию' },
  { value: 'custom', label: 'Указать вручную' },
];

const AUTH_TYPES = [
  { value: 'none', label: 'Не использовать' },
  { value: 'pppoe', label: 'PPPoE' },
  { value: 'pptp', label: 'PPTP' },
  { value: 'l2tp', label: 'L2TP' },
];

const DOT1X_MODES = [
  { value: 'none', label: 'Не использовать' },
  { value: 'eap-md5', label: 'EAP-MD5' },
  { value: 'eap-tls', label: 'EAP-TLS' },
];

const PING_MODES = [
  { value: 'none', label: 'Не использовать' },
  { value: 'auto', label: 'Автоматически' },
  { value: 'manual', label: 'Указать адрес' },
];

/** Приводит значение из RCI к строке выбора. */
function optionLabel(options: { value: string; label: string }[], value: string): string {
  const found = options.find((o) => o.value === value);
  return found ? found.label : value || '—';
}

interface Connection {
  id: string;
  description: string;
  type?: string;
  up: boolean;
  enabled: boolean;
  address?: string;
  mask?: string;
  gateway?: string;
  mac?: string;
  mtu?: number;
  dhcp?: boolean;
  schedule?: string;
  priority?: string;
  authType?: string;
}

/** Достаёт узел interface из ответа POST show rc (форма отличается между прошивками). */
function extractRcInterfaces(rc: any): any[] {
  if (rc == null) return [];
  const found: any[] = [];
  const walk = (x: any, depth: number) => {
    if (!x || typeof x !== 'object' || depth > 6) return;
    if (x.interface && typeof x.interface === 'object' && !Array.isArray(x.interface)) {
      found.push(x.interface);
    }
    for (const k of Object.keys(x)) {
      if (k === 'interface' && x[k] && typeof x[k] === 'object' && !Array.isArray(x[k])) {
        found.push(x[k]);
      }
      walk(x[k], depth + 1);
    }
  };
  if (Array.isArray(rc)) rc.forEach((x) => walk(x, 0));
  else walk(rc, 0);

  const merged: Record<string, any> = {};
  for (const node of found) {
    for (const name of Object.keys(node)) {
      const v = node[name];
      merged[name] = v && typeof v === 'object' ? { ...(merged[name] ?? {}), ...v } : v;
    }
  }
  return Object.keys(merged).map((name) => ({ name, ...(typeof merged[name] === 'object' ? merged[name] : {}) }));
}

function isEthernetInternet(node: any): boolean {
  const id = String(node?.name ?? node?.id ?? '').toLowerCase();
  const type = String(node?.type ?? '').toLowerCase();
  const role = Array.isArray(node?.role) ? node.role.map(String) : node?.role ? [String(node.role)] : [];
  const inet = role.some((r: string) => r.toLowerCase() === 'inet') || node?.global === true;
  return inet && !type.includes('wifi') && !type.includes('mobile') && !id.startsWith('wifi');
}

export default function Ethernet() {
  const creds = useCreds();
  const { colors, haptic } = useSettings();
  const alert = useAlert();
  const { confirm } = useAlertDialog();

  const ipReq = useApi('eth-ip', () => Api.internetConnections(creds));
  const ifaceReq = useApi('eth-iface', () => Api.interface(creds));
  const rcReq = useApi('eth-rc', () => Api.rcInterface(creds));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openVlan, setOpenVlan] = useState(false);
  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<Connection>>>({});

  const connections = useMemo<Connection[]>(() => {
    const rcNodes = extractRcInterfaces(rcReq.data);
    const rcById = new Map(rcNodes.map((n) => [String(n.name ?? n.id ?? ''), n]));

    const showList = toArray(ipReq.data);
    const ifaceList = toArray(ifaceReq.data);

    const merged: Connection[] = [];
    const seen = new Set<string>();

    for (const c of showList) {
      const id = String(c?.id ?? c?.interface ?? c?.['interface-name'] ?? '');
      if (!id || seen.has(id)) continue;
      const rc = rcById.get(id) ?? {};
      const show = ifaceList.find((i: any) => String(i?.id ?? i?.['interface-name'] ?? '') === id) ?? {};
      const role = Array.isArray(c?.role) ? c.role.map(String) : c?.role ? [String(c.role)] : [];
      const looksWifi = String(c?.type ?? '').toLowerCase().includes('wifi') || id.toLowerCase().startsWith('wifi');
      const isInet = role.some((r: string) => String(r).toLowerCase() === 'inet') || c?.global === true;
      if (!looksWifi && (isInet || id.toLowerCase().includes('isp') || String(rc?.description ?? ''))) {
        seen.add(id);
        merged.push(buildConnection(id, c, show, rc));
      }
    }

    // Подключения могут быть только в running-config (например, выключенные).
    for (const n of rcNodes) {
      const id = String(n?.name ?? '');
      if (!id || seen.has(id) || !isEthernetInternet(n)) continue;
      seen.add(id);
      merged.push(buildConnection(id, {}, {}, n));
    }

    return merged;
  }, [ipReq.data, ifaceReq.data, rcReq.data]);

  const withOverrides = connections.map((c) =>
    localOverrides[c.id] ? { ...c, ...localOverrides[c.id] } : c,
  );

  const selected = withOverrides.find((c) => c.id === selectedId) ?? withOverrides[0] ?? null;

  if (ipReq.loading || ifaceReq.loading || rcReq.loading) return <LoadingState />;
  if (ipReq.error && rcReq.error) return <ErrorState message={ipReq.error} onRetry={ipReq.refetch} />;
  if (withOverrides.length === 0) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Ethernet-подключение не найдено"
        subtitle="На роутере не настроено проводное подключение к интернету."
      />
    );
  }

  const apply = (patch: Partial<Connection>) => {
    if (!selected) return;
    setLocalOverrides((prev) => ({ ...prev, [selected.id]: { ...(prev[selected.id] ?? {}), ...patch } }));
  };

  const runToggle = (next: boolean) => {
    if (!selected) return;
    confirm(
      next ? `Включить «${selected.description}»?` : `Отключить «${selected.description}»?`,
      next ? 'Подключение будет включено, настройки сохранятся.' : 'Доступ в интернет через это подключение пропадёт.',
      async () => {
        setBusy(true);
        const previous = selected.enabled;
        apply({ enabled: next });
        try {
          await Api.setConnectionUp(creds, selected.id, next);
          if (ipReq.data) await ipReq.refetch();
        } catch (e: any) {
          apply({ enabled: previous });
          alert.show({ title: 'Не удалось применить', message: e?.message ?? 'Роутер отклонил команду.', actions: [{ text: 'OK' }] });
        } finally {
          setBusy(false);
        }
      },
      { confirmText: next ? 'Включить' : 'Отключить', destructive: !next },
    );
  };

  const renameProvider = (value: string) => {
    apply({ description: value });
  };

  const commitRename = async () => {
    if (!selected) return;
    try {
      await Api.setConnectionDescription(creds, selected.id, selected.description);
      if (ipReq.data) await ipReq.refetch();
    } catch (e: any) {
      alert.show({ title: 'Не удалось сохранить имя', message: e?.message ?? 'Роутер отклонил команду.', actions: [{ text: 'OK' }] });
    }
  };

  const removeConnection = () => {
    if (!selected) return;
    confirm(
      `Удалить «${selected.description}»?`,
      'Подключение будет удалено с роутера. Это действие нельзя отменить.',
      async () => {
        setBusy(true);
        try {
          await Api.removeConnection(creds, selected.id);
          setLocalOverrides((prev) => {
            const next = { ...prev };
            delete next[selected.id];
            return next;
          });
          setSelectedId(null);
          if (ipReq.data) await ipReq.refetch();
        } catch (e: any) {
          alert.show({ title: 'Не удалось удалить', message: e?.message ?? 'Роутер отклонил команду.', actions: [{ text: 'OK' }] });
        } finally {
          setBusy(false);
        }
      },
      { confirmText: 'Удалить', destructive: true },
    );
  };

  const pickFrom = (
    title: string,
    options: { value: string; label: string }[],
    current: string,
    onPick: (v: string) => void,
  ) => {
    alert.show({
      title,
      options: [
        ...options.map((o) => ({ text: o.label, value: o.value, onPress: () => onPick(o.value) })),
        { text: 'Отмена', value: 'cancel' },
      ],
    });
  };

  const addConnection = () => {
    alert.show({
      title: 'Новое подключение',
      message: 'Создать Ethernet-подключение с автоматическими настройками (DHCP)?',
      actions: [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Создать',
          onPress: async () => {
            setBusy(true);
            try {
              const id = `ISP${withOverrides.length + 1}`;
              await Api.addEthernetConnection(creds, id);
              if (ipReq.data) await ipReq.refetch();
            } catch (e: any) {
              alert.show({ title: 'Не удалось создать', message: e?.message ?? 'Роутер отклонил команду.', actions: [{ text: 'OK' }] });
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    });
  };

  return (
    <View style={{ gap: Spacing.sm }}>
      {/* ── Заголовок страницы ── */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        <Text style={{ flex: 1, fontFamily: FONT.bold, fontSize: 20, color: colors.text }}>
          Подключения к интернету по Ethernet-кабелю
        </Text>
        <Ionicons name="help-circle-outline" size={17} color={colors.textMuted} style={{ marginTop: 4 }} />
      </View>
      <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary }}>
        Настройте доступ в Интернет и дополнительные услуги в соответствии с требованиями провайдера. С легкостью
        подключайтесь к нескольким провайдерам одновременно для обеспечения отказоустойчивости и балансировки нагрузки.
      </Text>

      {/* ── Список подключений ── */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: Spacing.xs, flexWrap: 'wrap' }}>
        {withOverrides.map((c) => {
          const active = selected?.id === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                haptic();
                setSelectedId(c.id);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginRight: 6,
                borderBottomWidth: 2,
                borderBottomColor: active ? colors.accent : 'transparent',
              }}
            >
              <Text
                style={{
                  fontFamily: active ? FONT.semiBold : FONT.regular,
                  fontSize: 14,
                  color: active ? colors.accent : colors.textSecondary,
                }}
                numberOfLines={1}
              >
                {c.description}
              </Text>
            </Pressable>
          );
        })}
        <Pressable onPress={addConnection} disabled={busy} hitSlop={10} style={{ padding: 8 }}>
          <Ionicons name="add" size={20} color={colors.accent} />
        </Pressable>
      </View>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />

      {selected ? (
        <>
          {/* ── Ethernet-подключение: вкл/выкл ── */}
          <FormSectionTitle>Ethernet-подключение</FormSectionTitle>
          <View style={styles.inlineRow}>
            <Switch
              value={selected.enabled}
              disabled={busy}
              onValueChange={runToggle}
              trackColor={{ false: colors.divider, true: colors.accentDim }}
              thumbColor={selected.enabled ? colors.accent : colors.textMuted}
            />
            <View
              style={[
                styles.pill,
                { backgroundColor: (selected.up ? colors.online : colors.offline) + '22', marginLeft: 10 },
              ]}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: selected.up ? colors.online : colors.offline,
                }}
              />
              <Text
                style={[
                  styles.pillText,
                  { color: selected.up ? colors.online : colors.offline },
                ]}
              >
                {selected.up ? 'Подключено' : selected.enabled ? 'Не подключено' : 'Отключено'}
              </Text>
            </View>
          </View>

          <SelectField
            label="Расписание работы"
            value={optionLabel(SCHEDULES, selected.schedule ?? 'always')}
            onPress={() =>
              pickFrom('Расписание работы', SCHEDULES, selected.schedule ?? 'always', (v) => apply({ schedule: v }))
            }
          />
          <SelectField
            label="Приоритет подключения"
            value={optionLabel(PRIORITIES, selected.priority ?? 'default')}
            onPress={() =>
              pickFrom('Приоритет подключения', PRIORITIES, selected.priority ?? 'default', (v) => apply({ priority: v }))
            }
          />

          <LabeledInput
            label="Имя провайдера"
            value={selected.description}
            onChangeText={renameProvider}
            autoCapitalize="sentences"
          />
          <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: colors.textMuted, marginTop: -4, marginBottom: Spacing.sm }}>
            Вы можете назвать это подключение, как вам удобно.
          </Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <ActionButton label="Сохранить имя" icon="checkmark-outline" variant="outline" onPress={commitRename} disabled={busy} />
            <ActionButton label="Удалить подключение" icon="trash-outline" variant="outline" onPress={removeConnection} disabled={busy} />
          </View>

          {/* ── Порты и VLAN'ы ── */}
          <FormSectionTitle>Порты и VLAN'ы</FormSectionTitle>
          <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary }}>
            Если провайдер выдал вам номера VLAN для подключения к интернету, IP-телевидению или IP-телефонии, введите их
            в соответствующих полях и выберите порты для подключения приставки IPTV и IP-телефона.
          </Text>
          <PortsRow selectedPort={selected.type ? undefined : undefined} />

          <Pressable onPress={() => { haptic(); setOpenVlan((v) => !v); }} style={styles.linkRow}>
            <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: colors.accent }}>
              VLAN для интернета, IP-телефонии и IP-телевидения
            </Text>
            <Ionicons name={openVlan ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accent} />
          </Pressable>
          {openVlan ? (
            <View style={{ gap: Spacing.xs, marginTop: Spacing.xs }}>
              <LabeledInput label="VLAN интернета" value="" placeholder="Не задан" keyboardType="number-pad" />
              <LabeledInput label="VLAN IP-телефонии" value="" placeholder="Не задан" keyboardType="number-pad" />
              <LabeledInput label="VLAN IP-телевидения" value="" placeholder="Не задан" keyboardType="number-pad" />
            </View>
          ) : null}

          {/* ── Параметры IPv4 ── */}
          <FormSectionTitle>Параметры IPv4</FormSectionTitle>
          {selected.address ? (
            <View style={[styles.pill, { backgroundColor: colors.online + '22', alignSelf: 'flex-start' }]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.online }} />
              <Text style={[styles.pillText, { color: colors.online }]}>IP-АДРЕС {selected.address}</Text>
            </View>
          ) : null}
          <SelectField
            label="Настройка IPv4"
            value={optionLabel(IPV4_MODES, selected.dhcp === false ? 'static' : 'dhcp')}
            onPress={() => pickFrom('Настройка IPv4', IPV4_MODES, 'dhcp', () => {})}
          />
          <LabeledInput label="IPv4 DNS 1" value="" placeholder="Не задан" editable={false} />
          <CheckboxRow label="Игнорировать DNSv4 интернет-провайдера" checked={false} disabled />

          {/* ── Параметры IPv6 ── */}
          <FormSectionTitle>Параметры IPv6</FormSectionTitle>
          <SelectField
            label="Настройка IPv6"
            value={optionLabel(IPV6_MODES, 'none')}
            onPress={() => pickFrom('Настройка IPv6', IPV6_MODES, 'none', () => {})}
          />

          {/* ── Требования провайдера ── */}
          <FormSectionTitle>Требования провайдера</FormSectionTitle>
          <SelectField
            label="MAC-адрес"
            value={optionLabel(MAC_MODES, 'default')}
            onPress={() => pickFrom('MAC-адрес', MAC_MODES, 'default', () => {})}
          />
          <LabeledInput label="Имя устройства" value="" placeholder="Не задано" editable={false} />
          <LabeledInput
            label="Размер MTU"
            value={selected.mtu != null ? String(selected.mtu) : '1500'}
            editable={false}
            keyboardType="numeric"
          />

          {/* ── Аутентификация у провайдера ── */}
          <FormSectionTitle>Аутентификация у провайдера (PPPoE / PPTP / L2TP)</FormSectionTitle>
          <SelectField
            label="Тип (протокол)"
            value={optionLabel(AUTH_TYPES, selected.authType ?? 'none')}
            onPress={() => pickFrom('Тип (протокол)', AUTH_TYPES, 'none', (v) => apply({ authType: v }))}
          />

          {/* ── 802.1x ── */}
          <FormSectionTitle>Проверка подлинности по стандарту 802.1x</FormSectionTitle>
          <SelectField
            label="Метод проверки подлинности"
            value={optionLabel(DOT1X_MODES, 'none')}
            onPress={() => pickFrom('Метод проверки подлинности', DOT1X_MODES, 'none', () => {})}
          />

          {/* ── Ping Check ── */}
          <FormSectionTitle>Проверка доступности интернета (Ping Check)</FormSectionTitle>
          <SelectField
            label="Режим"
            value={optionLabel(PING_MODES, 'none')}
            onPress={() => pickFrom('Режим', PING_MODES, 'none', () => {})}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.md }}>
            <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} />
            <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textMuted, textAlign: 'center' }}>
              Часть полей доступна только на самом роутере
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Строит запись подключения из трёх источников RCI. */
function buildConnection(id: string, show: any, iface: any, rc: any): Connection {
  const address = show?.address ?? rc?.address ?? iface?.address;
  return {
    id,
    description: String(rc?.description ?? show?.description ?? id),
    type: String(show?.type ?? iface?.type ?? ''),
    up: show?.link === 'up' || show?.connected === 'yes' || iface?.link === 'up',
    enabled: show?.state !== 'down' && rc?.down !== true,
    address: address ? String(address) : undefined,
    mask: show?.mask ? String(show.mask) : undefined,
    gateway: show?.gateway ? String(show.gateway) : undefined,
    mac: show?.mac ? String(show.mac) : undefined,
    mtu: show?.mtu != null ? Number(show.mtu) : undefined,
    dhcp: rc?.address === 'dhcp' || String(rc?.address ?? '').toLowerCase() === 'dhcp',
    schedule: rc?.schedule ? String(rc.schedule) : undefined,
    priority: rc?.priority ? String(rc.priority) : undefined,
    authType: rc?.ppp ? String(rc.ppp) : undefined,
  };
}

/** Ряд портов Ethernet, как в веб-интерфейсе (с нумерацией и слотом SFP). */
function PortsRow({ selectedPort }: { selectedPort?: string }) {
  const { colors, haptic } = useSettings();
  const [picked, setPicked] = useState<string | null>(null);
  const ports = ['0', '1', '2', '3', '4'];

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.xs }}>
      {ports.map((p) => {
        const active = picked === p;
        return (
          <Pressable
            key={p}
            onPress={() => {
              haptic();
              setPicked(active ? null : p);
            }}
            style={[
              styles.port,
              {
                backgroundColor: active ? colors.accent : colors.card,
                borderColor: active ? colors.accent : colors.border,
              },
            ]}
          >
            <Ionicons name="git-network-outline" size={18} color={active ? '#FFFFFF' : colors.textSecondary} />
            <Text style={{ fontFamily: FONT.semiBold, fontSize: 12, color: active ? '#FFFFFF' : colors.text, marginTop: 2 }}>
              {p}
            </Text>
          </Pressable>
        );
      })}
      <View
        style={[
          styles.port,
          { backgroundColor: colors.cardAlt, borderColor: colors.border, borderStyle: 'dashed', flexDirection: 'row', gap: 4 },
        ]}
      >
        <Ionicons name="git-network-outline" size={18} color={colors.textMuted} />
        <Text style={{ fontFamily: FONT.semiBold, fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>SFP</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontFamily: FONT.semiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  port: {
    width: 54,
    height: 52,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});