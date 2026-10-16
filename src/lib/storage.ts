import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  credentials: '@keenetic/credentials',
  language: '@keenetic/language',
  theme: '@keenetic/theme',
  vibration: '@keenetic/vibration',
  onboardingDone: '@keenetic/onboarding',
  baseUrl: '@keenetic/baseUrl',
} as const;

export const Storage = {
  async getCredentials(): Promise<{ user: string; pass: string } | null> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.credentials);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  async setCredentials(creds: { user: string; pass: string }): Promise<void> {
    await AsyncStorage.setItem(KEYS.credentials, JSON.stringify(creds));
  },
  async clearCredentials(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.credentials);
  },

  async getLanguage(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.language);
  },
  async setLanguage(v: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.language, v);
  },

  async getTheme(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.theme);
  },
  async setTheme(v: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.theme, v);
  },

  async getVibration(): Promise<boolean | null> {
    const v = await AsyncStorage.getItem(KEYS.vibration);
    return v === null ? null : v === 'true';
  },
  async setVibration(v: boolean): Promise<void> {
    await AsyncStorage.setItem(KEYS.vibration, String(v));
  },

  async getBaseUrl(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.baseUrl);
  },
  async setBaseUrl(v: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.baseUrl, v);
  },
};
