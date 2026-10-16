import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius, Spacing } from '../theme/colors';

interface ListButtonProps {
  title: string;
  icon?: string;
  iconColor?: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  destructive?: boolean;
  first?: boolean;
  last?: boolean;
}

export function ListButton({
  title,
  icon,
  iconColor,
  subtitle,
  right,
  onPress,
  showChevron = true,
  destructive = false,
  first,
  last,
}: ListButtonProps) {
  const { colors } = useSettings();
  const accent = destructive ? colors.danger : iconColor || colors.accent;

  const inner = (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card },
        first && { borderTopLeftRadius: Radius.md, borderTopRightRadius: Radius.md },
        last && { borderBottomLeftRadius: Radius.md, borderBottomRightRadius: Radius.md },
      ]}
    >
      {icon ? (
        <View style={[styles.iconBox, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name={icon as any} size={18} color={accent} />
        </View>
      ) : null}
      <View style={{ flex: 1, marginLeft: icon ? 12 : 0 }}>
        <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: destructive ? colors.danger : colors.text }}>{title}</Text>
        {subtitle ? (
          <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{subtitle}</Text>
        ) : null}
      </View>
      {right ? <View style={{ marginRight: 4 }}>{right}</View> : null}
      {showChevron && onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: colors.accentSoft, borderless: false, radius: 240 }}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    minHeight: 56,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
