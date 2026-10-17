import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius, Spacing } from '../theme/colors';

/**
 * Компактный индикатор загрузки: круг с процентом, мягкая подсветка и полоса
 * загрузки с бегущим блеском. Пока размер файла неизвестен, круг вращается —
 * так видно, что загрузка идёт, а не зависла.
 */
export function UpdateProgress({
  progress,
  written,
  total,
  label,
}: {
  /** 0…1 либо null, если размер неизвестен. */
  progress: number | null;
  written: number;
  total: number;
  label: string;
}) {
  const { colors } = useSettings();
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  const known = progress != null && total > 0;
  const pct = known ? Math.round((progress as number) * 100) : null;

  // Вращение кольца, пока доля неизвестна.
  useEffect(() => {
    if (known) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [known, spin]);

  // «Дыхание» подсветки под кругом.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Блеск, бегущий по полосе загрузки.
  useEffect(() => {
    shimmer.setValue(0);
    const loop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.3] });
  const shineX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-90, 260] });

  const writtenMb = (written / (1024 * 1024)).toFixed(1).replace('.', ',');
  const totalMb = total > 0 ? (total / (1024 * 1024)).toFixed(1).replace('.', ',') : null;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
      <View style={styles.head}>
        <View style={styles.ringWrap}>
          <Animated.View
            style={[styles.glow, { backgroundColor: colors.accent, opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
          />
          <View style={[styles.ring, { borderColor: colors.divider }]} />
          {!known ? (
            <Animated.View
              style={[
                styles.ring,
                { borderColor: 'transparent', borderTopColor: colors.accent, transform: [{ rotate: rotation }] },
              ]}
            />
          ) : (
            <View style={[styles.ring, { borderColor: colors.accent }]} />
          )}
          <Text style={{ fontFamily: FONT.bold, fontSize: 14, color: colors.text }}>
            {pct != null ? `${pct}%` : '…'}
          </Text>
        </View>

        <View style={{ flex: 1, marginLeft: Spacing.sm }}>
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: colors.text }} numberOfLines={1}>
            {label}
          </Text>
          <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
            {totalMb ? `${writtenMb} из ${totalMb} МБ` : `Скачано ${writtenMb} МБ`}
          </Text>
        </View>
      </View>

      <View style={[styles.barTrack, { backgroundColor: colors.divider }]}>
        <View style={[styles.barFill, { width: known ? `${Math.max(3, pct ?? 0)}%` : '35%' }]}>
          <LinearGradient
            colors={[colors.accentDim, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View style={[styles.barShine, { transform: [{ translateX: shineX }] }]}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.55)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const RING = 46;

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ringWrap: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: RING * 0.78,
    height: RING * 0.78,
    borderRadius: RING,
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING,
    borderWidth: 3,
  },
  barTrack: {
    width: '100%',
    height: 5,
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  barShine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 90,
  },
});