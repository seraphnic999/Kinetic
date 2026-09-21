/** @type {import('tailwindcss').Config} */
//
// Mirrors `Colors` in the mobile app's src/theme.js. Keep the two in sync — the
// web dashboard reads the same data through the same engine and should not
// render it in a different language.
//
// This is the Console palette (docs/DESIGN.md §2), replacing the pre-redesign
// one. Two things it fixes rather than merely restyles:
//
//   · The ground is a six-step RAMP. The old config had `border` and `raised`
//     both at #2C2C2E, which is why cards on the web had no visible edge —
//     exactly the fault §2.1 was written to correct.
//   · There are three CHANNELS, not a bag of accent colours: ember is LIVE,
//     ice is WAITING, gold is BANKED. `warn` and `danger` are semantics and are
//     the only other colours allowed to carry meaning.
//
// The old names (primary, blue, amber, border, secondary) are gone rather than
// aliased: the mobile app deleted its legacy aliases at stage 7, and keeping a
// second set alive here would let the two drift apart again.
//
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Ground — six steps. `line` is deliberately NOT equal to any surface.
        void:    '#08080A',
        bg:      '#0F0F11',
        surface: '#17171A',
        raised:  '#202024',
        nested:  '#2A2A30',
        line:    '#34343C',

        // The three channels
        ember:    '#FF6B2B',
        emberHot: '#FF8A4C',
        ice:      '#4FC3F7',
        gold:     '#FFC93C',

        // Semantics — two, not five
        warn:   '#FFA726',
        danger: '#FF5252',

        // Text
        ink:   '#F2F2F4',
        muted: '#9A9AA4',
        faint: '#63636D',
      },
      fontFamily: {
        // Titles, stat values, every number that is not a live countdown.
        display: ['"Barlow Semi Condensed"', 'Arial Narrow', 'system-ui', 'sans-serif'],
        // Everything read as language.
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { sm: '10px', md: '14px', lg: '20px', xl: '28px' },
    },
  },
  plugins: [],
};
