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
          dark: '#0A0A0A',
          darkpanel: '#131313',
          light: '#FAFAFA',
          lightpanel: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#F5F5F5',
          muted: '#8A8A8A',
          inverse: '#0A0A0A',
          'inverse-muted': '#6B6B6B',
        },
        line: {
          dark: 'rgba(255,255,255,0.08)',
          light: '#E5E5E5',
        },
        status: {
          success: '#3FB950',
          warning: '#F2A93B',
          critical: '#EF4444',
        },
        accent: {
          DEFAULT: '#C9A15C',
          soft: 'rgba(201,161,92,0.14)',
          dim: '#8A6C3A',
        },
      },
      fontFamily: {
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
