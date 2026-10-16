import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius, Spacing } from '../theme/colors';

export interface DialogAction {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface ChoiceOption {
  text: string;
  value: string;
  onPress?: () => void;
}

interface ShowOptions {
  title?: string;
  message?: string;
  options?: ChoiceOption[];
  actions?: DialogAction[];
  /** Destructive look for a single primary action (e.g. logout). */
  destructive?: boolean;
}

interface AlertContextValue {
  show: (opts: ShowOptions) => void;
  dismiss: () => void;
}

const AlertContext = createContext<AlertContextValue | undefined>(undefined);

const ANIM_DURATION = 200;

export function AlertProvider({ children }: { children: ReactNode }) {
  const { colors, haptic } = useSettings();
  const [visible, setVisible] = useState(false);
  const [opts, setOpts] = useState<ShowOptions | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 0,
        duration: ANIM_DURATION,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.94,
        duration: ANIM_DURATION,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setOpts(null);
    });
  }, [fade, scale]);

  const show = useCallback(
    (next: ShowOptions) => {
      haptic(10);
      setOpts(next);
      setVisible(true);
      fade.setValue(0);
      scale.setValue(0.94);
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: ANIM_DURATION,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: ANIM_DURATION,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    },
    [fade, scale, haptic],
  );

  const runAction = (action?: DialogAction) => {
    dismiss();
    if (action?.onPress) action.onPress();
  };

  const runChoice = (opt?: ChoiceOption) => {
    dismiss();
    if (opt?.onPress) opt.onPress();
  };

  const safeTitle = opts?.title;
  const maxActions = opts?.actions?.length ?? 0;
  const actionsRow = maxActions > 2;

  return (
    <AlertContext.Provider value={{ show, dismiss }}>
      {children}
      <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
        <View style={[styles.overlay, { backgroundColor: colors.shadow }]}>
          {/* tap outside to dismiss — sits behind the card */}
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
          <Animated.View
            style={{
              opacity: fade,
              transform: [{ scale }],
              width: '100%',
              alignItems: 'center',
            }}
          >
            <Pressable
              style={[
                styles.card,
                {
                  backgroundColor: colors.bgElevated,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              {safeTitle ? (
                <Text style={[styles.title, { color: colors.text }]}>{safeTitle}</Text>
              ) : null}

              {opts?.message ? (
                <Text style={[styles.message, { color: colors.textSecondary }]}>{opts.message}</Text>
              ) : null}

              {opts?.options && opts.options.length > 0 ? (
                <View style={[styles.optionsWrap, { borderColor: colors.divider }]}>
                  {opts.options.map((o, i) => (
                    <Pressable
                      key={o.value}
                      onPress={() => runChoice(o)}
                      android_ripple={{ color: colors.accentSoft }}
                      style={({ pressed }) => [
                        styles.optionRow,
                        pressed && { opacity: 0.7 },
                        i < opts.options!.length - 1
                          ? { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth }
                          : null,
                      ]}
                    >
                      <Text
                        style={[styles.optionText, { color: o.value === 'cancel' ? colors.textMuted : colors.text }]}
                      >
                        {o.text}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {opts?.actions && opts.actions.length > 0 ? (
                <View style={[styles.actions, actionsRow ? { flexDirection: 'column' } : null]}>
                  {opts.actions.map((a) => {
                    const isDestructive =
                      a.style === 'destructive' || (opts.destructive && a.style !== 'cancel');
                    const isCancel = a.style === 'cancel';
                    const filled = (opts.actions?.length ?? 0) === 1 && !isCancel;
                    return (
                      <Pressable
                        key={a.text}
                        onPress={() => runAction(a)}
                        android_ripple={{
                          color: isDestructive ? 'rgba(255,92,92,0.14)' : colors.accentSoft,
                        }}
                        style={({ pressed }) => [
                          styles.actionBtn,
                          filled && { backgroundColor: colors.accent },
                          isDestructive && { borderColor: colors.danger },
                          isCancel && { borderColor: colors.border },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.actionLabel,
                            filled ? { color: '#FFFFFF' } : { color: isDestructive ? colors.danger : colors.text },
                          ]}
                        >
                          {a.text}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </AlertContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  title: {
    fontFamily: FONT.semiBold,
    fontSize: 17,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  message: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  optionsWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    overflow: 'hidden',
    width: '100%',
    marginVertical: 6,
  },
  optionRow: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontFamily: FONT.medium,
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: {
    fontFamily: FONT.semiBold,
    fontSize: 15,
  },
});

export function useAlert(): AlertContextValue {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlert must be used within AlertProvider');
  return ctx;
}

// Convenience helpers hook for common dialog shapes.
export function useAlertDialog() {
  const { show, dismiss } = useAlert();
  const confirm = useCallback(
    (title: string, message: string, onConfirm: () => void, opts?: { confirmText?: string; destructive?: boolean }) => {
      show({
        title,
        message,
        destructive: opts?.destructive,
        actions: [
          { text: 'Отмена', style: 'cancel', onPress: () => {} },
          {
            text: opts?.confirmText ?? 'OK',
            onPress: onConfirm,
            style: opts?.destructive ? 'destructive' : 'default',
          },
        ],
      });
    },
    [show],
  );
  return { show, dismiss, confirm };
}
