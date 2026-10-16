import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';
import { FONT, Spacing } from '../theme/colors';
import { boolText, formatBytes, formatNumber, humanizeKey } from '../lib/format';

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function scalarString(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return boolText(value);
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
}

function summary(value: unknown): string {
  if (Array.isArray(value)) return `[${value.length}]`;
  if (isObject(value)) return `{${Object.keys(value).length}}`;
  return scalarString(value);
}

function TreeNode({
  label,
  value,
  depth,
  defaultExpanded,
  maxDepth,
}: {
  label: string;
  value: unknown;
  depth: number;
  defaultExpanded: boolean;
  maxDepth: number;
}) {
  const { colors } = useSettings();
  const isBranch = Array.isArray(value) || isObject(value);
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!isBranch) {
    return (
      <View style={[styles.leafRow, { paddingLeft: depth * 14 + 4 }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={2}>
          {label}
        </Text>
        <Text style={[styles.value, { color: colors.text }]} numberOfLines={3}>
          {scalarString(value)}
        </Text>
      </View>
    );
  }

  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);

  return (
    <View>
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        android_ripple={{ color: colors.accentSoft, borderless: true }}
        style={({ pressed }) => [styles.branchRow, { paddingLeft: depth * 14 + 4 }, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.textMuted} />
        <Text style={[styles.branchLabel, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.summary, { color: colors.textMuted }]}>{summary(value)}</Text>
      </Pressable>
      {expanded ? (
        <View style={{ marginTop: 2 }}>
          {entries.map(([k, v], i) => (
            <TreeNode
              key={`${k}-${i}`}
              label={Array.isArray(value) ? `#${k}` : humanizeKey(k)}
              value={v}
              depth={depth + 1}
              defaultExpanded={depth + 1 < maxDepth ? defaultExpanded : false}
              maxDepth={maxDepth}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ConfigTree({ data, maxDepth = 2 }: { data: unknown; maxDepth?: number }) {
  const { colors } = useSettings();
  if (data == null) {
    return <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: colors.textSecondary }}>Нет данных.</Text>;
  }
  return (
    <View style={{ paddingVertical: 4 }}>
      <TreeNode label="Конфигурация" value={data} depth={0} defaultExpanded={true} maxDepth={maxDepth} />
    </View>
  );
}

const styles = StyleSheet.create({
  leafRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: Spacing.sm,
  },
  label: {
    fontFamily: FONT.regular,
    fontSize: 13,
    flex: 1,
  },
  value: {
    fontFamily: FONT.medium,
    fontSize: 13,
    flex: 1.2,
    textAlign: 'right',
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 6,
  },
  branchLabel: {
    fontFamily: FONT.semiBold,
    fontSize: 13,
    flex: 1,
  },
  summary: {
    fontFamily: FONT.regular,
    fontSize: 12,
  },
});
