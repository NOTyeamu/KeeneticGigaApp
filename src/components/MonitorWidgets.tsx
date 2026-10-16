import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Canvas, LinearGradient, Path, Rect, Skia, vec } from '@shopify/react-native-skia';
import * as Clipboard from 'expo-clipboard';
import { useSettings } from '../context/SettingsContext';
import { Card } from './Card';
import { FONT, Radius, Spacing } from '../theme/colors';

const PORT_ICON = require('../../assets/port_icon.png');

/**
 * Виджеты «Системного монитора» в стиле веб-дашборда KeeneticOS:
 * карточки с иконками, статус-плашки, живой график скорости, кольцевая
 * диаграмма трафика, плитки портов, прогресс-бары и копирование значений.
 */

// ---------------------------------------------------------------- MonitorCard

export function MonitorCard({
  title,
  right,
  children,
  style,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useSettings();
  return (
    <Card style={[{ marginBottom: Spacing.md }, style]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
      {children}
    </Card>
  );
}

// ------------------------------------------------------------------ MiniStat

export function MiniStat({
  label,
  value,
  progress,
  sub,
}: {
  label: string;
  value: string;
  progress?: number | null;
  sub?: string;
}) {
  const { colors } = useSettings();
  return (
    <Card style={{ flex: 1 }} padded={false}>
      <View style={{ padding: Spacing.sm, gap: 6 }}>
        <Text style={{ fontFamily: FONT.medium, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted }} numberOfLines={1}>
          {label}
        </Text>
        <Text selectable style={{ fontFamily: FONT.semiBold, fontSize: 16, color: colors.text }} numberOfLines={1}>
          {value}
        </Text>
        {progress != null ? <ProgressBar value={progress} /> : null}
        {sub ? (
          <Text style={{ fontFamily: FONT.regular, fontSize: 10, color: colors.textMuted }} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

// ----------------------------------------------------------------- StatusPill

export function StatusPill({ on, labelOn = 'Подключено', labelOff = 'Отключено' }: { on: boolean; labelOn?: string; labelOff?: string }) {
  const { colors } = useSettings();
  const c = on ? colors.online : colors.offline;
  return (
    <View style={[styles.pill, { backgroundColor: c + '22' }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
      <Text style={[styles.pillText, { color: c }]}>{on ? labelOn : labelOff}</Text>
    </View>
  );
}

// -------------------------------------------------------------------- Badge

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: color + '22', alignSelf: 'flex-start' }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- ProgressBar

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const { colors } = useSettings();
  const v = Math.max(0, Math.min(100, value));
  const fill = color ?? (v >= 85 ? colors.danger : v >= 65 ? colors.warn : colors.accent);
  return (
    <View style={{ height: 6, borderRadius: Radius.pill, backgroundColor: colors.divider, overflow: 'hidden' }}>
      <View style={{ width: `${v}%`, height: '100%', borderRadius: Radius.pill, backgroundColor: fill }} />
    </View>
  );
}

// ------------------------------------------------------------------ StatTile

export function StatTile({ label, value }: { label: string; value: string }) {
  const { colors } = useSettings();
  return (
    <View style={[styles.tile, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
      <Text selectable style={{ fontFamily: FONT.bold, fontSize: 20, color: colors.text }}>
        {value}
      </Text>
      <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textSecondary, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

// ------------------------------------------------------------------- KVGrid

export function KVGrid({ items }: { items: { label: string; value?: string | null }[] }) {
  const { colors, haptic } = useSettings();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const shown = items.filter((i) => i.value != null && i.value !== '');
  const copy = async (k: string, v: string) => {
    try {
      await Clipboard.setStringAsync(v);
    } catch {
      return;
    }
    haptic();
    setCopiedKey(k);
    setTimeout(() => setCopiedKey((cur) => (cur === k ? null : cur)), 1100);
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: Spacing.xs }}>
      {shown.map((i) => (
        <Pressable
          key={i.label}
          onLongPress={() => copy(i.label, String(i.value))}
          delayLongPress={350}
          style={{ width: '50%', paddingVertical: 6, paddingRight: 8 }}
        >
          <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textMuted }}>{i.label}</Text>
          <Text
            selectable
            style={{ fontFamily: FONT.medium, fontSize: 13, color: copiedKey === i.label ? colors.online : colors.text, marginTop: 1 }}
            numberOfLines={2}
          >
            {copiedKey === i.label ? 'Скопировано ✓' : i.value}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- SpeedChart

export function formatBps(bps: number): string {
  if (!isFinite(bps) || bps < 0) bps = 0;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1).replace('.', ',')} Мбит/с`;
  if (bps >= 1e3) return `${Math.round(bps / 1e3)} кбит/с`;
  return `${Math.round(bps)} бит/с`;
}

export function SpeedChart({ samples, height = 108 }: { samples: { down: number; up: number }[]; height?: number }) {
  const { colors } = useSettings();
  const [w, setW] = useState(0);
  const n = samples.length;
  let content: React.ReactNode = null;
  if (w > 0 && n >= 2) {
    const max = Math.max(100000, ...samples.map((s) => Math.max(s.down, s.up))) * 1.15;
    const step = w / (n - 1);
    const yFor = (v: number) => height - 4 - (Math.max(0, v) / max) * (height - 16);
    const area = Skia.Path.Make();
    const line = Skia.Path.Make();
    const upLine = Skia.Path.Make();
    area.moveTo(0, height);
    samples.forEach((s, i) => {
      const x = i * step;
      const y = yFor(s.down);
      area.lineTo(x, y);
      if (i === 0) line.moveTo(x, y);
      else line.lineTo(x, y);
      const yu = yFor(s.up);
      if (i === 0) upLine.moveTo(x, yu);
      else upLine.lineTo(x, yu);
    });
    area.lineTo((n - 1) * step, height);
    area.close();
    content = (
      <Canvas style={{ width: w, height }}>
        <Path path={area} style="fill">
          <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={[colors.accent + '59', colors.accent + '00']} />
        </Path>
        <Path path={line} style="stroke" strokeWidth={2} color={colors.accent} strokeJoin="round" strokeCap="round" />
        <Path path={upLine} style="stroke" strokeWidth={1.5} color={colors.online} strokeJoin="round" strokeCap="round" />
      </Canvas>
    );
  }
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{
        height,
        borderRadius: Radius.xs,
        overflow: 'hidden',
        backgroundColor: colors.cardAlt,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        justifyContent: 'center',
      }}
    >
      {content ?? (
        <Text style={{ textAlign: 'center', fontFamily: FONT.regular, fontSize: 12, color: colors.textMuted }}>Сбор данных…</Text>
      )}
    </View>
  );
}

// -------------------------------------------------------------------- Donut

export function Donut({ segments, size = 128, thickness = 22 }: { segments: { value: number; color: string }[]; size?: number; thickness?: number }) {
  const { colors } = useSettings();
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  const rect = { x: thickness / 2, y: thickness / 2, width: size - thickness, height: size - thickness };
  const arcs: { p: ReturnType<typeof Skia.Path.Make>; color: string }[] = [];
  if (total > 0) {
    let angle = -90;
    for (const s of segments) {
      const sweep = (Math.max(0, s.value) / total) * 360;
      if (sweep > 1) {
        const p = Skia.Path.Make();
        p.addArc(rect, angle + 1, Math.max(0.5, sweep - 2));
        arcs.push({ p, color: s.color });
      }
      angle += sweep;
    }
  }
  if (arcs.length === 0) {
    const p = Skia.Path.Make();
    p.addArc(rect, 0, 360);
    arcs.push({ p, color: colors.divider });
  }
  return (
    <Canvas style={{ width: size, height: size }}>
      {arcs.map((s, i) => (
        <Path key={i} path={s.p} style="stroke" strokeWidth={thickness} color={s.color} strokeCap="butt" />
      ))}
    </Canvas>
  );
}

// ---------------------------------------------------------------- LegendRow

export function LegendRow({
  color,
  name,
  down,
  up,
  last,
}: {
  color: string;
  name: string;
  down: string;
  up: string;
  last?: boolean;
}) {
  const { colors } = useSettings();
  return (
    <View
      style={[
        styles.legendRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
      ]}
    >
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Text selectable style={{ flex: 1, fontFamily: FONT.medium, fontSize: 13, color: colors.text }} numberOfLines={1}>
        {name}
      </Text>
      <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: colors.textSecondary }}>
        ↓ {down}  ↑ {up}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- PortsGrid

export interface PortInfo {
  key: string;
  label: string;
  up: boolean;
  speed?: number | null;
  duplex?: string | null;
}

export function PortsGrid({ ports }: { ports: PortInfo[] }) {
  const { colors } = useSettings();
  const [wrapW, setWrapW] = useState(0);
  const [showArrow, setShowArrow] = useState(false);
  const contentW = useRef(0);

  const recalc = (offsetX = 0) => {
    setShowArrow(contentW.current > wrapW + 6 && offsetX + wrapW < contentW.current - 10);
  };

  return (
    <View onLayout={(e) => setWrapW(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={(cw) => {
          contentW.current = cw;
          recalc(0);
        }}
        onScroll={(e) => recalc(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={32}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-evenly' }}
      >
        {ports.map((p) => {
          const speedLabel =
            p.speed != null ? (p.speed >= 1000 ? `${(p.speed / 1000).toFixed(1).replace('.', ',')} G` : `${p.speed} M`) : '';
          const duplexLabel = p.duplex ? (p.duplex === 'full' ? 'FDX' : 'HDX') : '';
          return (
            <View key={p.key} style={{ alignItems: 'center', width: 56 }}>
              <View
                style={{ width: 8, height: 8, borderRadius: 4, marginBottom: 14, backgroundColor: p.up ? colors.online : colors.divider }}
              />
              {/* Слот фиксированный — большая иконка рисуется поверх и не влияет на вёрстку. */}
              <View style={{ width: 44, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Image
                  source={PORT_ICON}
                  style={{
                    position: 'absolute',
                    width: 78,
                    height: 72,
                    top: -16,
                    left: -17,
                    tintColor: p.up ? colors.accent : colors.textMuted,
                    opacity: p.up ? 1 : 0.55,
                  }}
                  resizeMode="contain"
                />
                <Text style={{ fontFamily: FONT.bold, fontSize: 18, color: colors.text }}>{p.label}</Text>
              </View>
              <Text
                style={{
                  fontFamily: FONT.medium,
                  fontSize: 10,
                  lineHeight: 13,
                  marginTop: 16,
                  textAlign: 'center',
                  color: p.up ? colors.textSecondary : colors.textMuted,
                }}
                numberOfLines={2}
              >
                {p.up ? [duplexLabel, speedLabel].filter(Boolean).join('\n') : '—'}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      {showArrow ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: -6, top: 0, bottom: 0, justifyContent: 'center' }}
        >
          <View
            style={{
              backgroundColor: colors.card + 'F0',
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: Radius.pill,
              padding: 3,
            }}
          >
            <Ionicons name="chevron-forward" size={16} color={colors.accent} />
          </View>
        </View>
      ) : null}
    </View>
  );
}


// ------------------------------------------------------------ SegmentedControl

export function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  const { colors, haptic } = useSettings();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.cardAlt,
        borderRadius: Radius.pill,
        padding: 2,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (!active) {
                haptic();
                onChange(o.key);
              }
            }}
            style={{
              flex: 1,
              paddingVertical: 5,
              paddingHorizontal: 2,
              borderRadius: Radius.pill,
              backgroundColor: active ? colors.accent : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text numberOfLines={1} style={{ fontFamily: FONT.semiBold, fontSize: 11, color: active ? '#FFFFFF' : colors.textSecondary }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- StackedBars

export function StackedBars({
  data,
  colors: seriesColors,
  height = 170,
  selected,
  onSelect,
}: {
  data: number[][];
  colors: string[];
  height?: number;
  selected?: number | null;
  onSelect?: (i: number | null) => void;
}) {
  const { colors } = useSettings();
  const [w, setW] = useState(0);
  const n = data.length;
  let content: React.ReactNode = null;
  if (w > 8 && n > 0 && seriesColors.length > 0) {
    const maxSum = Math.max(1, ...data.map((b) => b.reduce((a, v) => a + Math.max(0, v), 0))) * 1.12;
    const pitch = w / n;                      // шаг слота
    const bw = Math.max(2, pitch * 0.72);     // крупный столбец по центру слота
    const paths = seriesColors.map(() => Skia.Path.Make());
    data.forEach((bucket, i) => {
      let y = height - 2;
      const x = i * pitch + (pitch - bw) / 2;
      bucket.forEach((v, sIdx) => {
        const vv = Math.max(0, v);
        if (vv <= 0 || sIdx >= paths.length) return;
        const h = (vv / maxSum) * (height - 10);
        y -= h;
        paths[sIdx].addRect({ x, y, width: bw, height: h });
      });
    });
    let selPath: ReturnType<typeof Skia.Path.Make> | null = null;
    if (selected != null && selected >= 0 && selected < n) {
      selPath = Skia.Path.Make();
      selPath.addRect({ x: selected * pitch + 0.5, y: 1, width: Math.max(1.5, pitch - 1), height: height - 2 });
    }
    content = (
      <Canvas style={{ width: w, height }}>
        {paths.map((p, i) => (
          <Path key={i} path={p} color={seriesColors[i]} style="fill" />
        ))}
        {selPath ? <Path path={selPath} color={colors.text + '66'} style="stroke" strokeWidth={1.5} /> : null}
      </Canvas>
    );
  }
  return (
    <Pressable
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onPress={(e) => {
        if (!onSelect || w <= 0 || n === 0) return;
        const idx = Math.min(n - 1, Math.max(0, Math.floor((e.nativeEvent.locationX / w) * n)));
        onSelect(idx === selected ? null : idx);
      }}
      style={{
        height,
        borderRadius: Radius.xs,
        overflow: 'hidden',
        backgroundColor: colors.cardAlt,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        justifyContent: 'center',
      }}
    >
      {content ?? (
        <Text style={{ textAlign: 'center', fontFamily: FONT.regular, fontSize: 12, color: colors.textMuted }}>
          Сбор данных…
        </Text>
      )}
    </Pressable>
  );
}


// ------------------------------------------------------------------ UtilBars

/** Цвет загруженности канала, как шкала в вебе: <10 синий ... >70 красный. */
export function utilColor(v: number): string {
  if (v <= 10) return '#4FC3F7';
  if (v <= 30) return '#06D6A0';
  if (v <= 50) return '#FFD166';
  if (v <= 70) return '#FF9F0A';
  return '#FF5C5C';
}

export function UtilBars({
  values,
  height = 150,
  selected,
  onSelect,
}: {
  values: (number | null)[]; // проценты по слотам; null = пустой слот
  height?: number;
  selected?: number | null;
  onSelect?: (i: number | null) => void;
}) {
  const { colors } = useSettings();
  const [w, setW] = useState(0);
  const n = values.length;
  const real = values.filter((v): v is number => v != null);
  let content: React.ReactNode = null;
  if (w > 8 && n > 0 && real.length > 0) {
    const maxV = Math.max(5, ...real) * 1.15; // автомасштаб, минимум 5%
    const pitch = w / n;
    const bw = Math.max(2, pitch * 0.72);
    const groups: Record<string, ReturnType<typeof Skia.Path.Make>> = {};
    values.forEach((v, i) => {
      if (v == null) return;
      const c = utilColor(v);
      const p = (groups[c] = groups[c] ?? Skia.Path.Make());
      const h = Math.max(2, (Math.max(0, v) / maxV) * (height - 10));
      p.addRect({ x: i * pitch + (pitch - bw) / 2, y: height - 2 - h, width: bw, height: h });
    });
    let selPath: ReturnType<typeof Skia.Path.Make> | null = null;
    if (selected != null && selected >= 0 && selected < n) {
      selPath = Skia.Path.Make();
      selPath.addRect({ x: selected * pitch + 0.5, y: 1, width: Math.max(1.5, pitch - 1), height: height - 2 });
    }
    content = (
      <Canvas style={{ width: w, height }}>
        {Object.entries(groups).map(([c, p]) => (
          <Path key={c} path={p} color={c} style="fill" />
        ))}
        {selPath ? <Path path={selPath} color={colors.text + '66'} style="stroke" strokeWidth={1.5} /> : null}
      </Canvas>
    );
  }
  return (
    <Pressable
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onPress={(e) => {
        if (!onSelect || w <= 0 || n === 0) return;
        const idx = Math.min(n - 1, Math.max(0, Math.floor((e.nativeEvent.locationX / w) * n)));
        onSelect(idx === selected ? null : idx);
      }}
      style={{
        height,
        borderRadius: Radius.xs,
        overflow: 'hidden',
        backgroundColor: colors.cardAlt,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        justifyContent: 'center',
      }}
    >
      {content ?? (
        <Text style={{ textAlign: 'center', fontFamily: FONT.regular, fontSize: 12, color: colors.textMuted }}>
          Сбор данных…
        </Text>
      )}
    </Pressable>
  );
}


// ---------------------------------------------------------------- UtilRibbon

/**
 * Опорные цвета шкалы загруженности канала — мягкая палитра веб-интерфейса:
 * голубой (<10) → синий → зелёный → жёлто-зелёный → жёлтый → оранжевый → красный (>70).
 */
export const UTIL_RIBBON_STOPS: [number, string][] = [
  [0, '#7FB2E5'],
  [8, '#4C8FD8'],
  [14, '#79BD62'],
  [30, '#A4CE4E'],
  [45, '#E4D34B'],
  [60, '#EFA23F'],
  [75, '#E85348'],
];

function hexToRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** Цвет для значения загруженности 0–100 % — плавная интерполяция как в вебе. */
export function utilRibbonColor(v: number): string {
  const x = Math.max(0, Math.min(100, v));
  const S = UTIL_RIBBON_STOPS;
  if (x >= S[S.length - 1][0]) return S[S.length - 1][1];
  let a = S[0];
  let b = S[S.length - 1];
  for (let i = 0; i < S.length - 1; i++) {
    if (x >= S[i][0] && x <= S[i + 1][0]) {
      a = S[i];
      b = S[i + 1];
      break;
    }
  }
  const t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
  const ca = hexToRgb(a[1]);
  const cb = hexToRgb(b[1]);
  const c = ca.map((av, i) => Math.round(av + (cb[i] - av) * t));
  return '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('');
}

/**
 * Лента загруженности канала, как в вебе: сплошная полоса во всю ширину,
 * каждый замер — вертикальный срез на всю высоту, цвет = процент занятости.
 * Касание — выбор среза (рамка), выбор сбрасывается повторным касанием.
 */
export function UtilRibbon({
  loads,
  height = 84,
  selected,
  onSelect,
}: {
  loads: number[];
  height?: number;
  selected?: number | null;
  onSelect?: (i: number | null) => void;
}) {
  const { colors } = useSettings();
  const [w, setW] = useState(0);
  const n = loads.length;
  let content: React.ReactNode = null;
  if (w > 8 && n > 0) {
    const pitch = w / n;
    const rects = loads.map((v, i) => (
      <Rect key={i} x={i * pitch - 0.3} y={0} width={pitch + 0.6} height={height} color={utilRibbonColor(v)} />
    ));
    let sel: React.ReactNode = null;
    if (selected != null && selected >= 0 && selected < n) {
      const p = Skia.Path.Make();
      p.addRect({ x: selected * pitch + 0.75, y: 0.75, width: Math.max(1.5, pitch - 1.5), height: height - 1.5 });
      sel = <Path path={p} color="#FFFFFFDD" style="stroke" strokeWidth={1.5} />;
    }
    content = (
      <Canvas style={{ width: w, height }}>
        {rects}
        {sel}
      </Canvas>
    );
  }
  return (
    <Pressable
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onPress={(e) => {
        if (!onSelect || w <= 0 || n === 0) return;
        const idx = Math.min(n - 1, Math.max(0, Math.floor((e.nativeEvent.locationX / w) * n)));
        onSelect(idx === selected ? null : idx);
      }}
      style={{
        height,
        borderRadius: Radius.xs,
        overflow: 'hidden',
        backgroundColor: colors.cardAlt,
        justifyContent: 'center',
      }}
    >
      {content ?? (
        <Text style={{ textAlign: 'center', fontFamily: FONT.regular, fontSize: 12, color: colors.textMuted }}>
          Сбор данных…
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: Radius.sm,
    paddingVertical: 11,
    marginTop: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontFamily: FONT.semiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  pillText: {
    fontFamily: FONT.semiBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tile: {
    flex: 1,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    gap: 2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
});
