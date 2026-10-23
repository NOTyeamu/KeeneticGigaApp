import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useAlert } from './AlertDialog';
import { PinDialog, type PinStep } from './PinDialog';
import { isSessionStorageAvailable } from '../lib/session';
import { FONT, Radius, Spacing } from '../theme/colors';

/**
 * Раздел настроек «Безопасность».
 *
 * Переключатель «Сохранение сессии»: пока он выключен, приложение не
 * запоминает вход и при каждом запуске спрашивает логин с паролем. Как
 * только пользователь включает сохранение, ему сразу предлагается придумать
 * пин-код — под ним и будут храниться данные роутера.
 *
 * Подпункты (отпечаток и смена пина) появляются только при включённом
 * сохранении: без него они бессмысленны.
 */

/** Какой диалог сейчас открыт. */
type Dialog = 'none' | 'create' | 'change';

/** Строка подпункта: иконка, подпись и необязательный значок справа. */
function SubRow({
  icon,
  active,
  title,
  trailing,
  onPress,
  dividerColor,
}: {
  icon: string;
  active?: boolean;
  title: string;
  trailing: React.ReactNode;
  onPress: () => void;
  dividerColor: string;
}) {
  const { colors } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.accentSoft }}
      style={[styles.subRow, { borderTopColor: dividerColor }]}
    >
      <View style={[styles.subIcon, { backgroundColor: colors.bgElevated }]}>
        <Ionicons name={icon as any} size={17} color={active ? colors.online : colors.textSecondary} />
      </View>
      <Text style={{ flex: 1, marginLeft: 10, fontFamily: FONT.medium, fontSize: 14, color: colors.text }}>
        {title}
      </Text>
      {trailing}
    </Pressable>
  );
}

