/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        surface: {
          // `bg-surface` is the console's dark canvas.
          DEFAULT: '#08090C',
          dark: '#08090C',
          darkpanel: '#111318',
          // Slightly lifted panel used by the console dashboard cards.
          card: '#14161C',
          light: '#F6F6F4',
          lightpanel: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#F7F6F2',
          muted: '#8B8D93',
          inverse: '#0A0B0D',
          'inverse-muted': '#6B6F76',
        },
        line: {
          dark: 'rgba(255,255,255,0.08)',
          light: '#E6E5E1',
        },
        status: {
          success: '#2FA35A',
          warning: '#D9962B',
          critical: '#D64545',
          danger: '#D64545',
        },
        primary: {
          blue: '#2F6FED',
        },
        accent: {
          DEFAULT: '#C9A15C',
          soft: 'rgba(201,161,92,0.14)',
          dim: '#8A6C3A',
        },
      },
      fontFamily: {
        // Native builds resolve the bundled TTF families; the web build swaps in
        // the Google faces (Anton / Bebas Neue / DM Sans / JetBrains Mono) via
        // the overrides at the bottom of global.css.
        display: ['SpaceGrotesk_600SemiBold'],
        wordmark: ['SpaceGrotesk_600SemiBold'],
        heading: ['SpaceGrotesk_500Medium'],
        'heading-medium': ['SpaceGrotesk_600SemiBold'],
        body: ['Inter_400Regular'],
        'body-medium': ['Inter_500Medium'],
        'body-bold': ['Inter_600SemiBold'],
        mono: ['IBMPlexMono_400Regular'],
      },
    },
  },
  plugins: [],
};
