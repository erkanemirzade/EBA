export const colors = {
  light: {
    surface: '#FFFFFF',
    onSurface: '#101828',
    surfaceSecondary: '#F9FAFB',
    onSurfaceSecondary: '#344054',
    surfaceTertiary: '#F2F4F7',
    onSurfaceTertiary: '#475467',
    brand: '#003366',
    onBrand: '#FFFFFF',
    brandTertiary: '#E6F0FA',
    onBrandTertiary: '#003366',
    success: '#079455',
    warning: '#DC6803',
    error: '#D92D20',
    border: '#EAECF0',
    borderStrong: '#D0D5DD',
    divider: '#F2F4F7',
    muted: '#98A2B3',
  },
  dark: {
    surface: '#121212',
    onSurface: '#F2F4F7',
    surfaceSecondary: '#1E1E1E',
    onSurfaceSecondary: '#D0D5DD',
    surfaceTertiary: '#2C2C2C',
    onSurfaceTertiary: '#98A2B3',
    brand: '#3B82F6',
    onBrand: '#FFFFFF',
    brandTertiary: '#1E3A8A',
    onBrandTertiary: '#BFDBFE',
    success: '#12B76A',
    warning: '#F79009',
    error: '#F04438',
    border: '#344054',
    borderStrong: '#475467',
    divider: '#1E1E1E',
    muted: '#667085',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  TRY: '₺',
  GBP: '£',
};

export const CURRENCIES = ['EUR', 'TRY', 'GBP'] as const;
export type Currency = typeof CURRENCIES[number];

export function formatMoney(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency] || '';
  const rounded = Math.abs(amount) >= 1000
    ? amount.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : amount.toFixed(2);
  return `${sym}${rounded}`;
}
