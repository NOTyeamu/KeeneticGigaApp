import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';
import { FONT, Radius } from '../theme/colors';

interface SearchBarProps {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, placeholder = 'Поиск по разделам' }: SearchBarProps) {
  const { colors } = useSettings();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
      <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={{ flex: 1, fontFamily: FONT.regular, fontSize: 15, color: colors.text, paddingHorizontal: 10 }}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 ? (
        <Ionicons name="close-circle" size={18} color={colors.textMuted} onPress={() => onChangeText('')} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
