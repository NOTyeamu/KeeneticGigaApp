import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../context/SettingsContext';
import { HomeScreen } from '../screens/HomeScreen';
import { SectionScreen } from '../screens/SectionScreen';
import { SettingsStack } from './SettingsStack';
import { GlowTabBar } from './GlowTabBar';

const Tab = createBottomTabNavigator();

export function MainTabs() {
  const { haptic } = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => <GlowTabBar {...props} />}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Главная' }}
        listeners={() => ({ tabPress: () => haptic() })}
      />
      <Tab.Screen
        name="Section"
        component={SectionScreen}
        options={{ tabBarLabel: 'Раздел' }}
        listeners={() => ({ tabPress: () => haptic() })}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={{ tabBarLabel: 'Настройки' }}
        listeners={() => ({ tabPress: () => haptic() })}
      />
    </Tab.Navigator>
  );
}
