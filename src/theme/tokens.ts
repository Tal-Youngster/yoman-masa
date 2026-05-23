/**
 * Luminous Horizon Theme Tokens
 * Centralized color palette for use in React components, Zod schemas, or runtime styling.
 */

export const luminousHorizonTheme = {
  // Surface colors
  surface: '#fff9ee',
  surfaceDim: '#dfd9cf',
  surfaceBright: '#fff9ee',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f9f3e8',
  surfaceContainer: '#f3ede2',
  surfaceContainerHigh: '#ede8dd',
  surfaceContainerHighest: '#e8e2d7',
  onSurface: '#1d1c15',
  onSurfaceVariant: '#56423c',
  inverseSurface: '#333029',
  inverseOnSurface: '#f6f0e5',
  outline: '#89726b',
  outlineVariant: '#ddc0b8',
  surfaceTint: '#9f4122',

  // Primary (Warm Orange)
  primary: '#9f4122',
  onPrimary: '#ffffff',
  primaryContainer: '#ff8a65',
  onPrimaryContainer: '#752305',
  inversePrimary: '#ffb59e',
  primaryFixed: '#ffdbd0',
  primaryFixedDim: '#ffb59e',
  onPrimaryFixed: '#3a0b00',
  onPrimaryFixedVariant: '#7f2a0d',

  // Secondary (Pale Lime)
  secondary: '#556500',
  onSecondary: '#ffffff',
  secondaryContainer: '#d6ed7a',
  onSecondaryContainer: '#5a6c00',
  secondaryFixed: '#d6ed7a',
  secondaryFixedDim: '#bbd062',
  onSecondaryFixed: '#181e00',
  onSecondaryFixedVariant: '#3f4c00',

  // Tertiary (Soft Cyan)
  tertiary: '#326578',
  onTertiary: '#ffffff',
  tertiaryContainer: '#80b1c7',
  onTertiaryContainer: '#074457',
  tertiaryFixed: '#bbe9ff',
  tertiaryFixedDim: '#9ccee4',
  onTertiaryFixed: '#001f29',
  onTertiaryFixedVariant: '#154d5f',

  // Error
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  // Background
  background: '#fff9ee',
  onBackground: '#1d1c15',
  surfaceVariant: '#e8e2d7',
} as const;

export type ThemeToken = keyof typeof luminousHorizonTheme;

export const typography = {
  displayXl: {
    fontSize: '64px',
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: '-0.04em',
  },
  headlineLg: {
    fontSize: '40px',
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: '-0.02em',
  },
  headlineMd: {
    fontSize: '24px',
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: '-0.01em',
  },
  bodyLg: {
    fontSize: '18px',
    fontWeight: 400,
    lineHeight: 1.6,
    letterSpacing: '0',
  },
  bodyMd: {
    fontSize: '16px',
    fontWeight: 400,
    lineHeight: 1.6,
    letterSpacing: '0',
  },
  labelCaps: {
    fontSize: '12px',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
  },
} as const;

export const spacing = {
  unit: 8,
  2: 16,
  3: 24,
  4: 32,
  5: 40,
  6: 48,
  8: 64,
  15: 120,
} as const;

export const radii = {
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
  full: '9999px',
} as const;

/** Glassmorphism preset styles for quick component creation */
export const glassmorphism = {
  base: {
    background: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(232, 226, 215, 0.5)',
  },
  thick: {
    background: 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(30px)',
    border: '1px solid rgba(232, 226, 215, 0.6)',
  },
  subtle: {
    background: 'rgba(255, 255, 255, 0.5)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(232, 226, 215, 0.3)',
  },
} as const;

/** Shadow presets matching the theme's diffused aesthetic */
export const shadows = {
  elevated: '0 2px 8px rgba(159, 65, 34, 0.05), 0 4px 16px rgba(159, 65, 34, 0.08)',
  elevatedLg: '0 4px 12px rgba(159, 65, 34, 0.08), 0 8px 24px rgba(159, 65, 34, 0.12)',
  glowCyan: '0 0 20px rgba(128, 177, 199, 0.15)',
} as const;
