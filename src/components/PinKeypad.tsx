import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius, Spacing } from '../theme/colors';

/**
 * Цифровая клавиатура для ввода пина.
 *
 * Своя, а не системная: системная всплывает снизу и перекрывает экран,
 * а здесь важно видеть точки и подсказку. Кнопки крупные — по ним удобно
 * попадать одной рукой.
 */

const KEYS: (string | null)[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', 'del'];

export function PinKeypad({
  onDigit,
  onDelete,
  disabled = false,
}: {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const { colors, haptic } = useSettings();

  return (
    <View style={styles.grid}>
      {KEYS.map((key, i) => {
        // Пустая клетка в сетке: цифры стоят как на телефоне, ноль по центру.
        if (key === null) return <View key={`gap-${i}`} style={styles.cell} />;

        const isDelete = key === 'del';
        return (
          <Pressable
            key={key}
            disabled={disabled}
            onPress={() => {
              if (disabled) return;
              haptic(12);
              if (isDelete) onDelete();
              else onDigit(key);
            }}
            android_ripple={{ color: colors.accentSoft, borderless: false }}
            style={({ pressed }) => [
              styles.cell,
              styles.key,
              { backgroundColor: pressed ? colors.accentSoft : 'transparent' },
              disabled && { opacity: 0.4 },
            ]}
          >
            {isDelete ? (
              <Ionicons name="backspace-outline" size={24} color={colors.textSecondary} />
            ) : (
              <Text style={[styles.keyLabel, { color: colors.text }]}>{key}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  cell: {
    // Треть ширины — получается сетка три на четыре.
    width: '33.333%',
    aspectRatio: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  key: {
    borderRadius: Radius.md,
  },
  keyLabel: {
    fontFamily: FONT.medium,
    fontSize: 26,
  },
});