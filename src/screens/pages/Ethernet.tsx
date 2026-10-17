import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { PageCard } from '../../components/PageParts';
import { ObjectView } from '../../components/ObjectView';
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
import { asInterfaces, hasRole, ifaceId, ifaceName, isUp, type Iface } from '../../lib/interfaces';
import { useSettings } from '../../context/SettingsContext';
import { FONT, Radius, Spacing } from '../../theme/colors';

/**
 * «Кабель Ethernet» — страница проводных интернет-подключений, повторяющая
 * веб-интерфейс KeeneticOS: список подключений, расписание, приоритет, имя
 * провайдера, порты и VLAN'ы, параметры IPv4/IPv6, требования провайдера,
 * аутентификация PPPoE/PPTP/L2TP, 802.1x и Ping Check.
 *
 * Данные берутся из двух источников сразу:
 *  - `show/interface` — интерфейсы с ролью `inet` (проверенный источник, по нему
 *    же работал прежний список подключений);
 *  - `show/ip/interface` — параметры IP-стека подключений.
 *
 * Источники объединяются: если один из них на этой прошивке отдаёт другое или
 * пустое, страница всё равно покажет подключения из второго, а сырые ответы
 * всегда видны в самом низу — чтобы не приходилось гадать, что вернул роутер.
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

function optionLabel(options: { value: string; label: string }[], value: string): string {
  const found = options.find((o) => o.value === value);
  return found ? found.label : value || '—';
}

interface EthConn {
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
  /** Из какого запроса пришли данные — показывается в деталях. */
  source: string;
}

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/** «1.2.3.4/24» -> адрес и маска по отдельности. */
function splitAddress(value: unknown): { address?: string; mask?: string } {
  if (typeof value !== 'string' || !value) return {};
  const [address, mask] = value.split('/');
  return { address, mask };
}

