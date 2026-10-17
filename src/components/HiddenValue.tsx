import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type View as ViewType,
} from 'react-native';
import { BlurView, BlurTargetView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius } from '../theme/colors';

const ANIM_MS = 300;
/** Ядро размытия по умолчанию: заметно, но адрес под ним не читается. */
const BLUR_INTENSITY = 58;

interface HiddenValueProps {
  value: string;
  hint?: string;
}

/**
 * Адрес роутера, скрытый настоящим размытием (backdrop-blur).
 *
 * Размывается не сам элемент, а то, что находится ЗА ним — как в iOS и
 * Telegram. Для этого окружение помечается `BlurTargetView`, а наложение
 * ссылается на него через `blurTarget`; на Android используется реализация
 * Dimezis/BlurView. Без ссылки на цель размытие молча отключается, поэтому
 * она здесь обязательна.
 *
 * При касании размытие плавно «сходит»: сила уменьшается до нуля, наложение
 * уезжает и растворяется, а сам адрес проявляется. Долгое нажатие копирует
 * адрес, не раскрывая его.
 */
export function HiddenValue({ value, hint }: HiddenValueProps) {
  const { colors, haptic } = useSettings();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const targetRef = useRef<ViewType>(null);
  const reveal = useRef(new Animated.Value(0)).current;
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDark = colors.bg === '#0A0F14';

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const toggle = () => {
    haptic();
    const next = !revealed;
    setRevealed(next);
    Animated.timing(reveal, {
      toValue: next ? 1 : 0,
      duration: ANIM_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(value);
    } catch {
      return;
    }
    haptic(18);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1200);
  };

  // Пока скрыто — размытие сильное; при раскрытии оно уходит в ноль.
  const veilOpacity = reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const veilScale = reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const textOpacity = reveal.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] });

  // Радиус размытия ведём по кадрам вместе с анимацией раскрытия: подписка на
  // значение даёт шаги, а состояние перерисовывает само размытие. Так блюр
  // именно «сходит», а не исчезает рывком.
  const [blurIntensity, setBlurIntensity] = useState(BLUR_INTENSITY);
  useEffect(() => {
    const id = reveal.addListener(({ value }) => {
      setBlurIntensity(Math.max(0, Math.round(BLUR_INTENSITY * (1 - value))));
    });
    return () => reveal.removeListener(id);
  }, [reveal]);

  return (
    <Pressable
      onPress={toggle}
      onLongPress={copy}
      delayLongPress={350}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={revealed ? 'Скрыть адрес роутера' : 'Показать адрес роутера'}
      accessibilityHint="Долгое нажатие копирует адрес"
    >
      <View style={styles.stack}>
        {/* Слой, который размывается: сам адрес. */}
        <BlurTargetView ref={targetRef} style={styles.stack}>
          <Animated.View style={{ opacity: textOpacity }}>
            <Text
              style={[styles.value, { color: copied ? colors.online : colors.text }]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {copied ? 'Скопировано ✓' : value}
            </Text>
          </Animated.View>
        </BlurTargetView>

        {/* Наложение: размывает слой под собой и уезжает при раскрытии. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.veil, { opacity: veilOpacity, transform: [{ scaleX: veilScale }] }]}
        >
          <BlurView
            blurTarget={targetRef}
            intensity={blurIntensity}
            tint={isDark ? 'dark' : 'light'}
            blurMethod={Platform.OS === 'android' ? 'dimezisBlurViewSdk31Plus' : undefined}
            style={StyleSheet.absoluteFill}
          />
          {/* Лёгкая вуаль в тон карточки: размытие остаётся размытием, но
              адрес не просвечивает даже на слабом размытии. */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.card, opacity: isDark ? 0.42 : 0.5 },
            ]}
          />
          <View style={styles.veilLabel}>
            <Ionicons name="eye-off-outline" size={13} color={colors.textSecondary} />
            <Text style={[styles.veilLabelText, { color: colors.textSecondary }]}>Размыто</Text>
          </View>
        </Animated.View>
      </View>

      {hint ? (
        <Text style={[styles.hint, { color: colors.textMuted }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.sm,
    paddingVertical: 2,
  },
  stack: {
    height: 34,
    justifyContent: 'center',
  },
  value: {
    fontFamily: FONT.medium,
    fontSize: 14,
    paddingHorizontal: 2,
  },
  veil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 34,
    overflow: 'hidden',
    borderRadius: Radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  veilLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  veilLabelText: {
    fontFamily: FONT.medium,
    fontSize: 11.5,
    letterSpacing: 0.4,
  },
  hint: {
    fontFamily: FONT.regular,
    fontSize: 11,
    marginTop: 4,
  },
});