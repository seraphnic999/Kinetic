/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:        '#0D0D0D',
        surface:   '#1C1C1E',
        raised:    '#2C2C2E',
        nested:    '#3A3A3D',
        border:    '#2C2C2E',
        primary:   '#FF6B2B',
        blue:      '#4A9EFF',
        amber:     '#FFA040',
        gold:      '#FFD700',
        danger:    '#FF4444',
        muted:     '#6B6B6B',
        secondary: '#ABABAB',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
