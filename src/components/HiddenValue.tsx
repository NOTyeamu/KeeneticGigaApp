import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius } from '../theme/colors';

const ANIM_MS = 260;

interface HiddenValueProps {
  value: string;
  /** Подпись под скрытым значением (например, «Нажмите, чтобы показать»). */
  hint?: string;
}

/**
 * Значение, скрытое анимированным блюром.
 *
 * - по умолчанию значение размыто и нечитаемо;
 * - касание — блюр плавно исчезает, значение проявляется; повторное касание
 *   возвращает блюр;
 * - долгое нажатие — значение копируется в буфер обмена.
 *
 * На Android настоящий блюр есть не на всех прошивках, поэтому поверх него
 * всегда лежит полупрозрачная подложка: даже без размытия прочитать адрес
 * невозможно.
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

  const scale = veil.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1] });

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
        {/* Настоящее значение — всегда на месте, поверх него лежит блюр. */}
        <Text
          style={[styles.value, { color: copied ? colors.online : colors.text }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {copied ? 'Скопировано ✓' : value}
        </Text>

        <Animated.View
          pointerEvents="none"
          style={[styles.veil, { opacity: veil, transform: [{ scale }] }]}
        >
          <BlurView
            intensity={Platform.OS === 'android' ? 60 : 40}
            tint={colors.bg === '#0A0F14' ? 'dark' : 'light'}
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            style={StyleSheet.absoluteFill}
          />
          {/* Подложка гарантирует нечитаемость даже там, где блюр не поддержан. */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card, opacity: 0.72 }]} />
          <Text style={[styles.veilText, { color: colors.textSecondary }]} numberOfLines={1}>
            ••••••••••••••••
          </Text>
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
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  veilText: {
    fontFamily: FONT.semiBold,
    fontSize: 14,
    letterSpacing: 1.5,
    paddingHorizontal: 2,
  },
  hint: {
    fontFamily: FONT.regular,
    fontSize: 11,
    marginTop: 4,
  },
});