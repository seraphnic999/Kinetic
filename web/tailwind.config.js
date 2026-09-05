/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Mirrors Colors in the mobile app's src/theme.js — keep the two in sync
      // so the web dashboard renders in the same palette as the phone.
      colors: {
        bg:           '#0D0D0D',
        surface:      '#1C1C1E',
        raised:       '#2C2C2E',
        nested:       '#3A3A3D',
        border:       '#2C2C2E',
        primary:      '#FF6B2B',
        primaryLight: '#FFA366',
        blue:         '#4FC3F7',
        amber:        '#FF9A3C',
        gold:         '#FFD23F',
        danger:       '#FF3B30',
        muted:        '#505050',
        secondary:    '#A0A0A0',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
