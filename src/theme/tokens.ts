/**
 * Paper & Path Theme Tokens
 * Centralized color palette for use in React components, Zod schemas, or runtime styling.
 */

export interface ThemeColors {
  surface: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  outline: string;
  outlineVariant: string;
  surfaceTint: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  inversePrimary: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  primaryFixed: string;
  primaryFixedDim: string;
  onPrimaryFixed: string;
  onPrimaryFixedVariant: string;
  secondaryFixed: string;
  secondaryFixedDim: string;
  onSecondaryFixed: string;
  onSecondaryFixedVariant: string;
  tertiaryFixed: string;
  tertiaryFixedDim: string;
  onTertiaryFixed: string;
  onTertiaryFixedVariant: string;
  background: string;
  onBackground: string;
  surfaceVariant: string;
}

export const paperPathTheme: ThemeColors = {
  surface: '#fbf9f5',
  surfaceDim: '#dbdad6',
  surfaceBright: '#fbf9f5',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f5f3ef',
  surfaceContainer: '#efeeea',
  surfaceContainerHigh: '#eae8e4',
  surfaceContainerHighest: '#e4e2de',
  onSurface: '#1b1c1a',
  onSurfaceVariant: '#54433a',
  inverseSurface: '#30312e',
  inverseOnSurface: '#f2f0ed',
  outline: '#877369',
  outlineVariant: '#dac2b6',
  surfaceTint: '#934b19',
  primary: '#6c2f00',
  onPrimary: '#ffffff',
  primaryContainer: '#8b4513',
  onPrimaryContainer: '#ffc29f',
  inversePrimary: '#ffb68c',
  secondary: '#545e76',
  onSecondary: '#ffffff',
  secondaryContainer: '#d7e2ff',
  onSecondaryContainer: '#5a647c',
  tertiary: '#5b3a16',
  onTertiary: '#ffffff',
  tertiaryContainer: '#75512b',
  onTertiaryContainer: '#f8c696',
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  primaryFixed: '#ffdbc9',
  primaryFixedDim: '#ffb68c',
  onPrimaryFixed: '#321200',
  onPrimaryFixedVariant: '#753401',
  secondaryFixed: '#d7e2ff',
  secondaryFixedDim: '#bbc6e2',
  onSecondaryFixed: '#101b30',
  onSecondaryFixedVariant: '#3c475d',
  tertiaryFixed: '#ffdcbd',
  tertiaryFixedDim: '#eebd8e',
  onTertiaryFixed: '#2c1600',
  onTertiaryFixedVariant: '#61401b',
  background: '#fbf9f5',
  onBackground: '#1b1c1a',
  surfaceVariant: '#e4e2de',
} as const;

export type ThemeToken = keyof ThemeColors;

export const typography = {
  displayLg: {
    fontFamily: 'Libre Caslon Text',
    fontSize: '48px',
    fontWeight: 700,
    lineHeight: '56px',
    letterSpacing: '-0.02em',
  },
  displayLgMobile: {
    fontFamily: 'Libre Caslon Text',
    fontSize: '36px',
    fontWeight: 700,
    lineHeight: '44px',
  },
  headlineMd: {
    fontFamily: 'Libre Caslon Text',
    fontSize: '32px',
    fontWeight: 600,
    lineHeight: '40px',
  },
  headlineSm: {
    fontFamily: 'Libre Caslon Text',
    fontSize: '24px',
    fontWeight: 600,
    lineHeight: '32px',
  },
  bodyLg: {
    fontFamily: 'Plus Jakarta Sans',
    fontSize: '18px',
    fontWeight: 400,
    lineHeight: '28px',
  },
  bodyMd: {
    fontFamily: 'Plus Jakarta Sans',
    fontSize: '16px',
    fontWeight: 400,
    lineHeight: '24px',
  },
  labelMd: {
    fontFamily: 'Plus Jakarta Sans',
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: '20px',
    letterSpacing: '0.01em',
  },
  labelSm: {
    fontFamily: 'Plus Jakarta Sans',
    fontSize: '12px',
    fontWeight: 500,
    lineHeight: '16px',
    letterSpacing: '0.05em',
  },
} as const;

export const spacing = {
  unit: 8,
  gutter: 24,
  marginMobile: 20,
  marginDesktop: 64,
  maxWidth: 1200,
} as const;

export const radii = {
  sm: '0.25rem',
  DEFAULT: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  full: '9999px',
} as const;

/** Shadow presets matching the theme's diffused aesthetic */
export const shadows = {
  soft: '0 4px 16px rgba(60, 60, 60, 0.04)',
  floating: '0 8px 24px rgba(60, 60, 60, 0.08)',
} as const;
