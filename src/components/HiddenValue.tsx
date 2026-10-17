import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius } from '../theme/colors';

const ANIM_MS = 320;
const SHINE_MS = 2400;

interface HiddenValueProps {
  value: string;
  hint?: string;
}

/**
 * Значение, скрытое под синей переливающейся панелью.
 *
 * Пока адрес скрыт, его текста в разметке нет вообще: вместо него рисуется
 * панель с синим градиентом и бегущим блеском, поэтому подсмотреть нечего —
 * даже если размытие на устройстве не сработает. Касание убирает панель и
 * показывает адрес, повторное касание возвращает её обратно.
 *
 * Долгое нажатие копирует адрес, не раскрывая его на экране.
 */
export function HiddenValue({ value, hint }: HiddenValueProps) {
  const { colors, haptic } = useSettings();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState(0);

  // 0 — панель на месте, 1 — адрес раскрыт.
  const reveal = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDark = colors.bg === '#0A0F14';

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  // Блеск бежит по панели, пока адрес скрыт.
  useEffect(() => {
    if (revealed) return;
    shine.setValue(0);
    const loop = Animated.loop(
      Animated.timing(shine, {
        toValue: 1,
        duration: SHINE_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [revealed, shine]);

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

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - width) > 0.5) setWidth(w);
  };

  const veilOpacity = reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const textOpacity = reveal.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, 1] });
  // Панель чуть разъезжается при раскрытии — уход читается как движение.
  const veilScale = reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  const travel = width > 0 ? width : 240;
  const shineX = shine.interpolate({ inputRange: [0, 1], outputRange: [-travel, travel] });

  // Глубокий синий по краям и акцент приложения в середине — панель выглядит
  // частью интерфейса, а не заглушкой.
  const gradColors: readonly [string, string, ...string[]] = isDark
    ? ['#062A44', colors.accent, '#062A44']
    : ['#BFE6FF', colors.accent, '#BFE6FF'];
  const shineColors: readonly [string, string, ...string[]] = [
    'transparent',
    isDark ? 'rgba(180, 230, 255, 0.55)' : 'rgba(255, 255, 255, 0.75)',
    'transparent',
  ];

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
      <View style={styles.stack} onLayout={onLayout}>
        {/* Адрес существует в разметке только когда раскрыт. */}
        <Animated.View style={{ opacity: textOpacity }}>
          <Text
            style={[styles.value, { color: copied ? colors.online : colors.text }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {copied ? 'Скопировано ✓' : value}
          </Text>
        </Animated.View>

        {/* Панель: ни адреса, ни намёка на него внутри нет. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.veil, { opacity: veilOpacity, transform: [{ scaleX: veilScale }] }]}
        >
          <LinearGradient
            colors={gradColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Бегущий блеск — панель «переливается». */}
          <Animated.View style={[styles.shine, { transform: [{ translateX: shineX }] }]}>
            <LinearGradient
              colors={shineColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          {/* Мягкость поверх градиента; там, где размытие не поддержано,
              панель всё равно непрозрачная и ничего не выдаёт. */}
          <BlurView
            intensity={Platform.OS === 'android' ? 26 : 18}
            tint="dark"
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.veilLabel}>
            <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.95)" />
            <Text style={styles.veilLabelText}>Скрыто</Text>
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
  shine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 120,
  },
  veilLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  veilLabelText: {
    fontFamily: FONT.medium,
    fontSize: 12,
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.95)',
  },
  hint: {
    fontFamily: FONT.regular,
    fontSize: 11,
    marginTop: 4,
  },
});