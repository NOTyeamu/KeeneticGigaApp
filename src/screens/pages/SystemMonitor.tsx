import { useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Row } from '../../components/Row';
import { useAlertDialog } from '../../components/AlertDialog';
import { LoadingState, ErrorState } from '../../components/States';
import {
  Badge,
  Donut,
  formatBps,
  KVGrid,
  LegendRow,
  MiniStat,
  MonitorCard,
  PortsGrid,
  SpeedChart,
  StatusPill,
  type PortInfo,
} from '../../components/MonitorWidgets';
import { useApi } from '../../hooks/useApi';
import { useLiveApi } from '../../hooks/useLiveApi';
import { useCreds } from '../../hooks/useCreds';
import { Api } from '../../lib/api';
import { formatBytes, formatDuration, formatNumber } from '../../lib/format';
import { useSettings } from '../../context/SettingsContext';
import { FONT, Spacing } from '../../theme/colors';

/**
 * Системный монитор — живой дашборд, повторяющий веб-интерфейс KeeneticOS.
 * Все значения приходят с роутера по RCI и автообновляются каждые 2,5 с.
 */

const PALETTE = ['#8E97FD', '#4FC3F7', '#FF6B81', '#FFD166', '#06D6A0', '#B388EB'];
const WINDOW_MS = 180000; // окно «за 3 минуты», как в вебе
const USB_ICON = require('../../../assets/usb_flash_icon.png');

/** Короткий аптайм для плитки: «1 д 12 ч», «5 ч 3 мин», «42 с». */
function shortDuration(seconds: any): string {
  let sec = typeof seconds === 'string' ? parseInt(seconds, 10) : seconds;
  if (sec == null || isNaN(sec) || sec < 0) return '—';
  sec = Math.floor(sec);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} д ${h} ч`;
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин`;
  return `${sec} с`;
}

async function settle(p: Promise<any>): Promise<any> {
  try {
    return await p;
  } catch {
    return null;
  }
}

function listify(v: any): any[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return Object.values(v);
  return [];
}

/** "72076/131072" (использовано/всего, КБ) → числа. */
function parsePair(s: any): { used: number; total: number } | null {
  if (typeof s !== 'string' || !s.includes('/')) return null;
  const [u, t] = s.split('/').map((x) => parseInt(x, 10));
  if (isNaN(u) || isNaN(t) || t <= 0) return null;
  return { used: u, total: t };
}

/** Канал обновления: preview → «Предварительный» и т.п. */
function sandboxRu(v: any): string | null {
  const s = String(v ?? '').toLowerCase();
  if (!s) return null;
  if (s === 'stable') return 'Стабильный';
  if (s === 'preview') return 'Предварительный';
  if (s === 'beta') return 'Бета';
  if (s === 'nightly' || s === 'draft' || s === 'dev') return 'Тестовый';
  return String(v);
}

/** Режим KeenDNS: cloud → «Через облако». */
function accessRu(v: any): string {
  const s = String(v ?? '').toLowerCase();
  if (!s || s === 'none') return '—';
  if (s === 'cloud') return 'Через облако';
  if (s === 'direct') return 'Напрямую';
  return String(v);
}

/** Достаёт узел service из ответа POST show rc (форма может отличаться между прошивками). */
function extractServices(v: any): Record<string, any> | null {
  const seen = new Set<any>();
  const walk = (x: any): any => {
    if (!x || typeof x !== 'object' || seen.has(x)) return null;
    seen.add(x);
    if (x.service && typeof x.service === 'object') return x.service;
    for (const k of Object.keys(x)) {
      const r = walk(x[k]);
      if (r) return r;
    }
    return null;
  };
  if (v == null) return null;
  const found = Array.isArray(v) ? v.map(walk).find(Boolean) ?? null : walk(v);
  if (found) return found;
  // fallback: единственный элемент массива без обёртки
  if (Array.isArray(v) && v.length === 1 && v[0] && typeof v[0] === 'object') return v[0];
  return typeof v === 'object' && !Array.isArray(v) ? v : null;
}

