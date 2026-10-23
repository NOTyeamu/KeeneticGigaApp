import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useAlert } from '../components/AlertDialog';
import { BrandStack } from '../components/BrandStack';
import { PinDots } from '../components/PinDots';
import { PinKeypad } from '../components/PinKeypad';
import { PIN_LENGTH } from '../lib/session';
import { FONT, Radius, Spacing } from '../theme/colors';

/**
 * Экран блокировки сохранённой сессии.
 *
 * Показывается при запуске, когда вход сохранён: логин и пароль уже лежат
 * на устройстве под пин-кодом, остаётся их открыть. Оформление повторяет
 * экран входа — та же шапка с роутером, та же карточка, тот же значок
 * снизу.
 *
 * Два способа входа переключаются в обе стороны: если заведён отпечаток,
 * он предлагается сразу, но рядом всегда есть кнопка ввода пина, и обратно
 * тоже. Так пользователь не окажется заперт, если палец мокрый или сканер
 * не сработал.
 */
export function LockScreen() {
  const { colors, haptic } = useSettings();
  const { unlock, unlockWithBiometrics, biometricEnabled, forgotPin } = useAuth();
  const alert = useAlert();
  const insets = useSafeAreaInsets();

  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Показывать ли клавиатуру вместо предложения отпечатка. */
  const [pinMode, setPinMode] = useState(!biometricEnabled);

  /**
   * Отпечаток спрашиваем сами при открытии, но ровно один раз: иначе после
   * каждого неудачного ввода пин-кода система снова лезла бы с предложением.
   */
  const bioAsked = useRef(false);

  // ── Анимации ───────────────────────────────────────────────
  // Появление экрана: он мягко проявляется, а не возникает рывком.
  const appear = useRef(new Animated.Value(0)).current;
  // Успех: карточка на миг увеличивается и тает, прежде чем откроется меню.
  const success = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [appear]);

  /**
   * Показывает, что вход выполнен. Ждём окончания анимации, а затем
   * приложение само сменит экран — поэтому здесь ничего не переключаем.
   */
  const playSuccess = useCallback(async () => {
    haptic(30);
    await new Promise<void>((resolve) => {
      Animated.timing(success, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => resolve());
    });
  }, [haptic, success]);

  const appearStyle = {
    opacity: appear,
    transform: [
      { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
    ],
  };

  const successStyle = {
    opacity: success.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [
      { scale: success.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
    ],
  };

  const tryBiometrics = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const ok = await unlockWithBiometrics();
      if (ok) {
        await playSuccess();
      } else {
        // Отмена или устаревший отпечаток — переводим на ввод пина,
        // ругаться тут не на что.
        setPinMode(true);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, unlockWithBiometrics, playSuccess]);

  useEffect(() => {
    if (!biometricEnabled || bioAsked.current) return;
    bioAsked.current = true;
    void tryBiometrics();
  }, [biometricEnabled, tryBiometrics]);

  /** Проверяет пин, как только введены все цифры. */
  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      const ok = await unlock(value);
      if (ok) {
        await playSuccess();
      } else {
        haptic(60);
        setError(true);
        setPin('');
        // Встряска индикатора короткая — снимаем пометку, когда она отыграла.
        setTimeout(() => setError(false), 600);
      }
      setBusy(false);
    },
    [haptic, unlock, playSuccess],
  );

  const onDigit = (digit: string) => {
    if (busy || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  const onDelete = () => {
    if (busy) return;
    setPin((p) => p.slice(0, -1));
  };

  const confirmForgot = () => {
    haptic(20);
    alert.show({
      title: 'Забыли пин-код?',
      message:
        'Сохранённый вход будет стереть, и приложение вернётся к обычному экрану входа. ' +
        'Данные роутера при этом никуда не денутся — войти можно будет логином и паролем.',
      destructive: true,
      actions: [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Сбросить', style: 'destructive', onPress: () => void forgotPin() },
      ],
    });
  };

  // Форма стоит так же, как на экране входа: в верхней половине экрана.
  const winH = Dimensions.get('window').height;
  const formTop = Math.round(winH * 0.5) - 40;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/*
        Подложка: картинка растянута на весь экран. Сама она тёмная, поэтому
        затемнение здесь лёгкое — оно лишь добавляет глубины и помогает
        карточке читаться, но не прячет рисунок целиком.
      */}
      <Image
        source={require('../../assets/background_for_pin_code.jpg')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,10,14,0.35)' }]} />

      <Animated.View
        style={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 },
          appearStyle,
        ]}
      >
        <BrandStack />

        <View style={[styles.formBlock, { top: formTop }]}>
          <Animated.View style={successStyle}>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <PinDots filled={pin.length} error={error} />

              <Text style={[styles.hint, { color: error ? colors.danger : colors.textSecondary }]}>
                {busy && !error ? 'Проверяем…' : error ? 'Неверный пин-код' : 'Введите пин-код'}
              </Text>

              {/*
                Пока выводится ключ, клавиатуры нет: вывод намеренно сделан
                тяжёлым, и без индикатора казалось бы, что приложение зависло.
              */}
              {busy ? (
                <View style={styles.busyBlock}>
                  <ActivityIndicator size="large" color={colors.accent} />
                </View>
              ) : pinMode ? (
                <PinKeypad onDigit={onDigit} onDelete={onDelete} />
              ) : (
                <View style={styles.bioBlock}>
                  <Pressable
                    onPress={() => {
                      haptic();
                      void tryBiometrics();
                    }}
                    android_ripple={{ color: colors.accentSoft, borderless: true }}
                    style={({ pressed }) => [styles.bioBtn, { borderColor: colors.accent }, pressed && { opacity: 0.85 }]}
                  >
                    <Ionicons name="finger-print-outline" size={40} color={colors.accent} />
                  </Pressable>
                  <Text style={[styles.bioHint, { color: colors.textSecondary }]}>
                    Приложите палец, чтобы войти
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Переключение способа входа — в обе стороны. */}
          {biometricEnabled && !busy ? (
            <Pressable
              onPress={() => {
                haptic();
                if (pinMode) void tryBiometrics();
                else setPinMode(true);
              }}
              hitSlop={8}
              style={styles.switchBtn}
            >
              <Ionicons
                name={pinMode ? 'finger-print-outline' : 'keypad-outline'}
                size={16}
                color={colors.accent}
              />
              <Text style={[styles.switchLabel, { color: colors.accent }]}>
                {pinMode ? 'Войти по отпечатку' : 'Ввести пин-код'}
              </Text>
            </Pressable>
          ) : null}

          {!busy ? (
            <Pressable onPress={confirmForgot} hitSlop={8} style={styles.forgotBtn}>
              <Text style={[styles.forgotLabel, { color: colors.textMuted }]}>Забыли пин-код?</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.bottom, { bottom: insets.bottom + 8 }]}>
          <View style={[styles.badge, { borderColor: colors.border, backgroundColor: 'rgba(6,10,14,0.45)' }]}>
            <Ionicons name="shield-checkmark-outline" size={13} color={colors.textSecondary} />
            <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: colors.textSecondary, marginLeft: 6 }}>
              Сессия сохранена
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  formBlock: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
  },
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  hint: {
    fontFamily: FONT.regular,
    fontSize: 13,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  /** Заглушка вместо клавиатуры, пока идёт вывод ключа. */
  busyBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    // Держим ту же высоту, что и клавиатура, чтобы карточка не скакала.
    height: 232,
  },
  bioBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 232,
    gap: Spacing.sm,
  },
  bioBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  bioHint: {
    fontFamily: FONT.regular,
    fontSize: 13,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: Spacing.md,
  },
  switchLabel: {
    fontFamily: FONT.medium,
    fontSize: 13.5,
  },
  forgotBtn: {
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  forgotLabel: {
    fontFamily: FONT.regular,
    fontSize: 12.5,
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
});