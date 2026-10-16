import { StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius, Spacing } from '../theme/colors';
import { Row } from './Row';
import { boolText, formatBytes, formatDuration, formatNumber, humanizeKey } from '../lib/format';

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function scalarString(value: unknown, key: string): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return boolText(value);
  if (typeof value === 'number') {
    if ((/bytes?|capacity|size|memory/i.test(key) || key === 'used' || key === 'free') && value > 1024) {
      return formatBytes(value);
    }
    if ((/uptime|expires|duration/i.test(key)) && value > 60) {
      return formatDuration(value);
    }
    if (/load|percent|pct/i.test(key)) {
      return `${formatNumber(value)}%`;
    }
    return formatNumber(value);
  }
  if (typeof value === 'string') {
    if (/^\d+$/.test(value) && (/bytes?|capacity|size/i.test(key) || key === 'used' || key === 'free') && Number(value) > 1024) {
      return formatBytes(value);
    }
    if (/^\d+$/.test(value) && /uptime|expires/i.test(key) && Number(value) > 60) {
      return formatDuration(value);
    }
    return value;
  }
  return String(value);
}

function pickTitle(item: Record<string, unknown>): string {
  const candidates = ['name', 'hostname', 'title', 'interface-name', 'id', 'interface', 'ssid', 'description', '_key'];
  for (const c of candidates) {
    if (item[c] != null && item[c] !== '') return String(item[c]);
  }
  return '';
}

interface ObjectViewProps {
  data: unknown;
  depth?: number;
  maxDepth?: number;
}

export function ObjectView({ data, depth = 0, maxDepth = 4 }: ObjectViewProps) {
  const { colors } = useSettings();

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: colors.textSecondary, paddingVertical: 8 }}>Список пуст</Text>;
    }
    return (
      <View style={{ gap: Spacing.sm }}>
        {data.map((item, i) => {
          if (isObject(item)) {
            const title = pickTitle(item) || `Элемент ${i + 1}`;
            return (
              <View key={i} style={[styles.nestedCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                <Text style={{ fontFamily: FONT.semiBold, fontSize: 14, color: colors.text, marginBottom: 6 }}>{title}</Text>
                <ObjectView data={item} depth={depth + 1} maxDepth={maxDepth} />
              </View>
            );
          }
          return (
            <Row key={i} label={`#${i + 1}`} value={scalarString(item, '')} last />
          );
        })}
      </View>
    );
  }

  if (isObject(data)) {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: colors.textSecondary, paddingVertical: 8 }}>Нет данных</Text>;
    }
    return (
      <View>
        {keys.map((key, i) => {
          const value = data[key];
          const label = humanizeKey(key);
          if (Array.isArray(value) || isObject(value)) {
            if (depth >= maxDepth) {
              return <Row key={key} label={label} value={Array.isArray(value) ? `[${value.length}]` : '{…}'} last={i === keys.length - 1} />;
            }
            return (
              <View key={key} style={{ paddingVertical: 8 }}>
                <Text style={{ fontFamily: FONT.semiBold, fontSize: 13, color: colors.accent, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {label}
                </Text>
                <ObjectView data={value} depth={depth + 1} maxDepth={maxDepth} />
              </View>
            );
          }
          return <Row key={key} label={label} value={scalarString(value, key)} last={i === keys.length - 1} />;
        })}
      </View>
    );
  }

  return <Row label="Значение" value={scalarString(data, '')} last />;
}

const styles = StyleSheet.create({
  nestedCard: {
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.sm,
  },
});
