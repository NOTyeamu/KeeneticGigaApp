import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Storage } from '../lib/storage';
import { darkColors, lightColors, type ThemeColors, type ThemeName } from '../theme/colors';
import { Vibration } from 'react-native';
import { loadBaseUrl } from '../lib/api';

export type Language = 'ru' | 'en';

interface SettingsContextValue {
  theme: ThemeName;
  colors: ThemeColors;
  language: Language;
  vibration: boolean;
  setTheme: (t: ThemeName) => Promise<void>;
  setLanguage: (l: Language) => Promise<void>;
  setVibration: (v: boolean) => Promise<void>;
  haptic: (ms?: number) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('dark');
  const [language, setLanguageState] = useState<Language>('ru');
  const [vibration, setVibrationState] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await Storage.getTheme();
      if (t === 'light' || t === 'dark') setThemeState(t);
      const l = await Storage.getLanguage();
      if (l === 'en' || l === 'ru') setLanguageState(l);
      const v = await Storage.getVibration();
      if (v !== null) setVibrationState(v);
      await loadBaseUrl();
    })();
  }, []);

  const setTheme = useCallback(async (t: ThemeName) => {
    setThemeState(t);
    await Storage.setTheme(t);
  }, []);

  const setLanguage = useCallback(async (l: Language) => {
    setLanguageState(l);
    await Storage.setLanguage(l);
  }, []);

  const setVibration = useCallback(async (v: boolean) => {
    setVibrationState(v);
    await Storage.setVibration(v);
  }, []);

  const haptic = useCallback(
    (ms = 12) => {
      if (vibration) Vibration.vibrate(ms);
    },
    [vibration],
  );

  const colors = theme === 'light' ? lightColors : darkColors;

  const value = useMemo<SettingsContextValue>(
    () => ({ theme, colors, language, vibration, setTheme, setLanguage, setVibration, haptic }),
    [theme, colors, language, vibration, setTheme, setLanguage, setVibration, haptic],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