const serviceOn = (svc: Record<string, any> | null, name: string): boolean =>
  !!svc && (svc[name] === true || (svc[name] != null && typeof svc[name] === 'object'));

interface Sample {
  t: number;
  rx: number;
  tx: number;
}

export default function SystemMonitor() {
  const creds = useCreds();
  const { colors } = useSettings();

  // Медленные данные — при открытии страницы (и при возврате на вкладку).
  const staticApi = useApi('sm-static', async () => {
    const [version, media, ndns, defaults, mws, dns, services] = await Promise.all([
      settle(Api.version(creds)),
      settle(Api.media(creds)),
      settle(Api.ndns(creds)),
      settle(Api.defaults(creds)),
      settle(Api.mws(creds)),
      settle(Api.ipDns(creds)),
      settle(Api.rcServices(creds)),
    ]);
    return { version, media, ndns, defaults, mws, dns, services: extractServices(services) };
  });

  // Живые данные — каждые 2,5 секунды, пока экран открыт.
  const live = useLiveApi(
    'sm-live',
    async () => {
      const [system, ifaces, hotspot, associations, clock] = await Promise.all([
        Api.system(creds),
        settle(Api.interface(creds)),
        settle(Api.hotspot(creds)),
        settle(Api.associations(creds)),
        settle(Api.clock(creds)),
      ]);
      const list = ifaces && typeof ifaces === 'object' ? Object.values(ifaces as Record<string, any>) : [];
      const conns = list.filter((i: any) => i?.global === true || i?.defaultgw === true);
      const stats = await Promise.all(conns.map((c: any) => settle(Api.interfaceStat(creds, String(c?.id ?? '')))));
      return { system, ifaces, hotspot, associations, clock, conns, stats, t: Date.now() };
    },
    2500,
  );

  // Истории счётчиков для расчёта скоростей и окна трафика.
  const connHist = useRef<Record<string, Sample[]>>({});
  const chartHist = useRef<Record<string, { down: number; up: number }[]>>({});
  const hostHist = useRef<Record<string, Sample[]>>({});

  // --- Управление (реальные команды RCI с подтверждением) ---
  const { confirm } = useAlertDialog();
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const toggleIface = (id: string, label: string, next: boolean, warnOff?: string) => {
    confirm(
      next ? `Включить «${label}»?` : `Отключить «${label}»?`,
      next
        ? 'Интерфейс будет включён, настройки сохранятся.'
        : warnOff ?? 'Интерфейс будет выключен, настройки сохранятся.',
      async () => {
        setPending((p) => ({ ...p, [id]: true }));
        try {
          await Api.setInterfaceUp(creds, id, next);
        } catch {
          // разовый сбой покажет следующий опрос
        }
        setTimeout(() => {
          live.refetch().finally(() =>
            setPending((p) => {
              const q = { ...p };
              delete q[id];
              return q;
            }),
          );
        }, 900);
      },
      { confirmText: next ? 'Включить' : 'Отключить', destructive: !next },
    );
  };

  const toggleService = (name: string, label: string, next: boolean) => {
    confirm(
      next ? `Включить «${label}»?` : `Отключить «${label}»?`,
      next ? 'Сервис будет запущен, настройки сохранятся.' : 'Сервис будет остановлен, настройки сохранятся.',
      async () => {
        setPending((p) => ({ ...p, ['svc:' + name]: true }));
        try {
          await Api.setService(creds, name, next);
        } catch {
          // состояние перечитается ниже
        }
        setTimeout(() => {
          staticApi.refetch().finally(() =>
            setPending((p) => {
              const q = { ...p };
              delete q['svc:' + name];
              return q;
            }),
          );
        }, 900);
      },
      { confirmText: next ? 'Включить' : 'Отключить', destructive: !next },
    );
  };

  const view = useMemo(() => {
    const d = live.data as any;
    if (!d) return null;
    const now: number = d.t;

    // --- скорость и график по каждому интернет-подключению ---
    const conns = (d.conns as any[]).map((c: any, i: number) => {
      const id = String(c?.id ?? i);
      const st = d.stats[i];
      let down = 0;
      let up = 0;
      if (st && st.rxbytes != null) {
        const rx = Number(st.rxbytes);
        const tx = Number(st.txbytes);
        const h = (connHist.current[id] = connHist.current[id] ?? []);
        const prev = h[h.length - 1];
        if (prev && now > prev.t && prev.t !== now) {
          const dt = (now - prev.t) / 1000;
          if (rx >= prev.rx && tx >= prev.tx && dt < 30) {
            down = ((rx - prev.rx) * 8) / dt;
            up = ((tx - prev.tx) * 8) / dt;
            const ch = (chartHist.current[id] = chartHist.current[id] ?? []);
            ch.push({ down, up });
            if (ch.length > 45) ch.shift();
          }
        }
        if (!prev || prev.t !== now) {
          h.push({ t: now, rx, tx });
          if (h.length > 100) h.shift();
        }
      }
      return { c, st, id, down, up, chart: [...(chartHist.current[id] ?? [])] };
    });

    // --- окно трафика по клиентам (как «за 3 минуты» в вебе) ---
    const hosts = listify(d.hotspot?.host).filter((h: any) => h?.active === true);
    const clients = hosts
      .map((h: any) => {
        const mac = String(h?.mac ?? '');
        const rx = Number(h?.rxbytes);
        const tx = Number(h?.txbytes);
        let down = 0;
        let up = 0;
        let span = 0;
        if (mac && !isNaN(rx) && !isNaN(tx)) {
          const hh = (hostHist.current[mac] = hostHist.current[mac] ?? []);
          if (!hh.length || hh[hh.length - 1].t !== now) hh.push({ t: now, rx, tx });
          while (hh.length > 2 && now - hh[0].t > WINDOW_MS + 15000) hh.shift();
          const base = hh.find((s) => now - s.t <= WINDOW_MS) ?? hh[0];
          if (base && now > base.t) {
            span = (now - base.t) / 1000;
            down = Math.max(0, tx - base.tx); // tx роутера → загрузка клиента
            up = Math.max(0, rx - base.rx);
          }
        }
        return { name: String(h?.name ?? h?.hostname ?? mac), mac, down, up, span, wifi: !!(h?.ap || h?.ssid) };
      })
      .filter((c: any) => c.mac);

    clients.sort((a: any, b: any) => b.down + b.up - (a.down + a.up));
    const top = clients.slice(0, 5);
    const rest = clients.slice(5);
    const restSum = rest.reduce((a: any, c: any) => ({ down: a.down + c.down, up: a.up + c.up }), { down: 0, up: 0 });
    const totalDown = clients.reduce((a: number, c: any) => a + c.down, 0);
    const totalUp = clients.reduce((a: number, c: any) => a + c.up, 0);
    const span = clients.reduce((a: number, c: any) => Math.max(a, c.span), 0);

    return { conns, clients, top, rest, restSum, totalDown, totalUp, span };
  }, [live.data]);

  if (live.loading) return <LoadingState />;
  if (live.error) return <ErrorState message={live.error} onRetry={live.refetch} />;
  if (!live.data || !view) return <LoadingState />;

  const d = live.data as any;
  const s = (staticApi.data as any) ?? {};
  const system = d.system ?? {};

  // --- Система ---
  const cpu = Number(system.cpuload);
  const mem = parsePair(system.memory);
  const memPct = mem ? Math.round((mem.used / mem.total) * 100) : null;
  const connTotal = Number(system.conntotal);
  const connFree = Number(system.connfree);
  const clockText = (() => {
    const c = d.clock;
    if (!c) return '';
    if (typeof c === 'string') return c;
    if (typeof c === 'object') {
      // KeeneticOS 5.x: { day, month, year, hour, min, sec, ... }
      if (c.day != null && c.hour != null) {
        const p2 = (n: any) => String(n ?? 0).padStart(2, '0');
        return `${p2(c.day)}.${p2(c.month)}.${c.year} ${p2(c.hour)}:${p2(c.min)}:${p2(c.sec)}`;
      }
      const dt = [c.date, c.time].filter(Boolean).join(' ');
      if (dt) return dt;
    }
    return '';
  })();

  // --- Интерфейсы ---
  const ifaceList = d.ifaces && typeof d.ifaces === 'object' ? Object.values(d.ifaces as Record<string, any>) : [];
  const wifiMasters = ifaceList.filter((i: any) => i?.type === 'WifiMaster');
  const accessPoints = ifaceList.filter((i: any) => i?.type === 'AccessPoint');
  const ports: PortInfo[] = ifaceList
    .filter((i: any) => i?.type === 'Port')
    .map((p: any, idx: number) => ({
      key: String(p?.id ?? idx),
      label: String(p?.description ?? String(p?.['interface-name'] ?? p?.id ?? idx).split('/').pop() ?? idx),
      up: p?.link === 'up',
      speed: p?.speed != null ? Number(p.speed) : null,
      duplex: p?.duplex != null ? String(p.duplex) : null,
    }));

  // --- Клиенты ---
  const stations = listify(d.associations?.station);
  const wifiClientsOf = (masterId: string) =>
    stations.filter((st: any) => String(st?.ap ?? st?.interface ?? '').startsWith(masterId + '/')).length;
  const wifiCount = view.clients.filter((c: any) => c.wifi).length;
  const wiredCount = view.clients.length - wifiCount;

  // --- Wi-Fi-система / USB / DNS ---
  const mwsMembers = s.mws != null ? listify(s.mws?.member ?? s.mws) : null;
  const mediaRaw = s.media?.media ?? s.media;
  const mediaListAll = listify(mediaRaw);
  const hasMedia = s.media != null && mediaListAll.length > 0;
  const dnsServers = listify(s.dns?.server)
    .map((x: any) => x?.address ?? x?.proxy ?? null)
    .filter(Boolean)
    .join(', ');

  // --- KeenDNS (show ndns): имя + домен + режимы доступа ---
  const nd = s.ndns;
  const ndName = String(nd?.name ?? '');
  const ndDomain = String(nd?.domain ?? '');
  const domainName = ndName.includes('.') ? ndName : ndName && ndDomain ? `${ndName}.${ndDomain}` : ndDomain || ndName;
  const access4 = nd?.access ?? nd?.access4 ? String(nd?.access ?? nd?.access4) : null;
  const access6 = nd?.access6 ? String(nd.access6) : null;
  const inetAccess =
    access4 != null || access6 != null
      ? (access4 && access4 !== 'none') || (access6 && access6 !== 'none')
        ? 'Включено'
        : 'Выключено'
      : null;

  // --- Гарантия (show defaults + show version) ---
  const serviceTag = s.defaults?.servicetag ?? s.defaults?.['service-tag'] ?? s.defaults?.servicecode ?? null;
  const serialNum = s.defaults?.serial ?? s.defaults?.serialnumber ?? s.defaults?.['serial-number'] ?? null;

  // --- Приложения: состояния сервисов из POST show rc service ---
  const services = s.services as Record<string, any> | null;
  const webdavOn = serviceOn(services, 'webdav');
  const cifsOn = serviceOn(services, 'cifs');
  const usbDisks = mediaListAll.filter(
    (m: any) => m && (m.removable === true || m.ejectable === true || String(m?.bus ?? '').toLowerCase() === 'usb'),
  );

  const spanLabel = view.span >= 165 ? 'за 3 минуты' : view.span > 5 ? `за ${Math.round(view.span)} с` : '';

  const subHeader = (t: string, first = false) => (
    <Text style={{ fontFamily: FONT.semiBold, fontSize: 13, color: colors.text, marginTop: first ? 0 : Spacing.sm, marginBottom: 2 }}>
      {t}
    </Text>
  );

  return (
    <>
      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }}>
        <MiniStat label="ЦП" value={!isNaN(cpu) ? `${cpu}%` : '—'} progress={!isNaN(cpu) ? cpu : 0} />
        <MiniStat
          label="ОЗУ"
          value={memPct != null ? `${memPct}%` : '—'}
          progress={memPct ?? 0}
          sub={mem ? `${Math.round(mem.used / 1024)} / ${Math.round(mem.total / 1024)} МБ` : undefined}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md }}>
        <MiniStat label="Время работы" value={shortDuration(system.uptime)} />
        <MiniStat label="Клиенты в сети" value={String(view.clients.length)} />
      </View>

      {view.conns.map(({ c, st, id, down, up, chart }: any) => {
        const title = String(c?.description ?? c?.id ?? 'Подключение');
        const connected = c?.connected === 'yes' || c?.link === 'up';
        const enabled = c?.state !== 'down';
        return (
          <MonitorCard
            key={id}
            title={title}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <StatusPill on={connected} labelOff={enabled ? 'Не подключено' : 'Отключено'} />
                <Switch
                  value={enabled}
                  disabled={!!pending[id]}
                  onValueChange={(v) => toggleIface(id, title, v, 'Доступ в интернет через это подключение пропадёт.')}
                  trackColor={{ false: colors.divider, true: colors.accentDim }}
                  thumbColor={enabled ? colors.accent : colors.textMuted}
                />
              </View>
            }
          >
            {c?.type ? (
              <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textMuted, marginTop: -6, marginBottom: 8 }}>
                {String(c.type)}
                {connected && c?.uptime != null ? ` · в сети ${formatDuration(c.uptime)}` : ''}
              </Text>
            ) : null}
            <SpeedChart samples={chart} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: colors.accent }}>↓ Приём {formatBps(down)}</Text>
              <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: colors.online }}>↑ Передача {formatBps(up)}</Text>
            </View>
            <KVGrid
              items={[
                { label: 'IP-адрес', value: c?.address ? String(c.address) : null },
                { label: 'Шлюз', value: c?.gateway ? String(c.gateway) : null },
                { label: 'Маска подсети', value: c?.mask ? String(c.mask) : null },
                { label: 'MAC-адрес', value: c?.mac ? String(c.mac) : null },
                { label: 'Принято', value: st?.rxbytes != null ? formatBytes(st.rxbytes) : null },
                { label: 'Отправлено', value: st?.txbytes != null ? formatBytes(st.txbytes) : null },
                { label: 'DNS-сервер', value: dnsServers || null },
              ]}
            />
          </MonitorCard>
        );
      })}

      <MonitorCard title="Мои сети и Wi-Fi">
        <Row label="Wi-Fi клиентов" value={formatNumber(wifiCount)} />
        <Row label="Проводных клиентов" value={formatNumber(wiredCount)} last={wifiMasters.length === 0} />
        {wifiMasters.map((m: any, idx: number) => {
          const id = String(m?.id ?? '');
          const band = id.includes('WifiMaster1') ? '5 ГГц' : '2,4 ГГц';
          const upBand = m?.state === 'up';
          const ap = accessPoints.find((a: any) => String(a?.id ?? '').startsWith(id + '/') && a?.ssid);
          const n = d.associations ? wifiClientsOf(id) : null;
          const parts: string[] = [];
          if (upBand) {
            if (m?.channel != null) parts.push(`канал ${m.channel}`);
            if (n != null) parts.push(`клиентов: ${n}`);
          }
          return (
            <Row
              key={id || String(idx)}
              label={`Wi-Fi ${band}`}
              hint={ap?.ssid ? String(ap.ssid) : undefined}
              last={idx === wifiMasters.length - 1}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {upBand && parts.length ? (
                  <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: colors.text }}>{parts.join(' · ')}</Text>
                ) : null}
                <Switch
                  value={upBand}
                  disabled={!!pending[id]}
                  onValueChange={(v) =>
                    toggleIface(id, `Wi-Fi ${band}`, v, 'Если телефон подключён к этой сети, связь с роутером пропадёт до включения обратно.')
                  }
                  trackColor={{ false: colors.divider, true: colors.accentDim }}
                  thumbColor={upBand ? colors.accent : colors.textMuted}
                />
              </View>
            </Row>
          );
        })}
      </MonitorCard>

      {ports.length > 0 ? (
        <MonitorCard title="Сетевые порты">
          <PortsGrid ports={ports} />
        </MonitorCard>
      ) : null}

      {mwsMembers != null || view.clients.length > 0 ? (
        <MonitorCard title="Wi-Fi-система">
          {mwsMembers != null ? <Row label="Ретрансляторы" value={formatNumber(mwsMembers.length)} /> : null}
          <Row label="Клиенты в сети" value={formatNumber(view.clients.length)} last />
        </MonitorCard>
      ) : null}

      <MonitorCard title={`Монитор трафика${spanLabel ? ` · ${spanLabel}` : ''}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <Donut
            segments={[
              ...view.top.map((c: any, i: number) => ({ value: c.down + c.up, color: PALETTE[i % PALETTE.length] })),
              ...(view.rest.length ? [{ value: view.restSum.down + view.restSum.up, color: colors.textMuted }] : []),
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textSecondary }}>Общий трафик</Text>
            <Text style={{ fontFamily: FONT.semiBold, fontSize: 15, color: colors.text, marginTop: 2 }}>
              ↓ {formatBytes(view.totalDown)}
            </Text>
            <Text style={{ fontFamily: FONT.semiBold, fontSize: 15, color: colors.text, marginTop: 2 }}>
              ↑ {formatBytes(view.totalUp)}
            </Text>
            <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
              Активных устройств: {view.clients.length}
            </Text>
          </View>
        </View>
        <View style={{ marginTop: Spacing.xs }}>
          {view.top.map((c: any, i: number) => (
            <LegendRow
              key={c.mac}
              color={PALETTE[i % PALETTE.length]}
              name={c.name}
              down={formatBytes(c.down)}
              up={formatBytes(c.up)}
              last={i === view.top.length - 1 && !view.rest.length}
            />
          ))}
          {view.rest.length ? (
            <LegendRow
              color={colors.textMuted}
              name="Другие клиенты"
              down={formatBytes(view.restSum.down)}
              up={formatBytes(view.restSum.up)}
              last
            />
          ) : null}
          {view.clients.length === 0 ? (
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
              Нет активных устройств.
            </Text>
          ) : null}
        </View>
      </MonitorCard>

      {hasMedia ? (
        <MonitorCard title="USB-диски и принтеры">
          {mediaListAll.map((m: any, i: number) => {
            const parts = listify(m?.partition);
            const internal = m?.removable === false && String(m?.bus ?? '') === 'mtd';
            const pillLabel = internal
              ? 'Встроенное хранилище'
              : String(parts[0]?.label ?? m?.label ?? m?.product ?? m?.name ?? 'Накопитель');
            const totalRaw = Number(m?.size ?? (parts.length ? parts[0]?.total : undefined));
            const sizeText = !isNaN(totalRaw) && totalRaw > 0 ? formatBytes(totalRaw) : '—';
            return (
              <View key={String(m?.product ?? i)} style={{ marginBottom: i < mediaListAll.length - 1 ? Spacing.md : 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {/* Слот 26x24 — иконка 44px рисуется поверх и не двигает вёрстку. */}
                  <View style={{ width: 26, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                    <Image
                      source={USB_ICON}
                      style={{ position: 'absolute', width: 44, height: 44, tintColor: colors.accent }}
                      resizeMode="contain"
                    />
                  </View>
                  <View style={{ backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: '#FFFFFF' }} numberOfLines={1}>
                      {pillLabel}
                    </Text>
                  </View>
                  {parts.length > 1 ? (
                    <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.accent }}>
                      Ещё разделов: {parts.length - 1}
                    </Text>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <Text selectable style={{ fontFamily: FONT.semiBold, fontSize: 14, color: colors.text }}>
                    {sizeText}
                  </Text>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textMuted }} numberOfLines={1}>
                    {pillLabel}
                  </Text>
                </View>
              </View>
            );
          })}
        </MonitorCard>
      ) : null}

      {services != null ? (
        <MonitorCard title="Приложения">
          <View style={[styles.appRow, { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Switch
              value={webdavOn}
              disabled={!!pending['svc:webdav']}
              onValueChange={(v) => toggleService('webdav', 'Сервер WebDAV', v)}
              trackColor={{ false: colors.divider, true: colors.accentDim }}
              thumbColor={webdavOn ? colors.accent : colors.textMuted}
            />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: colors.text }}>Сервер WebDAV</Text>
              <Badge label={webdavOn ? 'Работает' : 'Отключено'} color={webdavOn ? colors.online : colors.offline} />
            </View>
            <Text style={[styles.appDesc, { color: colors.textSecondary }]}>
              Обеспечивает доступ к файлам на USB-накопителях по протоколу WebDAV
            </Text>
          </View>
          <View style={styles.appRow}>
            <Switch
              value={cifsOn}
              disabled={!!pending['svc:cifs']}
              onValueChange={(v) => toggleService('cifs', 'CIFS/SMB', v)}
              trackColor={{ false: colors.divider, true: colors.accentDim }}
              thumbColor={cifsOn ? colors.accent : colors.textMuted}
            />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: colors.text }}>CIFS/SMB</Text>
              <Badge
                label={cifsOn ? (usbDisks.length === 0 ? 'Нет диска' : 'Работает') : 'Отключено'}
                color={cifsOn ? (usbDisks.length === 0 ? colors.danger : colors.online) : colors.offline}
              />
            </View>
            <Text style={[styles.appDesc, { color: colors.textSecondary }]}>
              Доступ к USB-дискам и принтерам для устройств Windows
            </Text>
          </View>
        </MonitorCard>
      ) : null}

      <MonitorCard title="О системе">
        {subHeader('Система', true)}
        <Row label="Время работы" value={formatDuration(system.uptime)} />
        <Row label="Текущее время" value={clockText || '—'} />
        <Row
          label="Активные соединения"
          value={!isNaN(connTotal) && !isNaN(connFree) ? `${formatNumber(connTotal - connFree)} / ${formatNumber(connTotal)}` : '—'}
          last
        />

        {subHeader('Обновления системы')}
        <Row label="Версия ОС" value={String(s.version?.title ?? s.version?.release ?? '—')} />
        <Row label="Канал обновления" value={sandboxRu(s.version?.sandbox) ?? '—'} last />

        {subHeader('Доменное имя')}
        <Row label="Доменное имя" value={domainName || '—'} />
        <Row label="Режим работы (IPv4)" value={accessRu(access4)} />
        <Row label="Режим работы (IPv6)" value={accessRu(access6)} />
        <Row label="Доступ из интернета" value={inetAccess ?? '—'} last />

        {subHeader('Гарантия')}
        <Row
          label="Модель"
          value={`${String(s.version?.model ?? s.version?.description ?? '—')}${s.version?.region ? ` ${s.version.region}` : ''}`}
        />
        <Row label="Сервисный код" value={serviceTag != null ? String(serviceTag) : '—'} />
        <Row label="Серийный номер" value={serialNum != null ? String(serialNum) : '—'} last />
      </MonitorCard>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: Spacing.md }}>
        <Ionicons name="sync-outline" size={12} color={colors.textMuted} />
        <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textMuted }}>
          Данные обновляются каждые 2,5 секунды
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  appDesc: {
    flex: 1.2,
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 17,
  },
});
