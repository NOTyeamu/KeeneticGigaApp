import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius } from '../theme/colors';

const ANIM_MS = 280;

/** Сколько раз прогонять текст через размытие: чем больше, тем нечитаемее. */
const BLUR_LAYERS = 3;
const BLUR_INTENSITY = 34;

interface HiddenValueProps {
  value: string;
  /** Подпись под скрытым значением. */
  hint?: string;
}

/**
 * Значение, скрытое размытием.
 *
 * Секрет рисуется трижды друг поверх друга: каждый слой размыт всё сильнее, а
 * сверху лежит лёгкая матовая плёнка. Одно размытие на Android часто не
 * скрывает короткий текст (буквы угадываются), поэтому слои накладываются:
 * после третьего прохода от букв остаётся ровное пятно, а не «звёздочки».
 *
 * Поверх размытия ничего не рисуется — только сама размытая плёнка, поэтому
 * никаких точек и символов, по которым можно было бы угадать содержимое.
 *
 * Касание — плёнка уезжает, значение проявляется. Долгое нажатие — копирует.
 */
export function HiddenValue({ value, hint }: HiddenValueProps) {
  const { colors, haptic } = useSettings();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const veil = useRef(new Animated.Value(1)).current;
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    Animated.timing(veil, {
      toValue: next ? 0 : 1,
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

  // Плёнка при проявлении чуть увеличивается — так уход читается как движение.
  const veilScale = veil.interpolate({ inputRange: [0, 1], outputRange: [1.03, 1] });

  return (
    <Pressable
      onPress={toggle}
      onLongPress={copy}
      delayLongPress={350}
      android_ripple={{ color: colors.accentSoft, borderless: false }}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={revealed ? 'Скрыть адрес роутера' : 'Показать адрес роутера'}
      accessibilityHint="Долгое нажатие копирует адрес"
    >
      <View style={styles.stack}>
        {/* Само значение — всегда на месте. Пока оно скрыто, его собственный
            текст смягчается (крупная тень + пониженная плотность): даже если
            размытие на устройстве не поддержано, буквы выглядят смазанными,
            а не чёткими. */}
        <Text
          style={[
            styles.value,
            { color: copied ? colors.online : colors.text },
            revealed
              ? null
              : {
                  color: copied ? colors.online : colors.textSecondary,
                  opacity: 0.75,
                  textShadowColor: colors.text,
                  textShadowRadius: 16,
                  textShadowOffset: { width: 0, height: 0 },
                },
          ]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {copied ? 'Скопировано ✓' : value}
        </Text>

        <Animated.View
          pointerEvents="none"
          style={[styles.veil, { opacity: veil, transform: [{ scaleX: veilScale }] }]}
        >
          {/* Слои размытия накрывают текст снизу: каждый следующий размывает
              результат предыдущего, поэтому буквы пропадают полностью. */}
          {Array.from({ length: BLUR_LAYERS }).map((_, i) => (
            <BlurView
              key={i}
              intensity={BLUR_INTENSITY - i * 6}
              tint={colors.bg === '#0A0F14' ? 'dark' : 'light'}
              experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
              style={StyleSheet.absoluteFill}
            />
          ))}
          {/* Мягкая матовая плёнка добирает остаток: она полупрозрачная, поэтому
              под ней видно размытое пятно, а не сплошной прямоугольник. */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.card, opacity: Platform.OS === 'android' ? 0.62 : 0.3 },
            ]}
          />
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
    justifyContent: 'center',
    minHeight: 22,
    overflow: 'hidden',
  },
  value: {
    fontFamily: FONT.medium,
    fontSize: 14,
  },
  veil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    borderRadius: Radius.xs,
    justifyContent: 'center',
  },
  hint: {
    fontFamily: FONT.regular,
    fontSize: 11,
    marginTop: 4,
  },
});