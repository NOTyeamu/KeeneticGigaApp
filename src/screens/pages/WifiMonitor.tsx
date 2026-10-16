import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LoadingState, ErrorState } from '../../components/States';
import {
  MonitorCard,
  SegmentedControl,
  UtilRibbon,
  UTIL_RIBBON_STOPS,
} from '../../components/MonitorWidgets';
import { useLiveApi } from '../../hooks/useLiveApi';
import { useCreds } from '../../hooks/useCreds';
import { Api } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { useSettings } from '../../context/SettingsContext';
import { FONT, Spacing } from '../../theme/colors';

/**
 * Монитор Wi-Fi — «Текущее состояние», как в вебе:
 * переключатель диапазона, строка «Номер канала · полоса · Клиентов»,
 * лента «Загруженность канала» — РЕАЛЬНЫЕ замеры прошивки каждые ~3 с
 * (POST show interface channel-utilization chart {name, detail:0};
 * t = аптайм в секундах, v.load = процент занятости эфира), с мини-легендой
 * шкалы и метками времени.
 *
 * Для удобного касания замеры сгруппированы по SLICE_SEC секунд (среднее из
 * 4 реальных замеров на срез); группировка привязана к абсолютному времени,
 * чтобы срезы не «прыгали» при обновлении. Касание среза — интервал и процент.
 *
 * Данные: show interface (состояние диапазона) + channel-utilization chart +
 * show associations (число клиентов диапазона). Обновление каждые 2,5 с.
 */

const TICK_MS = 2500;
const SLICE_SEC = 12; // ширина среза ленты: 4 замера по ~3 с

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

