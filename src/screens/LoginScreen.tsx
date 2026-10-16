import { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import {
  Api,
  getBaseUrl,
  getLocalUrl,
  getRemoteUrl,
  setBaseUrl,
  setRemoteUrl,
  normalizeBaseUrl,
  resolveRoute,
  hasRemoteUrl,
} from '../lib/api';
import { getAppVersion } from '../lib/version';
import { AuthError, NetworkError } from '../lib/digest';
import { FONT, Radius, Spacing } from '../theme/colors';

// Enable LayoutAnimation on Android so resizing the URL bubbles up smoothly.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const URL_ANIM_DURATION = 260;

function smoothLayout() {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(URL_ANIM_DURATION, LayoutAnimation.Types.easeOut, LayoutAnimation.Properties.scaleXY),
  );
}

export function LoginScreen() {
  const { colors, haptic } = useSettings();
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URL display + inline edit.
  const [urlDisplay, setUrlDisplay] = useState(getBaseUrl());
  const [editingUrl, setEditingUrl] = useState(false);
  const [editLocal, setEditLocal] = useState(getLocalUrl());
  const [editRemote, setEditRemote] = useState(getRemoteUrl() ?? '');
  const [urlsSaved, setUrlsSaved] = useState(false);
  const urlScale = useRef(new Animated.Value(1)).current;

  // About modal.
  const [aboutOpen, setAboutOpen] = useState(false);

  const handleLogin = async () => {
    if (!user.trim() || !pass) {
      setError('Введите логин и пароль.');
      return;
    }
    setError(null);
    setLoading(true);
    haptic(18);
    try {
      const creds = { user: user.trim(), pass };

      // Сначала пробуем домашний адрес, при недоступности — внешнюю ссылку.
      const reachable = await resolveRoute(true);
      if (!reachable) {
        setError(
          hasRemoteUrl()
            ? 'Роутер не отвечает ни по домашнему адресу, ни по внешней ссылке. Проверьте подключение к сети и адреса роутера.'
            : 'Роутер не отвечает по домашнему адресу. Если вы не дома, укажите внешнюю ссылку — она задаётся по кнопке с карандашом ниже.',
        );
        return;
      }

      await Api.system(creds);
      await signIn(creds);
    } catch (e: unknown) {
      if (e instanceof AuthError) setError(e.message);
      else if (e instanceof NetworkError) setError(e.message);
      else if (e instanceof Error) setError(e.message);
      else setError('Не удалось войти.');
    } finally {
      setLoading(false);
    }
  };

  const animateUrlScale = (to: number) =>
    Animated.timing(urlScale, {
      toValue: to,
      duration: URL_ANIM_DURATION,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

  const onRenamePress = () => {
    haptic(18);
    setEditLocal(getLocalUrl());
    setEditRemote(getRemoteUrl() ?? '');
    setUrlsSaved(false);
    setEditingUrl(true);
    smoothLayout();
    animateUrlScale(1.35);
  };

  const commitUrl = () => {
    const local = normalizeBaseUrl(editLocal);
    const remote = editRemote.trim() ? normalizeBaseUrl(editRemote) : null;
    (async () => {
      await setBaseUrl(local, false);
      await setRemoteUrl(remote, true);
      setUrlDisplay(getBaseUrl());
      setError(null);
      setUrlsSaved(true);
      smoothLayout();
      animateUrlScale(1);
      setTimeout(() => setEditingUrl(false), 500);
    })();
  };

  const cancelUrl = () => {
    setEditingUrl(false);
    smoothLayout();
    animateUrlScale(1);
  };

  const urlColor = colors.textMuted;

  // Position the form block at a fixed fraction of the screen height from the
  // top, so it lands in the upper-middle of the screen regardless of brand/footer
  // heights (flex balancing kept landing it too low on this device).
  const winH = Dimensions.get('window').height;
  const formTop = Math.round(winH * 0.50) - 60; // mid screen, pulled up a touch

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>

        {/* ── Brand stack pinned to the very top, with overlap ── */}
        <View style={styles.brandStack}>
          <Image
            source={require('../../assets/keenetic_giga_router_image.png')}
            style={styles.routerImage}
            resizeMode="contain"
          />
          {/* Brand text image lifted up so it overlaps the bottom of the router image. */}
          <Image
            source={require('../../assets/keenetic_giga_text_image.png')}
            style={styles.brandImage}
            resizeMode="contain"
          />
          {/* Subtitle + info button, lifted up so it overlaps the brand text image. */}
          <View style={styles.subtitleRow}>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Управление роутером</Text>
            <Pressable
              onPress={() => { haptic(14); setAboutOpen(true); }}
              hitSlop={10}
              style={styles.infoBtn}
            >
              <Image
                source={require('../../assets/info_icon.png')}
                style={[styles.infoIcon, { tintColor: colors.textSecondary }]}
                resizeMode="contain"
              />
            </Pressable>
          </View>
        </View>

        {/* ── Form block pinned at a fixed screen height (upper-middle) ── */}
        <View style={[styles.formBlock, { top: formTop }]}>

        {/* ── Center: form (login + password) ── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.field, { borderBottomColor: colors.divider }]}>
            <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
            <TextInput
              value={user}
              onChangeText={setUser}
              placeholder="Логин"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              style={{ flex: 1, fontFamily: FONT.regular, fontSize: 16, color: colors.text, paddingHorizontal: 12 }}
              editable={!loading}
            />
          </View>
          <View style={[styles.field, { borderBottomWidth: 0 }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
            <TextInput
              value={pass}
              onChangeText={setPass}
              placeholder="Пароль"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPass}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              style={{ flex: 1, fontFamily: FONT.regular, fontSize: 16, color: colors.text, paddingHorizontal: 12 }}
              editable={!loading}
            />
            <Pressable onPress={() => setShowPass((s) => !s)} hitSlop={10}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: 'rgba(255,92,92,0.10)', borderColor: colors.danger }]}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={{ flex: 1, fontFamily: FONT.regular, fontSize: 13, color: colors.danger, marginLeft: 8 }}>{error}</Text>
          </View>
        ) : null}

        {/* ── Login button ── */}
        <Pressable
          onPress={handleLogin}
          disabled={loading}
          android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
          style={({ pressed }) => [
            styles.loginBtn,
            { backgroundColor: loading ? colors.accentDim : colors.accent },
            pressed && { opacity: 0.88 },
          ]}
        >
          <Text style={styles.loginBtnText}>{loading ? 'Вход…' : 'Войти'}</Text>
        </Pressable>
        </View>

        {/* ── Bottom: badge + editable URL (pinned to bottom) ── */}
        <View style={[styles.bottom, { marginBottom: 4, bottom: insets.bottom + 8 }]}>
          <View style={[styles.badge, { borderColor: colors.border }]}>
            <Ionicons name="shield-checkmark-outline" size={13} color={colors.textSecondary} />
            <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: colors.textSecondary, marginLeft: 6 }}>NDW2 Auth</Text>
          </View>

          <Pressable onPress={onRenamePress} hitSlop={8} style={styles.urlRow}>
            <Animated.Text
              style={{
                fontFamily: FONT.regular,
                fontSize: 11,
                color: urlColor,
                marginTop: 10,
                textAlign: 'center',
                transform: [{ scale: urlScale }],
                flex: 1,
              }}
              numberOfLines={1}
            >
              {urlDisplay}
            </Animated.Text>

            <View style={styles.renameBtn}>
              <Image
                source={require('../../assets/rename_icon.png')}
                style={[styles.renameIcon, { tintColor: urlColor }]}
                resizeMode="contain"
              />
            </View>
          </Pressable>
        </View>

        {/* ── Edit URL modal ── */}
        <Modal visible={editingUrl} transparent animationType="fade" onRequestClose={cancelUrl}>
          <Pressable style={styles.modalOverlay} onPress={cancelUrl}>
            <Pressable
              style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={(e) => e.stopPropagation()}
            >
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Адреса роутера</Text>

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Домашняя сеть (приоритет)</Text>
                <View style={[styles.modalField, { borderColor: colors.divider, backgroundColor: colors.inputBg }]}>
                  <TextInput
                    value={editLocal}
                    onChangeText={setEditLocal}
                    placeholder="http://my.keenetic.net/rci/"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    selectTextOnFocus
                    autoFocus
                    style={{ flex: 1, fontFamily: FONT.regular, fontSize: 15, color: colors.text, paddingHorizontal: 12 }}
                  />
                </View>
                <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
                  Используется, когда телефон подключён к домашней сети.
                </Text>

                <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.md }]}>
                  Внешняя ссылка (KeenDNS)
                </Text>
                <View style={[styles.modalField, { borderColor: colors.divider, backgroundColor: colors.inputBg }]}>
                  <TextInput
                    value={editRemote}
                    onChangeText={setEditRemote}
                    placeholder="https://имя.keenetic.link/rci/"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    selectTextOnFocus
                    style={{ flex: 1, fontFamily: FONT.regular, fontSize: 15, color: colors.text, paddingHorizontal: 12 }}
                  />
                </View>
                <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
                  Применяется, когда домашняя сеть недоступна. Можно оставить пустым.
                </Text>
                {urlsSaved ? (
                  <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: colors.online, marginTop: Spacing.sm }}>
                    Сохранено ✓
                  </Text>
                ) : null}
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable onPress={cancelUrl} style={[styles.modalBtn, { borderColor: colors.border }]}>
                  <Text style={[styles.modalBtnLabel, { color: colors.textSecondary }]}>Отмена</Text>
                </Pressable>
                <Pressable
                  onPress={commitUrl}
                  style={[styles.modalBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
                >
                  <Text style={[styles.modalBtnLabel, { color: '#FFFFFF' }]}>Сохранить</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── About modal ── */}
        <Modal visible={aboutOpen} transparent animationType="fade" onRequestClose={() => setAboutOpen(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setAboutOpen(false)}>
            <Pressable
              style={[styles.aboutCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Image
                source={require('../../assets/keenetic_giga_text_image.png')}
                style={styles.aboutBrand}
                resizeMode="contain"
              />
              <Text style={[styles.aboutSub, { color: colors.textSecondary }]}>Версия {getAppVersion()}</Text>

              <View style={[styles.aboutDivider, { backgroundColor: colors.divider }]} />

              <ScrollView style={styles.aboutScroll} showsVerticalScrollIndicator={false}>
                <Text style={[styles.aboutBody, { color: colors.textSecondary }]}>
                  Это неофициальное приложение для управления роутером Keenetic Giga через RCI API. Оно не связано с компанией Keenetic и не является официальным продуктом.
                </Text>
                <Text style={[styles.aboutBody, { color: colors.textSecondary }]}>
                  Авторизация выполняется по протоколу NDW2 роутера. Адрес и учётные данные хранятся локально на устройстве.
                </Text>
                <Text style={[styles.aboutBody, { color: colors.textMuted }]}>
                  Используйте на свой риск. Подключение возможно только к роутеру, доступному по указанному адресу.
                </Text>
              </ScrollView>

              <Pressable
                onPress={() => setAboutOpen(false)}
                style={({ pressed }) => [
                  styles.aboutBtn,
                  { backgroundColor: colors.accent, borderColor: colors.accent },
                  pressed && { opacity: 0.88 },
                ]}
                android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
              >
                <Text style={styles.aboutBtnLabel}>Понятно</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  formBlock: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
  },
  brandStack: {
    alignItems: 'center',
    width: '100%',
  },
  routerImage: {
    width: 300,
    height: 215,
  },
  brandImage: {
    width: '92%',
    maxWidth: 500,
    aspectRatio: 1280 / 518,
    height: undefined,
    // Lifted up hard so it overlaps the bottom edge of the router image.
    marginTop: -40,
    marginBottom: 0,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Lifted up so it overlaps the bottom edge of the brand text image.
    marginTop: -16,
  },
  subtitle: {
    fontFamily: FONT.regular,
    fontSize: 14,
  },
  infoBtn: {
    marginLeft: 8,
    padding: 4,
  },
  infoIcon: {
    width: 16,
    height: 16,
    opacity: 0.8,
  },
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.sm,
    marginTop: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  loginBtn: {
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  loginBtnText: {
    fontFamily: FONT.semiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  bottom: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 4,
  },
  renameBtn: {
    marginTop: 10,
    marginLeft: 6,
    padding: 4,
  },
  renameIcon: {
    width: 16,
    height: 16,
  },
  // ── shared modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  modalTitle: {
    fontFamily: FONT.semiBold,
    fontSize: 17,
    marginBottom: Spacing.sm,
  },
  modalField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalHint: {
    fontFamily: FONT.regular,
    fontSize: 11.5,
    marginTop: 6,
  },
  fieldLabel: {
    fontFamily: FONT.medium,
    fontSize: 12.5,
    marginBottom: 6,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.md,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginLeft: Spacing.sm,
  },
  modalBtnLabel: {
    fontFamily: FONT.semiBold,
    fontSize: 14,
  },
  // ── about modal ──
  aboutCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    maxHeight: '82%',
  },
  aboutBrand: {
    width: '78%',
    maxWidth: 300,
    aspectRatio: 1280 / 518,
    height: undefined,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  aboutSub: {
    fontFamily: FONT.regular,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
  },
  aboutDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginVertical: Spacing.md,
  },
  aboutScroll: {
    maxHeight: 200,
  },
  aboutBody: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  aboutBtn: {
    marginTop: Spacing.md,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  aboutBtnLabel: {
    fontFamily: FONT.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
});
