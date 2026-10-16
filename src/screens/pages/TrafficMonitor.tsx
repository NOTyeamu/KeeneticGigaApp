import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LoadingState, ErrorState } from '../../components/States';
import {
  Badge,
  Donut,
  formatBps,
  MonitorCard,
  SegmentedControl,
  StackedBars,
} from '../../components/MonitorWidgets';
import { useLiveApi } from '../../hooks/useLiveApi';
import { useCreds } from '../../hooks/useCreds';
import { Api } from '../../lib/api';
import { formatBytes, formatNumber } from '../../lib/format';
import { useSettings } from '../../context/SettingsContext';
import { FONT, Spacing } from '../../theme/colors';

/**
 * Монитор трафика — телефонная версия веб-страницы:
 * стековая гистограмма потребления по клиентам (Топ-5 + «Другие»),
 * режимы «Скорость / Трафик», интервалы «3 мин / 15 мин»,
 * касание столбца — детализация периода, ниже — средняя скорость,
 * кольцевая диаграмма и список клиентов.
 *
 * Данные: show ip hotspot (счётчики rx/tx по каждому клиенту), опрос каждые
 * 2,5 с; история копится, пока страница открыта. Более длинные интервалы
 * (1 час/1 день) веб берёт из внутреннего хранилища роутера, недоступного
 * через RCI, поэтому здесь их честно нет.
 */

const PALETTE = ['#8E97FD', '#4FC3F7', '#FF6B81', '#FFD166', '#06D6A0'];
const OTHER_COLOR = '#6B7A85';
const TICK_MS = 2500;
const MAX_SAMPLES = 380; // ~15,8 минуты истории

function listify(v: any): any[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return Object.values(v);
  return [];
}

