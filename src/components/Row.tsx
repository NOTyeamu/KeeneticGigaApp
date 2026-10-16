import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSettings } from '../context/SettingsContext';
import { FONT, Spacing } from '../theme/colors';

interface RowProps {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
  last?: boolean;
  hint?: string;
  /** Копировать значение по долгому нажатию (по умолчанию включено для строк/чисел). */
  copyable?: boolean;
}

export function Row({ label, value, children, last, hint, copyable = true }: RowProps) {
  const { colors, haptic } = useSettings();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const textValue = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const canCopy = copyable && !children && textValue !== '' && textValue !== '—';

  const onLongPress = async () => {
    if (!canCopy) return;
    try {
      await Clipboard.setStringAsync(textValue);
    } catch {
      return;
    }
    haptic();
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1100);
  };

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={!canCopy}
      style={[styles.row, !last && { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth }]}
    >
      <View style={{ flex: 1, marginRight: Spacing.sm }}>
        <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: colors.textSecondary }}>{label}</Text>
        {hint ? <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      {children ? (
        <View style={{ flex: 1.2, alignItems: 'flex-end' }}>{children}</View>
      ) : (
        <Text
          selectable
          style={{
            fontFamily: FONT.medium,
            fontSize: 14,
            color: copied ? colors.online : colors.text,
            textAlign: 'right',
            flex: 1.2,
          }}
        >
          {copied ? 'Скопировано ✓' : value ?? '—'}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
});
