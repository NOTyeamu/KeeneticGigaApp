import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme, type Theme as NavTheme } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { LoginScreen } from '../screens/LoginScreen';
import { MainTabs } from './MainTabs';
import { PageProvider } from '../context/PageContext';
import { AlertProvider } from '../components/AlertDialog';

export function RootNavigator() {
  const { credentials, ready } = useAuth();
  const { colors, theme } = useSettings();

  const navTheme: NavTheme = {
    ...(theme === 'light' ? DefaultTheme : DarkTheme),
    dark: theme === 'dark',
    colors: {
      primary: colors.accent,
      background: colors.bg,
      card: colors.bgElevated,
      text: colors.text,
      border: colors.divider,
      notification: colors.danger,
    },
    fonts: {
      regular: { fontFamily: 'Inter_400Regular', fontWeight: '400' as const },
      medium: { fontFamily: 'Inter_500Medium', fontWeight: '500' as const },
      bold: { fontFamily: 'Inter_700Bold', fontWeight: '700' as const },
      heavy: { fontFamily: 'Inter_700Bold', fontWeight: '700' as const },
    },
  };

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <AlertProvider>
        {credentials ? (
          <PageProvider>
            <MainTabs />
          </PageProvider>
        ) : (
          <LoginScreen />
        )}
      </AlertProvider>
    </NavigationContainer>
  );
}
