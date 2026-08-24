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
          DEFAULT: '#08090C',
          dark: '#08090C',
          darkpanel: '#111318',
          // Slightly lifted panel used by the console dashboard cards.
          card: '#171A20',
          light: '#F5F6F8',
          lightpanel: '#FFFFFF',
          // Nested surface inside a light card, see `panelRaised` in consoleTheme.
          lightraised: '#FAFBFC',
        },
        ink: {
          DEFAULT: '#F7F6F2',
          muted: '#8B8D93',
          inverse: '#171A1F',
          'inverse-muted': '#5E6673',
        },
        line: {
          dark: 'rgba(255,255,255,0.075)',
          light: '#DFE3E8',
        },
        // One green for the whole product: the Online pill on racks and
        // gateways set it, so `status.success` and `accent` are the same value
        // rather than two greens a glance apart.
        status: {
          success: '#3FBF6A',
          warning: '#D9962B',
          critical: '#D64545',
          danger: '#D64545',
        },
        primary: {
          blue: '#3FBF6A',
        },
        accent: {
          DEFAULT: '#3FBF6A',
          soft: 'rgba(63,191,106,0.13)',
          dim: '#2A7A48',
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