export default function WifiMonitor() {
  const creds = useCreds();
  const { colors } = useSettings();
  const [band, setBand] = useState<'2g' | '5g'>('2g');
  // выделение на ленте — храним ВРЕМЯ замера, чтобы рамка ехала вместе с лентой
  const [selT, setSelT] = useState<number | null>(null);

  const masterId = band === '2g' ? 'WifiMaster0' : 'WifiMaster1';

  const live = useLiveApi(
    'wm-live-' + band,
    async () => {
      const [ifaces, associations, util] = await Promise.all([
        Api.interface(creds),
        Api.associations(creds).catch(() => null),
        Api.chanUtilChart(creds, masterId).catch(() => null),
      ]);
      return { ifaces, associations, util, t: Date.now() };
    },
    TICK_MS,
  );

  const view = useMemo(() => {
    const d = live.data as any;
    if (!d) return null;

    const list = d.ifaces && typeof d.ifaces === 'object' ? Object.values(d.ifaces as Record<string, any>) : [];
    const master: any = list.find((i: any) => String(i?.id ?? '') === masterId) ?? null;
    const up = master?.state === 'up';

    const stations = listify(d.associations?.station);
    const clients = stations.filter((st: any) => String(st?.ap ?? st?.interface ?? '').startsWith(masterId)).length;

    // --- лента загруженности канала (замеры самой прошивки, каждые ~3 с) ---
    const utilRaw = (() => {
      const first = Array.isArray(d.util) ? d.util[0] : d.util;
      return (
        first?.show?.interface?.['channel-utilization']?.chart ??
        first?.['channel-utilization']?.chart ??
        first?.chart ??
        null
      );
    })();
    const utilPoints: { t: number; load: number }[] = listify(utilRaw?.data)
      .map((p: any) => ({ t: Number(p?.t), load: Number(p?.v?.load) }))
      .filter((p) => !isNaN(p.t) && !isNaN(p.load));
    const tLast = utilPoints.length ? utilPoints[utilPoints.length - 1].t : null;

    // широкие срезы для касания: усредняем замеры по корзинам SLICE_SEC секунд,
    // привязанным к абсолютному времени (срезы стабильны между обновлениями)
    const byBucket = new Map<number, { t0: number; t1: number; sum: number; n: number }>();
    for (const p of utilPoints) {
      const b = Math.floor(p.t / SLICE_SEC);
      const cur = byBucket.get(b) ?? { t0: p.t, t1: p.t, sum: 0, n: 0 };
      cur.t0 = Math.min(cur.t0, p.t);
      cur.t1 = Math.max(cur.t1, p.t);
      cur.sum += p.load;
      cur.n += 1;
      byBucket.set(b, cur);
    }
    const slices = [...byBucket.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, s]) => ({ t0: s.t0, t1: s.t1, load: Math.round(s.sum / s.n) }));

    const channel =
      utilRaw?.ch != null && !isNaN(Number(utilRaw.ch))
        ? Number(utilRaw.ch)
        : master?.channel != null
          ? Number(master.channel)
          : null;
    const bandwidth = utilRaw?.bw ?? master?.bandwidth ?? null;

    return {
      up,
      channel,
      bandwidth,
      clients,
      slices,
      tLast,
      pollT: d.t as number,
    };
  }, [live.data, masterId]);

  if (live.loading) return <LoadingState />;
  if (live.error) return <ErrorState message={live.error} onRetry={live.refetch} />;

  const v: any = view;

  // выделенный срез: ищем по времени начала, чтобы выбор ехал вместе с лентой
  const slices: { t0: number; t1: number; load: number }[] = v?.slices ?? [];
  const selIdx = selT != null && slices.length ? slices.findIndex((s) => s.t0 === selT) : -1;
  const selSlice = selIdx >= 0 ? slices[selIdx] : null;
  const wallOf = (t: number) => (v?.pollT ?? Date.now()) - Math.max(0, (v?.tLast ?? t) - t) * 1000;
  const midSlice = slices.length > 2 ? slices[Math.floor(slices.length / 2)] : null;

  return (
    <>
      <MonitorCard title="Монитор Wi-Fi · Текущее состояние">
        <SegmentedControl
          options={[
            { key: '2g', label: '2,4 ГГц' },
            { key: '5g', label: '5 ГГц' },
          ]}
          value={band}
          onChange={(k) => {
            setBand(k as '2g' | '5g');
            setSelT(null);
          }}
        />

        {v?.up === false ? (
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: colors.textMuted, marginTop: Spacing.sm }}>
            Диапазон выключен
          </Text>
        ) : (
          <>
            <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: colors.text, marginTop: Spacing.sm }}>
              {`Номер канала: ${v?.channel ?? '—'}${
                v?.bandwidth ? `   полоса: ${v.bandwidth} МГц` : ''
              }   Клиентов: ${formatNumber(v?.clients ?? 0)}`}
            </Text>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: Spacing.md,
                marginBottom: 6,
              }}
            >
              <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: colors.textMuted }}>
                Загруженность канала, %
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {UTIL_RIBBON_STOPS.map(([val, c], i) => {
                  const first = i === 0;
                  const last = i === UTIL_RIBBON_STOPS.length - 1;
                  return (
                    <View
                      key={val}
                      style={{
                        height: 14,
                        minWidth: first || last ? 26 : 10,
                        paddingHorizontal: first || last ? 3 : 0,
                        backgroundColor: c,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderTopLeftRadius: first ? 4 : 0,
                        borderBottomLeftRadius: first ? 4 : 0,
                        borderTopRightRadius: last ? 4 : 0,
                        borderBottomRightRadius: last ? 4 : 0,
                      }}
                    >
                      {first || last ? (
                        <Text style={{ fontFamily: FONT.semiBold, fontSize: 8, color: '#FFFFFF' }}>
                          {first ? '<10' : '>70'}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>

            <UtilRibbon
              loads={slices.map((s) => s.load)}
              height={84}
              selected={selIdx >= 0 ? selIdx : null}
              onSelect={(i) => setSelT(i == null ? null : slices[i]?.t0 ?? null)}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontFamily: FONT.regular, fontSize: 9, color: colors.textMuted }}>
                {slices.length ? fmtClock(wallOf(slices[0].t0)) : ''}
              </Text>
              <Text style={{ fontFamily: FONT.regular, fontSize: 9, color: colors.textMuted }}>
                {midSlice ? fmtClock(wallOf(midSlice.t0)) : ''}
              </Text>
              <Text style={{ fontFamily: FONT.regular, fontSize: 9, color: colors.textMuted }}>
                {slices.length ? fmtClock(wallOf(slices[slices.length - 1].t1)) : ''}
              </Text>
            </View>
            {selSlice ? (
              <Text
                style={{
                  fontFamily: FONT.semiBold,
                  fontSize: 11,
                  color: colors.text,
                  textAlign: 'center',
                  marginTop: 6,
                }}
              >
                {fmtClock(wallOf(selSlice.t0))}–{fmtClock(wallOf(selSlice.t1))} · загруженность {selSlice.load}%
              </Text>
            ) : null}
          </>
        )}
      </MonitorCard>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: Spacing.md }}>
        <Ionicons name="sync-outline" size={12} color={colors.textMuted} />
        <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textMuted }}>Обновление каждые 2,5 с</Text>
      </View>
    </>
  );
}
