import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius, Spacing } from '../theme/colors';

/**
 * Элементы форм в стиле веб-интерфейса KeeneticOS: поля с «плавающей»
 * подписью внутри рамки, выпадающие списки и кнопки. Используются страницами
 * настроек подключений (Ethernet, Mobile и т.п.).
 */

export function FieldLabel({ children }: { children: React.ReactNode }) {
  const { colors } = useSettings();
  return (
    <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>
      {children}
    </Text>
  );
}

/** Поле ввода, повторяющее вид поля веб-интерфейса (подпись — сверху в рамке). */
export function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  editable = true,
  keyboardType,
  autoCapitalize = 'none',
}: {
  label?: string;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  editable?: boolean;
  keyboardType?: 'default' | 'numeric' | 'url' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
}) {
  const { colors } = useSettings();
  return (
    <View
      style={[
        styles.fieldBox,
        { backgroundColor: colors.inputBg, borderColor: colors.border, opacity: editable ? 1 : 0.55 },
      ]}
    >
      {label ? (
        <Text style={[styles.floatLabel, { color: colors.textMuted, backgroundColor: colors.inputBg }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        editable={editable}
        keyboardType={keyboardType === 'url' ? 'url' : keyboardType === 'numeric' ? 'numeric' : 'default'}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={{ flex: 1, fontFamily: FONT.regular, fontSize: 14, color: colors.text, paddingHorizontal: 12 }}
      />
    </View>
  );
}

/** Выпадающий список: касание открывает выбор через переданный обработчик. */
export function SelectField({
  label,
  value,
  disabled,
  onPress,
}: {
  label?: string;
  value: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const { colors, haptic } = useSettings();
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptic();
        onPress?.();
      }}
      disabled={disabled || !onPress}
      android_ripple={{ color: colors.accentSoft }}
      style={[
        styles.fieldBox,
        { backgroundColor: colors.inputBg, borderColor: colors.border, opacity: disabled ? 0.55 : 1 },
      ]}
    >
      {label ? (
        <Text style={[styles.floatLabel, { color: colors.textMuted, backgroundColor: colors.inputBg }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
        <Text style={{ flex: 1, fontFamily: FONT.regular, fontSize: 14, color: colors.text }} numberOfLines={1}>
          {value}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

/** Чекбокс со строкой (например, «Игнорировать DNSv4 интернет-провайдера»). */
export function CheckboxRow({
  label,
  checked,
  onToggle,
  disabled,
}: {
  label: string;
  checked: boolean;
  onToggle?: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { colors, haptic } = useSettings();
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptic();
        onToggle?.(!checked);
      }}
      disabled={disabled || !onToggle}
      style={({ pressed }) => [styles.checkRow, pressed && { opacity: 0.8 }]}
    >
      <View
        style={[
          styles.checkBox,
          {
            backgroundColor: checked ? colors.accent : 'transparent',
            borderColor: checked ? colors.accent : colors.textMuted,
          },
        ]}
      >
        {checked ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
      </View>
      <Text style={{ flex: 1, marginLeft: 10, fontFamily: FONT.regular, fontSize: 13, color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

/** Кнопка действия в стиле веб-интерфейса (контурная либо акцентная). */
export function ActionButton({
  label,
  icon,
  onPress,
  variant = 'outline',
  disabled,
  style,
}: {
  label: string;
  icon?: string;
  onPress?: () => void;
  variant?: 'outline' | 'accent' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, haptic } = useSettings();
  const color = variant === 'accent' ? colors.accent : variant === 'danger' ? colors.danger : colors.text;
  const border = variant === 'accent' ? colors.accent : variant === 'danger' ? colors.danger : colors.border;
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptic();
        onPress?.();
      }}
      disabled={disabled}
      android_ripple={{ color: colors.accentSoft }}
      style={({ pressed }) => [
        styles.actionBtn,
        {
          backgroundColor: variant === 'accent' ? colors.accent : colors.card,
          borderColor: border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon as any} size={16} color={variant === 'accent' ? '#FFFFFF' : color} /> : null}
      <Text
        style={{
          fontFamily: FONT.medium,
          fontSize: 14,
          color: variant === 'accent' ? '#FFFFFF' : color,
          marginLeft: icon ? 8 : 0,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Заголовок раздела внутри страницы (как «Порты и VLAN'ы» в вебе). */
export function FormSectionTitle({ children }: { children: React.ReactNode }) {
  const { colors } = useSettings();
  return (
    <Text
      style={{
        fontFamily: FONT.semiBold,
        fontSize: 16,
        color: colors.text,
        marginTop: Spacing.md,
        marginBottom: Spacing.xs,
      }}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
  },
  floatLabel: {
    position: 'absolute',
    top: -8,
    left: 10,
    paddingHorizontal: 4,
    fontFamily: FONT.regular,
    fontSize: 11,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
});