function fmtClock(ms: number): string {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

interface Snap {
  t: number;
  hosts: Record<string, { rx: number; tx: number; name: string; prio: number | null }>;
}

interface BucketRow {
  key: string;
  down: number;
  up: number;
}

export default function TrafficMonitor() {
  const creds = useCreds();
  const { colors } = useSettings();
  const [mode, setMode] = useState<'speed' | 'traffic'>('speed');
  const [win, setWin] = useState<'3m' | '15m'>('3m');
  // выделение хранится как ВРЕМЯ начала столбца — едет вместе с лентой
  const [selT0, setSelT0] = useState<number | null>(null);

  const samplesRef = useRef<Snap[]>([]);

  const live = useLiveApi(
    'tm-live',
    async () => {
      const hotspot = await Api.hotspot(creds);
      return { hotspot, t: Date.now() };
    },
    TICK_MS,
  );

  const view = useMemo(() => {
    const d = live.data as any;
    if (!d) return null;

    // --- снимок счётчиков ---
    const hostsArr = listify(d.hotspot?.host).filter((h: any) => h?.active === true);
    const map: Snap['hosts'] = {};
    for (const h of hostsArr) {
      const mac = String(h?.mac ?? '');
      const rx = Number(h?.rxbytes);
      const tx = Number(h?.txbytes);
      if (!mac || isNaN(rx) || isNaN(tx)) continue;
      map[mac] = {
        rx,
        tx,
        name: String(h?.name ?? h?.hostname ?? mac),
        prio: h?.priority != null && !isNaN(Number(h.priority)) ? Number(h.priority) : null,
      };
    }
    const S = samplesRef.current;
    if (!S.length || S[S.length - 1].t !== d.t) {
      S.push({ t: d.t, hosts: map });
      while (S.length > MAX_SAMPLES) S.shift();
    }

    const windowMs = win === '3m' ? 180000 : 900000;
    // крупные столбцы, удобные для нажатия: 3 мин = 18 x 10 с, 15 мин = 15 x 60 с
    const group = win === '3m' ? 4 : 24;
    const SLOTS = win === '3m' ? 18 : 15;
    const now = d.t;
    const inWin = S.filter((s) => now - s.t <= windowMs + TICK_MS);
    if (inWin.length < 2) return { ready: false as const, clientCount: hostsArr.length };

    // --- дельты между соседними опросами ---
    type Delta = { t0: number; t1: number; per: Record<string, { down: number; up: number }> };
    const deltas: Delta[] = [];
    for (let i = 1; i < inWin.length; i++) {
      const a = inWin[i - 1];
      const b = inWin[i];
      const dt = b.t - a.t;
      if (dt <= 0 || dt > 30000) continue;
      const per: Delta['per'] = {};
      for (const mac of Object.keys(b.hosts)) {
        const pa = a.hosts[mac];
        const pb = b.hosts[mac];
        if (!pa) continue;
        const down = pb.tx - pa.tx; // tx роутера -> загрузка клиента
        const up = pb.rx - pa.rx;
        if (down < 0 || up < 0) continue; // сброс счётчика
        if (down > 0 || up > 0) per[mac] = { down, up };
      }
      deltas.push({ t0: a.t, t1: b.t, per });
    }
    if (!deltas.length) return { ready: false as const, clientCount: hostsArr.length };

    // --- группировка в бакеты (15 мин -> по 15 с) ---
    const rawBuckets: Delta[] = [];
    for (let i = 0; i < deltas.length; i += group) {
      const chunk = deltas.slice(i, i + group);
      const per: Delta['per'] = {};
      for (const c of chunk) {
        for (const mac of Object.keys(c.per)) {
          const p = (per[mac] = per[mac] ?? { down: 0, up: 0 });
          p.down += c.per[mac].down;
          p.up += c.per[mac].up;
        }
      }
      rawBuckets.push({ t0: chunk[0].t0, t1: chunk[chunk.length - 1].t1, per });
    }
    // видимое окно — последние SLOTS бакетов (лента)
    const visible = rawBuckets.slice(-SLOTS);

    // --- топ-5 клиентов за видимое окно ---
    const totals: Record<string, { down: number; up: number }> = {};
    for (const b of visible) {
      for (const mac of Object.keys(b.per)) {
        const t = (totals[mac] = totals[mac] ?? { down: 0, up: 0 });
        t.down += b.per[mac].down;
        t.up += b.per[mac].up;
      }
    }
    const ranked = Object.keys(totals).sort(
      (x, y) => totals[y].down + totals[y].up - (totals[x].down + totals[x].up),
    );
    const top = ranked.slice(0, 5);
    const others = ranked.slice(5);

    const latest = S[S.length - 1].hosts;
    const nameOf = (mac: string) => latest[mac]?.name ?? mac;
    const prioOf = (mac: string) => latest[mac]?.prio ?? null;

    const seriesKeys = [...top, ...(others.length ? ['__other'] : [])];
    const seriesColors = [
      ...top.map((_, i) => PALETTE[i % PALETTE.length]),
      ...(others.length ? [OTHER_COLOR] : []),
    ];

    // --- бакеты по сериям ---
    const buckets = visible.map((b) => {
      const rows: BucketRow[] = seriesKeys.map((k) => {
        if (k === '__other') {
          let down = 0;
          let up = 0;
          for (const m of others) {
            down += b.per[m]?.down ?? 0;
            up += b.per[m]?.up ?? 0;
          }
          return { key: k, down, up };
        }
        return { key: k, down: b.per[k]?.down ?? 0, up: b.per[k]?.up ?? 0 };
      });
      return { t0: b.t0, t1: b.t1, secs: Math.max(0.5, (b.t1 - b.t0) / 1000), rows };
    });

    const realData = buckets.map((b) =>
      b.rows.map((r) => (mode === 'speed' ? ((r.down + r.up) * 8) / b.secs : r.down + r.up)),
    );
    const padCount = Math.max(0, SLOTS - realData.length);
    const emptyRow = seriesKeys.map(() => 0);
    // столбцы идут слева направо; пустые слоты — СПРАВА (лента заполняется вперёд)
    const data = [...realData, ...Array(padCount).fill(emptyRow)];
    const maxSum = Math.max(1, ...realData.map((row) => row.reduce((a, v) => a + v, 0)));
    const bucketMs = TICK_MS * group;

    const spanSec = Math.max(1, (buckets[buckets.length - 1].t1 - buckets[0].t0) / 1000);
    const winDown = Object.values(totals).reduce((a, t) => a + t.down, 0);
    const winUp = Object.values(totals).reduce((a, t) => a + t.up, 0);

    const legend = seriesKeys.map((k, i) => {
      const t =
        k === '__other'
          ? others.reduce(
              (a, m) => ({ down: a.down + totals[m].down, up: a.up + totals[m].up }),
              { down: 0, up: 0 },
            )
          : totals[k];
      return {
        key: k,
        color: seriesColors[i],
        name: k === '__other' ? `Другие клиенты (${others.length})` : nameOf(k),
        down: t.down,
        up: t.up,
        prio: k === '__other' ? null : prioOf(k),
      };
    });

    return {
      ready: true as const,
      buckets,
      data,
      seriesColors,
      legend,
      spanSec,
      maxSum,
      winDown,
      winUp,
      padCount,
      tStart: fmtClock(buckets[0].t0),
      tEnd: fmtClock(buckets[0].t0 + SLOTS * bucketMs),
      clientCount: hostsArr.length,
    };
  }, [live.data, win, mode]);

  if (live.loading) return <LoadingState />;
  if (live.error) return <ErrorState message={live.error} onRetry={live.refetch} />;

  const v: any = view;
  const ready = !!v?.ready;
  const fmtVal = (x: number, secs?: number) =>
    mode === 'speed' ? formatBps(secs != null ? (x * 8) / secs : x) : formatBytes(x);
  // индекс выбранного бакета по сохранённому времени (следует за лентой)
  const sel = ready && selT0 != null ? v.buckets.findIndex((b: any) => b.t0 === selT0) : -1;
  const selIdx = sel >= 0 ? sel : null;

  return (
    <>
      <MonitorCard title="Монитор трафика · Топ-5">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1.15 }}>
            <SegmentedControl
              options={[
                { key: 'speed', label: 'Скорость' },
                { key: 'traffic', label: 'Трафик' },
              ]}
              value={mode}
              onChange={(k) => {
                setMode(k as 'speed' | 'traffic');
                setSelT0(null);
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <SegmentedControl
              options={[
                { key: '3m', label: '3 мин' },
                { key: '15m', label: '15 мин' },
              ]}
              value={win}
              onChange={(k) => {
                setWin(k as '3m' | '15m');
                setSelT0(null);
              }}
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm, marginBottom: 4 }}>
          <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: colors.textMuted }}>
            {ready ? (mode === 'speed' ? formatBps(v.maxSum) : formatBytes(v.maxSum)) : ''}
          </Text>
          <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: colors.textMuted }}>
            {ready ? 'касание столбца — детали' : ''}
          </Text>
        </View>
        <StackedBars
          data={ready ? v.data : []}
          colors={ready ? v.seriesColors : []}
          selected={selIdx}
          onSelect={(slot) => {
            if (!ready || slot == null || slot >= v.buckets.length) {
              setSelT0(null);
              return;
            }
            const t0 = v.buckets[slot].t0;
            setSelT0(t0 === selT0 ? null : t0);
          }}
        />
        {ready ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: colors.textMuted }}>{v.tStart}</Text>
            <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: colors.textMuted }}>{v.tEnd}</Text>
          </View>
        ) : null}

        {selIdx != null ? (
          <View
            style={{
              marginTop: Spacing.sm,
              backgroundColor: colors.cardAlt,
              borderRadius: 12,
              padding: Spacing.sm,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontFamily: FONT.semiBold, fontSize: 12, color: colors.text, marginBottom: 6 }}>
              {fmtClock(v.buckets[selIdx].t0)} – {fmtClock(v.buckets[selIdx].t1)}
            </Text>
            {[...v.buckets[selIdx].rows]
              .map((r: BucketRow, i: number) => ({ r, L: v.legend[i] }))
              .filter(({ r }: any) => r.down > 0 || r.up > 0)
              .sort((a: any, b: any) => b.r.down + b.r.up - (a.r.down + a.r.up))
              .map(({ r, L }: any) => {
              return (
                <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: L.color }} />
                  <Text style={{ flex: 1, fontFamily: FONT.medium, fontSize: 12, color: colors.text }} numberOfLines={1}>
                    {L.name}
                  </Text>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textSecondary }}>
                    ↓ {fmtVal(r.down, v.buckets[selIdx].secs)}  ↑ {fmtVal(r.up, v.buckets[selIdx].secs)}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </MonitorCard>

      <MonitorCard title={mode === 'speed' ? 'Средняя скорость' : `Трафик за ${win === '3m' ? '3 минуты' : '15 минут'}`}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
          <Text style={{ fontFamily: FONT.semiBold, fontSize: 16, color: colors.accent }}>
            ↓ {ready ? fmtVal(v.winDown, mode === 'speed' ? v.spanSec : undefined) : '—'}
          </Text>
          <Text style={{ fontFamily: FONT.semiBold, fontSize: 16, color: colors.online }}>
            ↑ {ready ? fmtVal(v.winUp, mode === 'speed' ? v.spanSec : undefined) : '—'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <Donut
            segments={ready ? v.legend.map((L: any) => ({ value: L.down + L.up, color: L.color })) : []}
            size={116}
            thickness={20}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textSecondary }}>
              Активных клиентов
            </Text>
            <Text style={{ fontFamily: FONT.bold, fontSize: 22, color: colors.text }}>
              {formatNumber(v?.clientCount ?? 0)}
            </Text>
            <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
              Доля на диаграмме — суммарный объём за выбранный интервал
            </Text>
          </View>
        </View>
        <View style={{ marginTop: Spacing.xs }}>
          {ready
            ? v.legend.map((L: any, i: number) => (
                <View
                  key={L.key}
                  style={[
                    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
                    i < v.legend.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.divider,
                    },
                  ]}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: L.color }} />
                  <View style={{ flex: 1 }}>
                    <Text selectable style={{ fontFamily: FONT.medium, fontSize: 13, color: colors.text }} numberOfLines={1}>
                      {L.name}
                    </Text>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                      ↓ {fmtVal(L.down, mode === 'speed' ? v.spanSec : undefined)}   ↑{' '}
                      {fmtVal(L.up, mode === 'speed' ? v.spanSec : undefined)}
                    </Text>
                  </View>
                  {L.prio != null ? <Badge label={String(L.prio)} color={colors.accent} /> : null}
                </View>
              ))
            : (
              <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textMuted }}>
                Идёт сбор данных — подождите несколько секунд…
              </Text>
            )}
        </View>
      </MonitorCard>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: Spacing.md }}>
        <Ionicons name="sync-outline" size={12} color={colors.textMuted} />
        <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textMuted }}>
          Обновление каждые 2,5 с · история копится, пока страница открыта
        </Text>
      </View>
    </>
  );
}
