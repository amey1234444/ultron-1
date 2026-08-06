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
      // Console palette. Black, grey and white, with a single light-green
      // accent reserved for live state and active controls — the same system
      // the landing page uses (see the `--u-*` tokens in global.css). Keep the
      // two in sync: a colour that exists here and nowhere there is a drift.
      colors: {
        surface: {
          // `bg-surface` is the console's dark canvas.
          DEFAULT: '#0A0A0A',
          dark: '#0A0A0A',
          darkpanel: '#131413',
          // Slightly lifted panel used by the console dashboard cards.
          card: '#1A1B1A',
          light: '#F7F7F5',
          lightpanel: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#F2F2F0',
          muted: '#A1A3A0',
          inverse: '#0A0A0A',
          'inverse-muted': '#6B6D6B',
        },
        line: {
          dark: 'rgba(255,255,255,0.07)',
          light: '#E7E7E3',
        },
        status: {
          success: '#3FBF6A',
          warning: '#E3B341',
          critical: '#F2624A',
          danger: '#F2624A',
        },
        primary: {
          blue: '#6EF08A',
        },
        accent: {
          DEFAULT: '#6EF08A',
          soft: 'rgba(110,240,138,0.12)',
          dim: '#2F7A48',
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
