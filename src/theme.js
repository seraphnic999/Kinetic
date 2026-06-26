// Kinetic Design System
// Warm-dark palette: near-black base, ember orange primary, amber/gold accents
// Cool blue for rest timer (intentional contrast that makes it "pop" against warm tones)

export const Colors = {
  // Backgrounds
  background:     '#0D0D0D',  // near-black base
  surface:        '#1C1C1E',  // card / elevated surface
  surfaceRaised:  '#2C2C2E',  // inputs, chips, inner cards

  // Primary brand
  primary:        '#FF6B2B',  // Kinetic Orange — CTAs, active states
  primaryDim:     '#FF6B2B33',// orange with 20% opacity for glows/halos

  // Accents
  amber:          '#FF9A3C',  // warmup, secondary timers
  gold:           '#FFD23F',  // completion, achievement
  blue:           '#4FC3F7',  // rest timer — intentional cool pop
  blueDim:        '#4FC3F733',

  // Semantic
  success:        '#4CAF50',
  partial:        '#FF9A3C',
  danger:         '#FF3B30',

  // Text
  textPrimary:    '#FFFFFF',
  textSecondary:  '#A0A0A0',
  textMuted:      '#505050',

  // Borders
  border:         '#2C2C2E',
  borderActive:   '#FF6B2B',
};

export const Typography = {
  // Timer display — the hero numerals
  timerHuge:   { fontSize: 52, fontWeight: '700', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  timerLarge:  { fontSize: 36, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  timerMedium: { fontSize: 28, fontWeight: '600', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },

  // Headings
  h1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' },

  // Body — min 16sp for gym readability
  bodyLarge:  { fontSize: 18, fontWeight: '400', lineHeight: 26 },
  body:       { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodySmall:  { fontSize: 14, fontWeight: '400', lineHeight: 20 },

  // Labels / chips
  label:      { fontSize: 13, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  caption:    { fontSize: 12, fontWeight: '400' },
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

export const Radius = {
  sm:   8,
  md:   12,
  lg:   20,
  full: 999,
};

export const Shadows = {
  orange: {
    shadowColor:   '#FF6B2B',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius:  12,
    elevation:     8,
  },
  blue: {
    shadowColor:   '#4FC3F7',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius:  10,
    elevation:     6,
  },
  card: {
    shadowColor:   '#000000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius:  8,
    elevation:     4,
  },
};
