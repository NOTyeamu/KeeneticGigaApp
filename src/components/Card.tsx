import { Pressable, StyleSheet, Text, View, type ViewStyle, type StyleProp } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { Radius, Spacing, FONT } from '../theme/colors';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}

export function Card({ children, style, onPress, padded = true }: CardProps) {
  const { colors } = useSettings();
  const content = (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        padded && { padding: Spacing.md },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: colors.accentSoft, radius: 240, borderless: false }}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.85,
  },
});

export function CardTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  const { colors } = useSettings();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <Text style={{ fontFamily: FONT.semiBold, fontSize: 16, color: colors.text }}>{children}</Text>
      {action}
    </View>
  );
}
