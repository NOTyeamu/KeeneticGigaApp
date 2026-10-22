import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { PinDots } from './PinDots';
import { PinKeypad } from './PinKeypad';
import { PIN_LENGTH } from '../lib/session';
import { FONT, Radius, Spacing } from '../theme/colors';

/**
 * Окно для создания и смены пин-кода.
 *
 * Один и тот же экран обслуживает три случая, отличающиеся только набором
 * шагов: придумать пин (ввод + повтор), подтвердить старый и задать новый,
 * либо просто подтвердить. Порядок шагов задаётся вызывающей стороной.
 */

export type PinStep = {
  /** Подпись над точками. */
  title: string;
  /** Если задано — шаг считается подтверждением именно этого пина. */
  expect?: string;
  /**
   * Если true — шаг задаёт новый пин. Следующий шаг автоматически станет
   * его подтверждением, так что описывать пару вручную не нужно.
   */
  create?: boolean;
};

interface PinDialogProps {
  visible: boolean;
  steps: PinStep[];
  onCancel: () => void;
  /** Получает значения по шагам в том же порядке, что и steps. */
  onDone: (values: string[]) => void | Promise<void>;
  /** Вызывается, если шаг не совпал с ожидаемым. */
  onMismatch?: (message: string) => void;
}

export function PinDialog({ visible, steps, onCancel, onDone, onMismatch }: PinDialogProps) {
  const { colors, haptic } = useSettings();
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  // Каждое открытие начинается с первого шага.
  useEffect(() => {
    if (visible) {
      setStepIndex(0);
      setValues([]);
      setCurrent('');
      setError(false);
      setBusy(false);
    }
  }, [visible]);

  const step = steps[stepIndex];

  /**
   * Для шага-подтверждения ожидаемый пин берём не из описания, а из
   * предыдущего шага — тот, что был помечен `create`. Так вызывающей
   * стороне не нужно знать введённое значение заранее.
   */
  const expected = (() => {
    if (step?.expect !== undefined) return step.expect;
    const prev = steps[stepIndex - 1];
    if (prev?.create) return values[stepIndex - 1];
    return undefined;
  })();

  const fail = useCallback((message: string) => {
    haptic(60);
    setError(true);
    setCurrent('');
    onMismatch?.(message);
    setTimeout(() => setError(false), 600);
  }, [haptic, onMismatch]);

  /** Обрабатывает полностью введённый пин. */
  const complete = useCallback(
    async (value: string) => {
      if (!step) return;

      if (expected !== undefined && value !== expected) {
        fail('Пин-коды не совпали');
        return;
      }

      const nextValues = [...values, value];

      // Последний шаг — отдаём всё, что накопили.
      if (stepIndex >= steps.length - 1) {
        setBusy(true);
        try {
          await onDone(nextValues);
        } finally {
          setBusy(false);
        }
        return;
      }

      haptic(18);
      setValues(nextValues);
      setCurrent('');
      setStepIndex(stepIndex + 1);
    },
    [step, expected, values, stepIndex, steps.length, onDone, fail, haptic],
  );

  const onDigit = (digit: string) => {
    if (busy || current.length >= PIN_LENGTH) return;
    const next = current + digit;
    setCurrent(next);
    if (next.length === PIN_LENGTH) void complete(next);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.text }]}>{step?.title ?? ''}</Text>

          {/* Точки шагов: видно, сколько осталось. */}
          {steps.length > 1 ? (
            <View style={styles.stepRow}>
              {steps.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.stepDot,
                    { backgroundColor: i <= stepIndex ? colors.accent : colors.divider },
                  ]}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.dotsWrap}>
            <PinDots filled={current.length} error={error} />
          </View>

          <PinKeypad
            onDigit={onDigit}
            onDelete={() => !busy && setCurrent((p) => p.slice(0, -1))}
            disabled={busy}
          />

          <Pressable onPress={onCancel} hitSlop={8} style={styles.cancelBtn}>
            <Text style={[styles.cancelLabel, { color: colors.textMuted }]}>Отмена</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontFamily: FONT.semiBold,
    fontSize: 16,
    textAlign: 'center',
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.sm,
  },
  stepDot: {
    width: 22,
    height: 3,
    borderRadius: 2,
  },
  dotsWrap: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  cancelLabel: {
    fontFamily: FONT.regular,
    fontSize: 13,
  },
});