import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { MonitorCard, PortsGrid, type PortInfo } from '../../components/MonitorWidgets';
import { ObjectView } from '../../components/ObjectView';
import { ActionButton, CheckboxRow, LabeledInput, SelectField } from '../../components/FormParts';
import { useAlert, useAlertDialog } from '../../components/AlertDialog';
import { useApi } from '../../hooks/useApi';
import { useCreds } from '../../hooks/useCreds';
import { Api, toArray } from '../../lib/api';
import { asInterfaces, hasRole, ifaceId, isUp } from '../../lib/interfaces';
import { useSettings } from '../../context/SettingsContext';
import { FONT, Radius, Spacing } from '../../theme/colors';

/**
 * «Кабель Ethernet» — проводные интернет-подключения, как в веб-интерфейсе
 * KeeneticOS: список подключений, расписание и приоритет, имя провайдера,
 * порты и VLAN'ы, параметры IPv4/IPv6, требования провайдера, аутентификация
 * PPPoE/PPTP/L2TP, 802.1x и Ping Check.
 *
 * Данные берутся из двух источников сразу (`show/interface` и
 * `show/ip/interface`): если один на этой прошивке пуст, страница всё равно
 * покажет подключения из второго. Сырые ответы видны внизу.
 *
 * Порты рисуются тем же компонентом, что и в «Системном мониторе», — с
 * картинками портов роутера, а не с условными значками.
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
  source: string;
}

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/** «1.2.3.4/24» → адрес и маска по отдельности. */
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

  // Оба запроса идут параллельно и не роняют страницу поодиночке.
  const req = useApi('eth-conns', async () => {
    const [ifaces, ipIface] = await Promise.all([
      settle(Api.interface(creds)),
      settle(Api.internetConnections(creds)),
    ]);
    return { ifaces, ipIface };
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openVlan, setOpenVlan] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Partial<EthConn>>>({});

  const raw = req.data as { ifaces: unknown; ipIface: unknown } | null;

  const connections = useMemo<EthConn[]>(() => {
    if (!raw) return [];
    const byId = new Map<string, EthConn>();

    // --- Источник 1: show/interface, интерфейсы с ролью inet ---
    for (const i of asInterfaces(raw.ifaces)) {
      const inet = hasRole(i, 'inet') || i.global === true;
      if (!inet) continue;
      const id = ifaceId(i);
      if (!id || id === '—') continue;
      byId.set(id, {
        id,
        description: String(i.description || i.name || i['interface-name'] || id),
        type: i.type ? String(i.type) : undefined,
        up: isUp(i),
        enabled: String(i.state ?? '').toLowerCase() !== 'down',
        mac: i.mac || i.hwaddr ? String(i.mac || i.hwaddr) : undefined,
        mtu: i.mtu != null ? Number(i.mtu) : undefined,
        ...splitAddress(i.address),
        source: 'show/interface',
      });
    }

    // --- Источник 2: show/ip/interface ---
    for (const c of toArray(raw.ipIface)) {
      const id = String(c?.id ?? c?.interface ?? c?.['interface-name'] ?? c?._key ?? '');
      if (!id || id === 'undefined') continue;
      const existing = byId.get(id);
      const parsed = splitAddress(c?.address);
      if (existing) {
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
  }, [raw]);

  // Порты роутера — тот же источник, что в «Системном мониторе».
  const ports = useMemo<PortInfo[]>(() => {
    return asInterfaces(raw?.ifaces)
      .filter((i) => String(i.type ?? '') === 'Port')
      .map((p, idx) => ({
        key: String(p.id ?? idx),
        label: String(p.description ?? String(p['interface-name'] ?? p.id ?? idx).split('/').pop() ?? idx),
        up: String(p.link ?? '') === 'up',
        speed: p.speed != null ? Number(p.speed) : null,
        duplex: p.duplex != null ? String(p.duplex) : null,
      }));
  }, [raw]);

  const list = connections.map((c) => (overrides[c.id] ? { ...c, ...overrides[c.id] } : c));
  const selected = list.find((c) => c.id === selectedId) ?? list[0] ?? null;

  if (req.loading) return <LoadingState />;
  if (req.error) return <ErrorState message={req.error} onRetry={req.refetch} />;

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
          alert.show({
            title: 'Не удалось применить',
            message: e?.message ?? 'Роутер отклонил команду.',
            actions: [{ text: 'OK' }],
          });
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
      alert.show({
        title: 'Не удалось сохранить имя',
        message: e?.message ?? 'Роутер отклонил команду.',
        actions: [{ text: 'OK' }],
      });
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
          alert.show({
            title: 'Не удалось удалить',
            message: e?.message ?? 'Роутер отклонил команду.',
            actions: [{ text: 'OK' }],
          });
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

  const showHelp = () => {
    haptic();
    alert.show({
      title: 'Кабель Ethernet',
      message:
        'Здесь настраиваются проводные подключения к интернету: выбор провайдера, расписание и приоритет, ' +
        'параметры IPv4 и IPv6, требования провайдера (MAC-адрес, MTU), а также аутентификация PPPoE/PPTP/L2TP ' +
        'и проверка доступности интернета.\n\n' +
        'Верхний переключатель включает и выключает выбранное подключение. Имя провайдера можно изменить — ' +
        'оно сохраняется на роутере.\n\n' +
        'Часть полей доступна только в веб-интерфейсе роутера.',
      actions: [{ text: 'Понятно' }],
    });
  };

  return (
    <View style={{ gap: Spacing.md }}>
      {/* ── Заголовок с подсказкой по кнопке ── */}
      <View style={styles.headerRow}>
        <Text style={{ flex: 1, fontFamily: FONT.bold, fontSize: 20, color: colors.text }}>
          Подключения по Ethernet-кабелю
        </Text>
        <Pressable onPress={showHelp} hitSlop={10} style={styles.helpBtn}>
          <Ionicons name="help-circle-outline" size={22} color={colors.accent} />
        </Pressable>
      </View>

      {/* ── Выбор подключения ── */}
      <MonitorCard title="Подключения">
        {list.length === 0 ? (
          <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: colors.textSecondary }}>
            Роутер не вернул ни одного интернет-подключения. Ответ роутера — в разделе ниже.
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {list.map((c) => {
              const active = selected?.id === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    haptic();
                    setSelectedId(c.id);
                  }}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: active ? colors.accent : colors.cardAlt,
                      borderColor: active ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: active ? FONT.semiBold : FONT.regular,
                      fontSize: 13,
                      color: active ? '#FFFFFF' : colors.textSecondary,
                    }}
                    numberOfLines={1}
                  >
                    {c.description}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </MonitorCard>

      {selected ? (
        <>
          {/* ── Состояние и имя ── */}
          <MonitorCard
            title="Ethernet-подключение"
            right={
              <Switch
                value={selected.enabled}
                disabled={busy}
                onValueChange={runToggle}
                trackColor={{ false: colors.divider, true: colors.accentDim }}
                thumbColor={selected.enabled ? colors.accent : colors.textMuted}
              />
            }
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm }}>
              <View
                style={[styles.pill, { backgroundColor: (selected.up ? colors.online : colors.offline) + '22' }]}
              >
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

            <LabeledInput
              label="Имя провайдера"
              value={selected.description}
              onChangeText={(v) => apply({ description: v })}
              autoCapitalize="sentences"
            />
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: 2 }}>
              <ActionButton
                label="Сохранить имя"
                icon="checkmark-outline"
                onPress={commitRename}
                disabled={busy}
                style={{ flex: 1 }}
              />
              <ActionButton
                label="Удалить"
                icon="trash-outline"
                variant="danger"
                onPress={removeConnection}
                disabled={busy}
              />
            </View>
          </MonitorCard>

          {/* ── Расписание и приоритет ── */}
          <MonitorCard title="Режим работы">
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
          </MonitorCard>

          {/* ── Данные подключения ── */}
          <MonitorCard title="Параметры подключения">
            <ObjectView
              data={{
                'Идентификатор': selected.id,
                'IP-адрес': selected.address ?? '—',
                'Маска': selected.mask ?? '—',
                'Шлюз': selected.gateway ?? '—',
                'MAC-адрес': selected.mac ?? '—',
                'MTU': selected.mtu != null ? String(selected.mtu) : '—',
                'Источник данных': selected.source,
              }}
              maxDepth={1}
            />
          </MonitorCard>

          {/* ── Порты как в «Системном мониторе» ── */}
          <MonitorCard title="Сетевые порты">
            {ports.length > 0 ? (
              <PortsGrid ports={ports} />
            ) : (
              <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: colors.textSecondary }}>
                Роутер не сообщил список портов.
              </Text>
            )}
          </MonitorCard>

          {/* ── Порты и VLAN'ы ── */}
          <MonitorCard title="Порты и VLAN'ы">
            <Text style={{ fontFamily: FONT.regular, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary }}>
              Если провайдер выдал номера VLAN для интернета, IP-телевидения или IP-телефонии, введите их ниже.
            </Text>
            <Pressable onPress={() => { haptic(); setOpenVlan((v) => !v); }} style={styles.linkRow}>
              {/* Стрелка у самого края уходила за границу панели — отодвигаем её
                  вправо отступом, а текст занимает всё остальное место. */}
              <Text style={{ flex: 1, fontFamily: FONT.medium, fontSize: 13, color: colors.accent }}>
                VLAN для интернета, IP-телефонии и IP-телевидения
              </Text>
              <View style={styles.linkIcon}>
                <Ionicons name={openVlan ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accent} />
              </View>
            </Pressable>
            {openVlan ? (
              <View style={{ marginTop: Spacing.xs }}>
                <LabeledInput label="VLAN интернета" value="" placeholder="Не задан" keyboardType="number-pad" />
                <LabeledInput label="VLAN IP-телефонии" value="" placeholder="Не задан" keyboardType="number-pad" />
                <LabeledInput label="VLAN IP-телевидения" value="" placeholder="Не задан" keyboardType="number-pad" />
              </View>
            ) : null}
          </MonitorCard>

          {/* ── IPv4 и IPv6 ── */}
          <MonitorCard title="Параметры IPv4">
            {selected.address ? (
              <View style={[styles.pill, { backgroundColor: colors.online + '22', alignSelf: 'flex-start', marginBottom: Spacing.sm }]}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.online }} />
                <Text style={[styles.pillText, { color: colors.online }]}>IP-АДРЕС {selected.address}</Text>
              </View>
            ) : null}
            <SelectField
              label="Настройка IPv4"
              value={optionLabel(IPV4_MODES, 'dhcp')}
              onPress={() => pickFrom('Настройка IPv4', IPV4_MODES, () => {})}
            />
            <CheckboxRow label="Игнорировать DNSv4 интернет-провайдера" checked={false} disabled />
          </MonitorCard>

          <MonitorCard title="Параметры IPv6">
            <SelectField
              label="Настройка IPv6"
              value={optionLabel(IPV6_MODES, 'none')}
              onPress={() => pickFrom('Настройка IPv6', IPV6_MODES, () => {})}
            />
          </MonitorCard>

          {/* ── Требования провайдера ── */}
          <MonitorCard title="Требования провайдера">
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
          </MonitorCard>

          {/* ── Аутентификация и проверки ── */}
          <MonitorCard title="Аутентификация у провайдера (PPPoE / PPTP / L2TP)">
            <SelectField
              label="Тип (протокол)"
              value={optionLabel(AUTH_TYPES, 'none')}
              onPress={() => pickFrom('Тип (протокол)', AUTH_TYPES, () => {})}
            />
          </MonitorCard>

          <MonitorCard title="Проверка подлинности 802.1x">
            <SelectField
              label="Метод проверки подлинности"
              value={optionLabel(DOT1X_MODES, 'none')}
              onPress={() => pickFrom('Метод проверки подлинности', DOT1X_MODES, () => {})}
            />
          </MonitorCard>

          <MonitorCard title="Проверка доступности интернета (Ping Check)">
            <SelectField
              label="Режим"
              value={optionLabel(PING_MODES, 'none')}
              onPress={() => pickFrom('Режим', PING_MODES, () => {})}
            />
          </MonitorCard>

          </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  helpBtn: {
    padding: 2,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
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
    paddingVertical: 10,
  },
  /** Место под стрелку у правого края панели, чтобы она не упиралась в рамку. */
  linkIcon: {
    width: 24,
    marginLeft: 8,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  });