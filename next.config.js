/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep the Expo tsconfig untouched — Next uses its own. Type-checking is skipped
  // during the build because the shared React Native component tree legitimately
  // uses react-native-web-only style props (userSelect, cursor, ...) that RN core
  // types reject. `npm run typecheck` covers the app-specific code instead.
  typescript: { tsconfigPath: 'tsconfig.next.json', ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Allow importing the shared RN component tree that lives at the repo root
  // (components/, lib/, hooks/) from src/pages.
  experimental: { externalDir: true },
  transpilePackages: [
    'react-native',
    'react-native-web',
    'nativewind',
    'react-native-css-interop',
    'react-native-safe-area-context',
    'react-native-svg',
    '@expo/vector-icons',
    'expo',
    'expo-modules-core',
    'expo-font',
    'expo-asset',
    'expo-blur',
    'expo-linear-gradient',
    'expo-status-bar',
    'expo-constants',
    '@expo-google-fonts/inter',
    '@expo-google-fonts/space-grotesk',
    '@expo-google-fonts/ibm-plex-mono',
  ],
  webpack: (config, { isServer, webpack }) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // react-native -> react-native-web for the browser build.
      'react-native$': 'react-native-web',
    };
    config.plugins.push(
      new webpack.DefinePlugin({
        __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
      }),
    );
    // Some transpiled deps (expo-font) import Node built-ins via the `node:` scheme,
    // which webpack can't resolve for the browser. Strip the prefix and stub the
    // server-only module out of the client bundle (it's never executed there).
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, '');
      }),
    );
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        async_hooks: false,
      };
    }
    // Prefer platform-specific web files, then fall back to shared ones.
    config.resolve.extensions = [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      ...config.resolve.extensions,
    ];
    // Load font files pulled in by @expo-google-fonts / @expo/vector-icons as URLs.
    config.module.rules.push({
      test: /\.(ttf|otf|woff|woff2)$/,
      type: 'asset/resource',
    });
    return config;
  },
};

module.exports = nextConfig;
