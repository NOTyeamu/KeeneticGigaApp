import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius, Spacing } from '../theme/colors';

export function LoadingState({ label = 'Загрузка…' }: { label?: string }) {
  const { colors } = useSettings();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: colors.textSecondary, marginTop: Spacing.sm }}>
        {label}
      </Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useSettings();
  return (
    <View style={styles.center}>
      <View style={[styles.iconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.danger} />
      </View>
      <Text style={{ fontFamily: FONT.semiBold, fontSize: 16, color: colors.text, marginTop: Spacing.md, textAlign: 'center' }}>
        Не удалось получить данные
      </Text>
      <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: colors.textSecondary, marginTop: 6, textAlign: 'center', maxWidth: 280 }}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          android_ripple={{ color: colors.accentSoft }}
          style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accent }, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.accent} />
          <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: colors.accent, marginLeft: 8 }}>Повторить</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, subtitle }: { icon?: string; title: string; subtitle?: string }) {
  const { colors } = useSettings();
  return (
    <View style={styles.center}>
      <View style={[styles.iconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name={icon as any} size={32} color={colors.textSecondary} />
      </View>
      <Text style={{ fontFamily: FONT.semiBold, fontSize: 16, color: colors.text, marginTop: Spacing.md, textAlign: 'center' }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: colors.textSecondary, marginTop: 6, textAlign: 'center', maxWidth: 280 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
