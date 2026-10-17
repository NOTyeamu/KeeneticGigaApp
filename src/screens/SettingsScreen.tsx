import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { getBaseUrl, getRouteInfo, getRemoteUrl, setRemoteUrl, normalizeBaseUrl } from '../lib/api';
import { getAppVersion, checkForAppUpdate } from '../lib/version';
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
  /** Публичная ссылка на роутер — её же показываем под размытием. */
  const [remoteAddress, setRemoteAddress] = useState(getRemoteUrl());
  const [remoteDraft, setRemoteDraft] = useState('');
  const [editingRemote, setEditingRemote] = useState(false);
  const [savingRemote, setSavingRemote] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  /** Новая версия в репозитории — рядом с пунктом «Обновление системы». */
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  useEffect(() => {
    setUrl(getBaseUrl());
    setRoute(getRouteInfo());
    setRemoteAddress(getRemoteUrl());
  }, []);

  const saveRemote = async () => {
    const draft = remoteDraft.trim();
    if (!draft) return;
    haptic();
    setSavingRemote(true);
    setRemoteError(null);
    try {
      await setRemoteUrl(normalizeBaseUrl(draft));
      const saved = getRemoteUrl();
      setRemoteAddress(saved);
      setRemoteDraft('');
      setEditingRemote(false);
      setUrl(getBaseUrl());
      setRoute(getRouteInfo());
    } catch (e: any) {
      setRemoteError(e?.message ?? 'Не удалось сохранить адрес.');
    } finally {
      setSavingRemote(false);
    }
  };

  // Проверяем обновления при открытии настроек: тихо, без диалогов.
  useEffect(() => {
    let alive = true;
    checkForAppUpdate()
      .then((r) => {
        if (alive && r.hasUpdate) setUpdateVersion(r.latest.version);
      })
      .catch(() => {
        // нет сети или репозиторий недоступен — просто не показываем значок
      });
    return () => {
      alive = false;
    };
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
              <Ionicons name="globe-outline" size={15} color={colors.textSecondary} />
              <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: colors.text }}>Адрес роутера</Text>
              {remoteAddress ? (
                <View
                  style={{
                    backgroundColor: colors.accentSoft,
                    borderRadius: Radius.pill,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ fontFamily: FONT.medium, fontSize: 10, color: colors.accent }}>
                    ВНЕШНЯЯ ССЫЛКА
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Под размытием — публичная ссылка на роутер. */}
            {remoteAddress && !editingRemote ? (
              <HiddenValue
                value={remoteAddress}
                hint="Нажмите, чтобы показать · удерживайте, чтобы скопировать"
                onChangePress={() => {
                  setRemoteDraft(remoteAddress);
                  setEditingRemote(true);
                  setRemoteError(null);
                }}
              />
            ) : (
              <>
                <View
                  style={[
                    styles.inlineField,
                    { backgroundColor: colors.inputBg, borderColor: remoteError ? colors.danger : colors.border },
                  ]}
                >
                  <TextInput
                    value={remoteDraft}
                    onChangeText={setRemoteDraft}
                    placeholder="https://имя.keenetic.link/rci/"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    autoFocus={!!remoteAddress}
                    style={{ flex: 1, fontFamily: FONT.regular, fontSize: 14, color: colors.text, paddingHorizontal: 10 }}
                  />
                  <Pressable
                    onPress={saveRemote}
                    disabled={savingRemote || !remoteDraft.trim()}
                    android_ripple={{ color: colors.accentSoft }}
                    style={[
                      styles.inlineSave,
                      {
                        backgroundColor: remoteDraft.trim() ? colors.accent : colors.divider,
                        opacity: savingRemote ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  </Pressable>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                  {!remoteAddress ? (
                    <Text style={{ flex: 1, fontFamily: FONT.regular, fontSize: 11.5, color: colors.textSecondary }}>
                      Без ссылки приложение подключается только к домашней сети.
                    </Text>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                  <Pressable
                    onPress={() => {
                      haptic();
                      setEditingRemote(false);
                      setRemoteDraft('');
                      setRemoteError(null);
                    }}
                    hitSlop={8}
                  >
                    <Text style={{ fontFamily: FONT.semiBold, fontSize: 12, color: colors.textSecondary, marginLeft: 10 }}>
                      Отмена
                    </Text>
                  </Pressable>
                  {remoteAddress ? (
                    <Pressable
                      onPress={() => {
                        haptic();
                        setRemoteUrl(null).then(() => {
                          setRemoteAddress(getRemoteUrl());
                          setEditingRemote(false);
                          setRemoteDraft('');
                          setUrl(getBaseUrl());
                          setRoute(getRouteInfo());
                        });
                      }}
                      hitSlop={8}
                    >
                      <Text style={{ fontFamily: FONT.semiBold, fontSize: 12, color: colors.danger, marginLeft: 12 }}>
                        Удалить
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {remoteError ? (
                  <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: colors.danger, marginTop: 6 }}>
                    {remoteError}
                  </Text>
                ) : null}
              </>
            )}

            {route.reason === 'unreachable' ? (
              <Text style={{ fontFamily: FONT.regular, fontSize: 11.5, color: colors.danger, marginTop: 6 }}>
                Роутер не отвечает ни по домашнему адресу, ни по внешней ссылке
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
        {MANAGEMENT_ITEMS.map((item, i) => {
          const hasUpdate = item.id === 'system-update' && updateVersion !== null;
          return (
            <View key={item.id}>
              <ListButton
                title={item.title}
                icon={item.icon}
                subtitle={hasUpdate ? `Доступна версия ${updateVersion}` : undefined}
                first={i === 0}
                last={i === MANAGEMENT_ITEMS.length - 1}
                right={
                  hasUpdate ? (
                    <View style={[styles.updateBadge, { backgroundColor: colors.accent }]}>
                      <Ionicons name="arrow-up" size={11} color="#FFFFFF" />
                      <Text style={styles.updateBadgeText}>Есть обновление</Text>
                    </View>
                  ) : undefined
                }
                onPress={() => openMaintenance(item)}
              />
              {i < MANAGEMENT_ITEMS.length - 1 ? (
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginLeft: 58 }} />
              ) : null}
            </View>
          );
        })}
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
  inlineField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  inlineSave: {
    width: 44,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  updateBadgeText: {
    fontFamily: FONT.semiBold,
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
