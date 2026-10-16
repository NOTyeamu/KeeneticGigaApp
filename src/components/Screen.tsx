import { ScrollView, View, type ViewStyle, type StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  padded?: boolean;
}

export function Screen({ children, scroll = true, style, contentContainerStyle, padded = true }: ScreenProps) {
  const { colors } = useSettings();
  const insets = useSafeAreaInsets();

  const baseStyle: ViewStyle = {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: insets.top + 8,
  };
  const contentStyle: ViewStyle = {
    paddingHorizontal: padded ? 16 : 0,
    paddingBottom: insets.bottom + 24,
  };

  if (scroll) {
    return (
      <ScrollView
        style={[baseStyle, style]}
        contentContainerStyle={[contentStyle, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[baseStyle, style]}>
      <View style={[contentStyle, contentContainerStyle]}>{children}</View>
    </View>
  );
}
