import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { getBaseUrl, getRouteInfo } from '../lib/api';
import { getAppVersion } from '../lib/version';
import { MANAGEMENT_ITEMS, type SubItem } from '../data/sections';
import { FONT, Radius, Spacing } from '../theme/colors';
import { ListButton } from '../components/ListButton';
import { HiddenValue } from '../components/HiddenValue';
import { useAlert } from '../components/AlertDialog';

export function SettingsScreen() {
  const { colors, theme, language, vibration, setTheme, setLanguage, setVibration, haptic } = useSettings();
  const { signOut } = useAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const alert = useAlert();
  const [url, setUrl] = useState(getBaseUrl());
  const [route, setRoute] = useState(getRouteInfo());
  useEffect(() => {
    setUrl(getBaseUrl());
    setRoute(getRouteInfo());
  }, []);

  const pickLanguage = () => {
    haptic();
    alert.show({
      title: 'Язык интерфейса',
      options: [
        { text: 'Русский', value: 'ru', onPress: () => setLanguage('ru') },
        { text: 'English', value: 'en', onPress: () => setLanguage('en') },
        { text: 'Отмена', value: 'cancel' },
      ],
    });
  };

  const pickTheme = () => {
    haptic();
    alert.show({
      title: 'Тема оформления',
      options: [
        { text: 'Тёмная', value: 'dark', onPress: () => setTheme('dark') },
        { text: 'Светлая', value: 'light', onPress: () => setTheme('light') },
        { text: 'Отмена', value: 'cancel' },
      ],
    });
  };

  const openMaintenance = (item: SubItem) => {
    haptic();
    navigation.navigate('SettingsPage', { title: item.title, page: item.page });
  };

  const showAbout = () => {
    haptic();
    alert.show({
      title: 'О приложении',
      message:
        `Keenetic Giga — неофициальный клиент для управления роутером Keenetic Giga через RCI API.\n\nВерсия ${getAppVersion()}\nАвторизация: NDW2 Auth`,
      actions: [{ text: 'OK' }],
    });
  };

  const logout = () => {
    haptic(20);
    alert.show({
      title: 'Выход',
      message: 'Сбросить авторизацию и вернуться к экрану входа?',
      destructive: true,
      actions: [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выйти', style: 'destructive', onPress: () => signOut() },
      ],
    });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 80 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ fontFamily: FONT.bold, fontSize: 30, color: colors.text, letterSpacing: -0.6, marginBottom: 20 }}>Настройки</Text>

      <SectionLabel colors={colors}>Роутер</SectionLabel>
      <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={[styles.row, { borderBottomColor: colors.divider, alignItems: 'flex-start' }]}>
          <View style={{ flex: 1, marginRight: Spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Ionicons name="server-outline" size={15} color={colors.textSecondary} />
              <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: colors.text }}>Адрес роутера</Text>
              <View
                style={{
                  backgroundColor: colors.accentSoft,
                  borderRadius: Radius.pill,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                <Text style={{ fontFamily: FONT.medium, fontSize: 10, color: colors.accent }}>
                  {route.kind === 'local' ? 'ДОМАШНЯЯ СЕТЬ' : 'ВНЕШНЯЯ ССЫЛКА'}
                </Text>
              </View>
            </View>
            <HiddenValue value={url} hint="Нажмите, чтобы показать · удерживайте, чтобы скопировать" />
            {route.reason === 'unreachable' ? (
              <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: colors.danger, marginTop: 6 }}>
                Роутер не отвечает по этому адресу
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <SectionLabel colors={colors}>Оформление</SectionLabel>
      <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ListButton
          title="Язык"
          icon="language-outline"
          subtitle={language === 'ru' ? 'Русский' : 'English'}
          first
          last
          onPress={pickLanguage}
        />
      </View>
      <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card, marginTop: Spacing.sm }]}>
        <ListButton
          title="Тема"
          icon={theme === 'dark' ? 'moon-outline' : 'sunny-outline'}
          subtitle={theme === 'dark' ? 'Тёмная' : 'Светлая'}
          first
          last
          onPress={pickTheme}
        />
      </View>

      <SectionLabel colors={colors}>Взаимодействие</SectionLabel>
      <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={[styles.row, { paddingVertical: 14 }]}>
          <View style={[styles.iconBox, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="pulse-outline" size={18} color={colors.accent} />
          </View>
          <Text style={{ flex: 1, marginLeft: 12, fontFamily: FONT.medium, fontSize: 15, color: colors.text }}>Вибрация</Text>
          <Switch
            value={vibration}
            onValueChange={(v) => {
              haptic();
              setVibration(v);
            }}
            trackColor={{ false: colors.divider, true: colors.accent }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={colors.divider}
          />
        </View>
      </View>

      <SectionLabel colors={colors}>Обслуживание роутера</SectionLabel>
      <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {MANAGEMENT_ITEMS.map((item, i) => (
          <View key={item.id}>
            <ListButton
              title={item.title}
              icon={item.icon}
              first={i === 0}
              last={i === MANAGEMENT_ITEMS.length - 1}
              onPress={() => openMaintenance(item)}
            />
            {i < MANAGEMENT_ITEMS.length - 1 ? (
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginLeft: 58 }} />
            ) : null}
          </View>
        ))}
      </View>

      <SectionLabel colors={colors}>Приложение</SectionLabel>
      <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ListButton title="О приложении" icon="information-circle-outline" first last onPress={showAbout} />
      </View>

      <View style={{ marginTop: Spacing.xl }} />
      <Pressable
        onPress={logout}
        android_ripple={{ color: 'rgba(255,92,92,0.14)' }}
        style={({ pressed }) => [styles.logoutBtn, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={{ fontFamily: FONT.semiBold, fontSize: 16, color: colors.danger, marginLeft: 10 }}>Выйти</Text>
      </Pressable>

      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: Spacing.lg }}>
        Keenetic Giga · v{getAppVersion()}
      </Text>
    </ScrollView>
  );
}

function SectionLabel({ children, colors }: { children: React.ReactNode; colors: ReturnType<typeof useSettings>['colors'] }) {
  return (
    <Text
      style={{
        fontFamily: FONT.medium,
        fontSize: 13,
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginLeft: 4,
        marginBottom: 8,
        marginTop: 20,
      }}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