export default function Ethernet() {
  const creds = useCreds();
  const { colors, haptic } = useSettings();
  const alert = useAlert();
  const { confirm } = useAlertDialog();

  // Оба запроса идут параллельно и не роняют страницу поодиночке: если один
  // не поддержан прошивкой, данные берутся из второго.
  const req = useApi('eth-conns', async () => {
    const [ifaces, ipIface, system] = await Promise.all([
      settle(Api.interface(creds)),
      settle(Api.internetConnections(creds)),
      settle(Api.system(creds)),
    ]);
    return { ifaces, ipIface, system };
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openVlan, setOpenVlan] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Partial<EthConn>>>({});

  const connections = useMemo<EthConn[]>(() => {
    const data = req.data as { ifaces: unknown; ipIface: unknown; system: unknown } | null;
    if (!data) return [];

    const byId = new Map<string, EthConn>();

    // --- Источник 1: show/interface, интерфейсы с ролью inet ---
    for (const i of asInterfaces(data.ifaces)) {
      const inet = hasRole(i, 'inet') || i.global === true;
      if (!inet) continue;
      const id = ifaceId(i);
      if (!id || id === '—') continue;
      const up = isUp(i);
      byId.set(id, {
        id,
        description: String(i.description || i.name || i['interface-name'] || id),
        type: i.type ? String(i.type) : undefined,
        up,
        enabled: String(i.state ?? '').toLowerCase() !== 'down',
        mac: i.mac || i.hwaddr ? String(i.mac || i.hwaddr) : undefined,
        mtu: i.mtu != null ? Number(i.mtu) : undefined,
        ...splitAddress(i.address),
        source: 'show/interface',
      });
    }

    // --- Источник 2: show/ip/interface ---
    for (const c of toArray(data.ipIface)) {
      const id = String(c?.id ?? c?.interface ?? c?.['interface-name'] ?? c?._key ?? '');
      if (!id || id === 'undefined') continue;
      const existing = byId.get(id);
      const parsed = splitAddress(c?.address);
      if (existing) {
        // Данные второго источника точнее по IP — дополняем, не перетирая.
        byId.set(id, {
          ...existing,
          address: parsed.address ?? existing.address,
          mask: c?.mask ? String(c.mask) : parsed.mask ?? existing.mask,
          gateway: c?.gateway ? String(c.gateway) : existing.gateway,
          enabled: c?.state !== 'down',
          up: existing.up || c?.link === 'up' || c?.connected === 'yes',
          source: 'show/interface + show/ip/interface',
        });
      } else {
        byId.set(id, {
          id,
          description: String(c?.description ?? c?.name ?? id),
          type: c?.type ? String(c.type) : undefined,
          up: c?.link === 'up' || c?.connected === 'yes',
          enabled: c?.state !== 'down',
          mac: c?.mac ? String(c.mac) : undefined,
          mtu: c?.mtu != null ? Number(c.mtu) : undefined,
          gateway: c?.gateway ? String(c.gateway) : undefined,
          ...parsed,
          source: 'show/ip/interface',
        });
      }
    }

    return [...byId.values()];
  }, [req.data]);

  const list = connections.map((c) => (overrides[c.id] ? { ...c, ...overrides[c.id] } : c));
  const selected = list.find((c) => c.id === selectedId) ?? list[0] ?? null;

  if (req.loading) return <LoadingState />;
  if (req.error) return <ErrorState message={req.error} onRetry={req.refetch} />;

  const raw = req.data as { ifaces: unknown; ipIface: unknown; system: unknown } | null;

  // Пусто только если роутер действительно ничего не отдал — тогда честно
  // показываем ответ как есть, а не сообщение «не найдено» без объяснений.
  if (list.length === 0) {
    return (
      <View style={{ gap: Spacing.md }}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Подключения не найдены"
          subtitle="Роутер не вернул ни одного интернет-подключения. Ниже — ответ роутера как есть."
        />
        <PageCard title="Ответ роутера">
          <ObjectView data={raw?.ipIface ?? null} maxDepth={4} />
        </PageCard>
        <PageCard title="Интерфейсы">
          <ObjectView data={raw?.ifaces ?? null} maxDepth={3} />
        </PageCard>
      </View>
    );
  }

  const apply = (patch: Partial<EthConn>) => {
    if (!selected) return;
    setOverrides((prev) => ({ ...prev, [selected.id]: { ...(prev[selected.id] ?? {}), ...patch } }));
  };

  const runToggle = (next: boolean) => {
    if (!selected) return;
    confirm(
      next ? `Включить «${selected.description}»?` : `Отключить «${selected.description}»?`,
      next ? 'Подключение будет включено, настройки сохранятся.' : 'Доступ в интернет через это подключение пропадёт.',
      async () => {
        setBusy(true);
        const before = selected.enabled;
        apply({ enabled: next });
        try {
          await Api.setConnectionUp(creds, selected.id, next);
          await req.refetch();
        } catch (e: any) {
          apply({ enabled: before });
          alert.show({ title: 'Не удалось применить', message: e?.message ?? 'Роутер отклонил команду.', actions: [{ text: 'OK' }] });
        } finally {
          setBusy(false);
        }
      },
      { confirmText: next ? 'Включить' : 'Отключить', destructive: !next },
    );
  };

  const commitRename = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await Api.setConnectionDescription(creds, selected.id, selected.description);
      await req.refetch();
      alert.show({ title: 'Имя сохранено', message: 'Новое имя применено на роутере.', actions: [{ text: 'OK' }] });
    } catch (e: any) {
      alert.show({ title: 'Не удалось сохранить имя', message: e?.message ?? 'Роутер отклонил команду.', actions: [{ text: 'OK' }] });
    } finally {
      setBusy(false);
    }
  };

  const removeConnection = () => {
    if (!selected) return;
    confirm(
      `Удалить «${selected.description}»?`,
      'Подключение будет удалено на роутере. Действие нельзя отменить.',
      async () => {
        setBusy(true);
        try {
          await Api.removeConnection(creds, selected.id);
          setSelectedId(null);
          await req.refetch();
        } catch (e: any) {
          alert.show({ title: 'Не удалось удалить', message: e?.message ?? 'Роутер отклонил команду.', actions: [{ text: 'OK' }] });
        } finally {
          setBusy(false);
        }
      },
      { confirmText: 'Удалить', destructive: true },
    );
  };

  const pickFrom = (title: string, options: { value: string; label: string }[], onPick: (v: string) => void) => {
    alert.show({
      title,
      options: [
        ...options.map((o) => ({ text: o.label, value: o.value, onPress: () => onPick(o.value) })),
        { text: 'Отмена', value: 'cancel' },
      ],
    });
  };

  return (
    <View style={{ gap: Spacing.sm }}>
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
        {list.map((c) => {
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
      </View>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />

      {selected ? (
        <>
          <FormSectionTitle>Ethernet-подключение</FormSectionTitle>
          <View style={styles.inlineRow}>
            <Switch
              value={selected.enabled}
              disabled={busy}
              onValueChange={runToggle}
              trackColor={{ false: colors.divider, true: colors.accentDim }}
              thumbColor={selected.enabled ? colors.accent : colors.textMuted}
            />
            <View style={[styles.pill, { backgroundColor: (selected.up ? colors.online : colors.offline) + '22', marginLeft: 10 }]}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: selected.up ? colors.online : colors.offline,
                }}
              />
              <Text style={[styles.pillText, { color: selected.up ? colors.online : colors.offline }]}>
                {selected.up ? 'Подключено' : selected.enabled ? 'Не подключено' : 'Отключено'}
              </Text>
            </View>
          </View>

          <SelectField
            label="Расписание работы"
            value={optionLabel(SCHEDULES, 'always')}
            onPress={() => pickFrom('Расписание работы', SCHEDULES, () => {})}
          />
          <SelectField
            label="Приоритет подключения"
            value={optionLabel(PRIORITIES, 'default')}
            onPress={() => pickFrom('Приоритет подключения', PRIORITIES, () => {})}
          />

          <LabeledInput
            label="Имя провайдера"
            value={selected.description}
            onChangeText={(v) => apply({ description: v })}
            autoCapitalize="sentences"
          />
          <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: colors.textMuted, marginTop: -4, marginBottom: Spacing.sm }}>
            Вы можете назвать это подключение, как вам удобно.
          </Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <ActionButton label="Сохранить имя" icon="checkmark-outline" onPress={commitRename} disabled={busy} />
            <ActionButton label="Удалить" icon="trash-outline" onPress={removeConnection} disabled={busy} />
          </View>

          <FormSectionTitle>Параметры подключения</FormSectionTitle>
          <PageCard title="Получено от роутера">
            <ObjectView
              data={{
                'Идентификатор': selected.id,
                'IP-адрес': selected.address ?? '—',
                'Маска': selected.mask ?? '—',
                'Шлюз': selected.gateway ?? '—',
                'MAC-адрес': selected.mac ?? '—',
                'MTU': selected.mtu != null ? String(selected.mtu) : '—',
                'Тип': selected.type ?? '—',
                'Источник данных': selected.source,
              }}
              maxDepth={1}
            />
          </PageCard>

          <FormSectionTitle>Порты и VLAN'ы</FormSectionTitle>
          <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary }}>
            Если провайдер выдал номера VLAN для подключения к интернету, IP-телевидению или IP-телефонии, введите их
            в соответствующих полях и выберите порты для приставки IPTV и IP-телефона.
          </Text>
          <PortsRow />
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
            onPress={() => pickFrom('Настройка IPv4', IPV4_MODES, () => {})}
          />
          <CheckboxRow label="Игнорировать DNSv4 интернет-провайдера" checked={false} disabled />

          <FormSectionTitle>Параметры IPv6</FormSectionTitle>
          <SelectField
            label="Настройка IPv6"
            value={optionLabel(IPV6_MODES, 'none')}
            onPress={() => pickFrom('Настройка IPv6', IPV6_MODES, () => {})}
          />

          <FormSectionTitle>Требования провайдера</FormSectionTitle>
          <SelectField
            label="MAC-адрес"
            value={optionLabel(MAC_MODES, 'default')}
            onPress={() => pickFrom('MAC-адрес', MAC_MODES, () => {})}
          />
          <LabeledInput
            label="Размер MTU"
            value={selected.mtu != null ? String(selected.mtu) : '1500'}
            editable={false}
            keyboardType="numeric"
          />

          <FormSectionTitle>Аутентификация у провайдера (PPPoE / PPTP / L2TP)</FormSectionTitle>
          <SelectField
            label="Тип (протокол)"
            value={optionLabel(AUTH_TYPES, 'none')}
            onPress={() => pickFrom('Тип (протокол)', AUTH_TYPES, () => {})}
          />

          <FormSectionTitle>Проверка подлинности по стандарту 802.1x</FormSectionTitle>
          <SelectField
            label="Метод проверки подлинности"
            value={optionLabel(DOT1X_MODES, 'none')}
            onPress={() => pickFrom('Метод проверки подлинности', DOT1X_MODES, () => {})}
          />

          <FormSectionTitle>Проверка доступности интернета (Ping Check)</FormSectionTitle>
          <SelectField
            label="Режим"
            value={optionLabel(PING_MODES, 'none')}
            onPress={() => pickFrom('Режим', PING_MODES, () => {})}
          />

          {/* ── Сырые данные: видно ровно то, что ответил роутер ── */}
          <Pressable onPress={() => { haptic(); setShowRaw((v) => !v); }} style={styles.linkRow}>
            <Ionicons name={showRaw ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
            <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: colors.textSecondary, marginLeft: 6 }}>
              Данные с роутера
            </Text>
          </Pressable>
          {showRaw ? (
            <>
              <PageCard title="show /ip/interface">
                <ObjectView data={raw?.ipIface ?? null} maxDepth={4} />
              </PageCard>
              <PageCard title="show /interface">
                <ObjectView data={raw?.ifaces ?? null} maxDepth={3} />
              </PageCard>
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** Ряд портов Ethernet с нумерацией и слотом SFP. */
function PortsRow() {
  const { colors, haptic } = useSettings();
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.xs }}>
      {['0', '1', '2', '3', '4'].map((p) => {
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
              { backgroundColor: active ? colors.accent : colors.card, borderColor: active ? colors.accent : colors.border },
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