/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0b0b0d', 900: '#121215', 800: '#1b1b20', 700: '#26262d', 600: '#34343d', 400: '#8a8a96' },
        accent: '#3b82f6',
      },
    },
  },
  plugins: [],
};
