import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius, Spacing } from '../theme/colors';
import { getPageComponent } from './pages';

export interface SettingsPageParams {
  title: string;
  page: string;
  subtitle?: string;
}

/**
 * Экран страницы, открытой из «Настроек». Живёт внутри стека вкладки
 * «Настройки», поэтому переход не выбрасывает пользователя в «Раздел».
 */
export function SettingsPageScreen({ route }: { route: { params: SettingsPageParams } }) {
  const { colors } = useSettings();
  const insets = useSafeAreaInsets();
  const { title, page } = route.params;
  const PageComponent = getPageComponent(page);

  if (!PageComponent) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg }}>
        <View style={[styles.iconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="layers-outline" size={34} color={colors.textSecondary} />
        </View>
        <Text style={{ fontFamily: FONT.semiBold, fontSize: 16, color: colors.text, marginTop: Spacing.md, textAlign: 'center' }}>
          Страница недоступна
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.divider }]}>
        <Text style={{ fontFamily: FONT.semiBold, fontSize: 17, color: colors.text }} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <PageComponent />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});