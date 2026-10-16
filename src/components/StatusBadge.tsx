import { StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius } from '../theme/colors';
import { isOnline } from '../lib/format';

interface StatusBadgeProps {
  online?: boolean;
  value?: React.ReactNode;
  label?: string;
}

export function StatusBadge({ online, value, label }: StatusBadgeProps) {
  const { colors } = useSettings();
  const isUp = online !== undefined ? online : isOnline(value);
  const text = label ?? (isUp ? 'Онлайн' : 'Офлайн');
  const color = isUp ? colors.online : colors.offline;
  return (
    <View style={[styles.badge, { backgroundColor: isUp ? 'rgba(52,211,153,0.12)' : 'rgba(107,122,133,0.14)' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={{ fontFamily: FONT.medium, fontSize: 12, color }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
