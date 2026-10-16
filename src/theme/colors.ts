export type ThemeName = 'dark' | 'light';

export interface ThemeColors {
  bg: string;
  bgElevated: string;
  card: string;
  cardAlt: string;
  inputBg: string;
  accent: string;
  accentDim: string;
  accentSoft: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  divider: string;
  border: string;
  online: string;
  offline: string;
  danger: string;
  warn: string;
  tabInactive: string;
  tabActive: string;
  shadow: string;
}

export const darkColors: ThemeColors = {
  bg: '#0A0F14',
  bgElevated: '#0E1620',
  card: '#111A22',
  cardAlt: '#0F1A24',
  inputBg: '#0E1820',
  accent: '#00B4FF',
  accentDim: '#0E7AA8',
  accentSoft: 'rgba(0, 180, 255, 0.12)',
  text: '#E6F1F8',
  textSecondary: '#7B9AB0',
  textMuted: '#54657A',
  divider: '#1B2C3A',
  border: '#1B2C3A',
  online: '#34D399',
  offline: '#6B7A85',
  danger: '#FF5C5C',
  warn: '#F5A623',
  tabInactive: '#7B9AB0',
  tabActive: '#00B4FF',
  shadow: '#000000',
};

export const lightColors: ThemeColors = {
  bg: '#F2F5F8',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardAlt: '#F7FAFC',
  inputBg: '#FFFFFF',
  accent: '#00A6F0',
  accentDim: '#0E7AA8',
  accentSoft: 'rgba(0, 166, 240, 0.10)',
  text: '#0F1B24',
  textSecondary: '#5A7283',
  textMuted: '#8A9BAA',
  divider: '#E3E9EF',
  border: '#E3E9EF',
  online: '#16A34A',
  offline: '#9AA7B2',
  danger: '#E53E3E',
  warn: '#D97706',
  tabInactive: '#5A7283',
  tabActive: '#00A6F0',
  shadow: '#0F1B24',
};

export const Radius = { xs: 8, sm: 12, md: 16, lg: 20, xl: 28, pill: 999 };

export const Spacing = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 };

export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};
