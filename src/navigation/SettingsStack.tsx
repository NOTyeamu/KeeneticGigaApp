import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSettings } from '../context/SettingsContext';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SettingsPageScreen, type SettingsPageParams } from '../screens/SettingsPageScreen';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  SettingsPage: SettingsPageParams;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

/**
 * Собственный стек вкладки «Настройки»: страницы, открытые из настроек,
 * показываются здесь же и не переключают пользователя на вкладку «Раздел».
 */
export function SettingsStack() {
  const { colors } = useSettings();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="SettingsHome" component={SettingsScreen} />
      <Stack.Screen name="SettingsPage" component={SettingsPageScreen} />
    </Stack.Navigator>
  );
}