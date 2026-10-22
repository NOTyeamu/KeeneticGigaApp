import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { PIN_LENGTH } from '../lib/session';

/**
 * Индикатор введённых цифр пина.
 *
 * Заполненные точки — введённые цифры. При ошибке индикатор коротко
 * вздрагивает и краснеет: так понятно, что пин не подошёл, даже если
 * сообщение об ошибке не прочитано.
 */
export function PinDots({ filled, error = false }: { filled: number; error?: boolean }) {
  const { colors } = useSettings();
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!error) return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [error, shake]);

  /** Сдвиг на несколько пикселей — «вздрагивание» при неверном пине. */
  const translateX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });

  const dotColor = (i: number) => {
    if (error) return colors.danger;
    return i < filled ? colors.accent : colors.divider;
  };

  return (
    <Animated.View style={[styles.row, { transform: [{ translateX }] }]}>
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: dotColor(i),
              // Заполненная точка чуть крупнее — видно, сколько введено.
              transform: [{ scale: i < filled ? 1.12 : 1 }],
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
});