export function SessionSection() {
  const { colors, haptic } = useSettings();
  const {
    persistenceEnabled,
    biometricEnabled,
    biometricAvailable,
    enablePersistence,
    changePin,
    enrollBiometrics,
    disableBiometrics,
    disablePersistence,
  } = useAuth();
  const alert = useAlert();

  const [dialog, setDialog] = useState<Dialog>('none');
  /** Есть ли на устройстве защищённое хранилище под сессию. */
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => {
    let alive = true;
    isSessionStorageAvailable().then((ok) => {
      if (alive) setStorageOk(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ── Раскрытие подпунктов ───────────────────────────────────
  // Тот же приём, что в SectionCard: высота анимируется.
  const reveal = useRef(new Animated.Value(persistenceEnabled ? 1 : 0)).current;
  /**
   * Настоящая высота подпунктов. Измеряем её, а не задаём числом: строки
   * разной высоты, а при увеличенном системном шрифте они растут — жёсткое
   * значение обрезало бы содержимое.
   */
  const [subHeightPx, setSubHeightPx] = useState(0);

  useEffect(() => {
    Animated.timing(reveal, {
      toValue: persistenceEnabled ? 1 : 0,
      duration: 240,
      useNativeDriver: false, // высота — не трансформация
    }).start();
  }, [persistenceEnabled, reveal]);

  const subHeight = reveal.interpolate({ inputRange: [0, 1], outputRange: [0, subHeightPx] });
  const subOpacity = reveal.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  // ── Включение и выключение ─────────────────────────────────
  const toggle = useCallback(
    (on: boolean) => {
      haptic();
      if (on) {
        if (!storageOk) {
          alert.show({
            title: 'Недоступно на этом устройстве',
            message: 'Защищённое хранилище недоступно, поэтому сохранить сессию не получится.',
            actions: [{ text: 'Понятно' }],
          });
          return;
        }
        setDialog('create');
        return;
      }

      alert.show({
        title: 'Выключить сохранение сессии?',
        message:
          'Сохранённый вход и пин-код будут стёрты. При следующем запуске приложение попросит логин и пароль.',
        destructive: true,
        actions: [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Выключить', style: 'destructive', onPress: () => void disablePersistence() },
        ],
      });
    },
    [haptic, storageOk, alert, disablePersistence],
  );

  // ── Шаги диалогов ──────────────────────────────────────────
  // Порядок шагов. Повтор проверяет сам диалог: шаг, помеченный `create`,
// автоматически делает следующий шаг своим подтверждением.
  const createSteps: PinStep[] = [
    { title: 'Придумайте пин-код', create: true },
    { title: 'Повторите пин-код' },
  ];

  const changeSteps: PinStep[] = [
    { title: 'Введите текущий пин-код' },
    { title: 'Придумайте новый пин-код', create: true },
    { title: 'Повторите новый пин-код' },
  ];

  /** Первый шаг — придуманный пин: он же нужен для проверки повтора. */
  const onDialogDone = async (values: string[]) => {
    if (dialog === 'create') {
      const [pin] = values;
      await enablePersistence(pin);
      setDialog('none');
      haptic(30);
      alert.show({
        title: 'Сохранение включено',
        message:
          'Теперь при запуске приложения достаточно ввести пин-код. При желании ниже можно добавить вход по отпечатку.',
        actions: [{ text: 'OK' }],
      });
      return;
    }

    if (dialog === 'change') {
      const [oldPin, newPin] = values;
      const ok = await changePin(oldPin, newPin);
      setDialog('none');
      if (ok) {
        haptic(30);
        alert.show({ title: 'Пин-код изменён', actions: [{ text: 'OK' }] });
      } else {
        alert.show({
          title: 'Текущий пин не подошёл',
          message: 'Пин-код остался прежним.',
          actions: [{ text: 'OK' }],
        });
      }
    }
  };

  const onDialogMismatch = (message: string) => {
    alert.show({ title: message, message: 'Попробуйте ещё раз.', actions: [{ text: 'OK' }] });
  };

  // ── Отпечаток ──────────────────────────────────────────────
  const onBiometrics = async () => {
    haptic();
    if (biometricEnabled) {
      alert.show({
        title: 'Отключить вход по отпечатку?',
        message: 'Пин-код продолжит работать.',
        destructive: true,
        actions: [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Отключить', style: 'destructive', onPress: () => void disableBiometrics() },
        ],
      });
      return;
    }

    if (!biometricAvailable) {
      alert.show({
        title: 'Отпечаток недоступен',
        message:
          'На устройстве нет сканера отпечатков или ни один отпечаток не добавлен в настройках системы. ' +
          'Добавьте отпечаток в настройках телефона и попробуйте снова.',
        actions: [{ text: 'Понятно' }],
      });
      return;
    }

    const ok = await enrollBiometrics();
    alert.show(
      ok
        ? { title: 'Отпечаток добавлен', message: 'Теперь входить можно отпечатком.', actions: [{ text: 'OK' }] }
        : { title: 'Не удалось добавить отпечаток', message: 'Попробуйте ещё раз.', actions: [{ text: 'OK' }] },
    );
  };

  return (
    <>
      <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={[styles.row, { borderBottomColor: persistenceEnabled ? colors.divider : 'transparent' }]}>
          <View style={[styles.iconBox, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.accent} />
          </View>
          <Text style={{ flex: 1, marginLeft: 12, fontFamily: FONT.medium, fontSize: 15, color: colors.text }}>
            Сохранение сессии
          </Text>
          <Switch
            value={persistenceEnabled}
            onValueChange={toggle}
            trackColor={{ false: colors.divider, true: colors.accent }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={colors.divider}
          />
        </View>

        {/*
          Подпункты: видны, только когда сохранение включено. Невидимая копия
          ниже служит только для измерения высоты — она не занимает места
          в разметке и не перехватывает нажатия.
        */}
        <Animated.View style={{ height: subHeight, opacity: subOpacity, overflow: 'hidden' }}>
          <View
            style={styles.measure}
            onLayout={(e) => setSubHeightPx(e.nativeEvent.layout.height)}
            pointerEvents="none"
          >
            <SubRow
              icon="finger-print-outline"
              title="Добавить отпечаток пальца"
              trailing={<Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
              onPress={() => {}}
              dividerColor={colors.divider}
            />
            <SubRow
              icon="keypad-outline"
              title="Изменить пин-код"
              trailing={<Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
              onPress={() => {}}
              dividerColor={colors.divider}
            />
          </View>

          <SubRow
            icon={biometricEnabled ? 'finger-print' : 'finger-print-outline'}
            active={biometricEnabled}
            title={biometricEnabled ? 'Отпечаток добавлен' : 'Добавить отпечаток пальца'}
            trailing={
              biometricEnabled ? (
                <Ionicons name="checkmark-circle" size={18} color={colors.online} />
              ) : (
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              )
            }
            onPress={onBiometrics}
            dividerColor={colors.divider}
          />

          <SubRow
            icon="keypad-outline"
            title="Изменить пин-код"
            trailing={<Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
            onPress={() => {
              haptic();
              setDialog('change');
            }}
            dividerColor={colors.divider}
          />
        </Animated.View>
      </View>

      <PinDialog
        visible={dialog !== 'none'}
        steps={dialog === 'change' ? changeSteps : createSteps}
        onCancel={() => setDialog('none')}
        onDone={onDialogDone}
        onMismatch={onDialogMismatch}
      />
    </>
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
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * Невидимая копия подпунктов. Лежит вне потока, чтобы не занимать место
   * и не ловить нажатия, — нужна только для измерения высоты.
   */
  measure: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0,
  },
});