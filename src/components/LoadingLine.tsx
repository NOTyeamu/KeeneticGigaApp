import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius, Spacing } from '../theme/colors';

/**
 * Ожидание вывода ключа из пин-кода.
 *
 * Крутящийся кружок здесь не подходит: он ничего не говорит о происходящем
 * и выбивается из оформления. Вместо него — бегущие импульсы в линию, как
 * сигнал по кабелю: три точки проходят слева направо одна за другой.
 *
 * Смысл тот же, что у индикатора, но читается как часть приложения,
 * а не как системная заглушка.
 */

/** Сколько точек бежит и через сколько одна сменяет другую. */
const DOTS = 3;
const STEP_MS = 260;
const CYCLE_MS = STEP_MS * DOTS;

export function LoadingLine({ label }: { label?: string }) {
  const { colors } = useSettings();

  /** Прогресс цикла 0…1, общий для всех точек. */
  const cycle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    cycle.setValue(0);
    const loop = Animated.loop(
      Animated.timing(cycle, {
        toValue: 1,
        duration: CYCLE_MS,
        easing: Easing.linear,
        useNativeDriver: false, // прозрачность каждой точки считается отдельно
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [cycle]);

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        {/* Линия-«кабель», по которой бегут импульсы. */}
        <View style={[styles.line, { backgroundColor: colors.divider }]} />

        {Array.from({ length: DOTS }, (_, i) => {
          // Каждая точка смещена по циклу — получается бегущая волна.
          const offset = i / DOTS;
          const phase = cycle.interpolate({
            inputRange: [0, 1],
            outputRange: [(offset + 1) % 1, (offset + 1) % 1 + 1],
          });

          // Точка проходит путь слева направо и появляется/исчезает на краях.
          const translateX = phase.interpolate({
            inputRange: [0, 0.15, 0.85, 1],
            outputRange: [-46, -34, 34, 46],
          });
          const opacity = phase.interpolate({
            inputRange: [0, 0.15, 0.85, 1],
            outputRange: [0, 1, 1, 0],
          });
          const scale = phase.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0.7, 1.15, 0.7],
          });

          return (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: colors.accent,
                  opacity,
                  transform: [{ translateX }, { scale }],
                },
              ]}
            />
          );
        })}
      </View>

      {label ? <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  track: {
    width: 96,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },
  dot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontFamily: FONT.regular,
    fontSize: 13,
  },
});