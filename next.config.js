const isProd = process.env.NODE_ENV === 'production';

// Content-Security-Policy. react-native-web injects styles inline, so
// style-src needs 'unsafe-inline'. In dev, Next's HMR needs 'unsafe-eval' and a
// websocket connection; production locks scripts down to same-origin.
// The browser subscribes to the MQTT broker directly (see src/lib/brokerFrames),
// so its exact origin has to be allowed in connect-src. Derived from the
// configured URL rather than hardcoded or widened to `wss:`, so a change of
// broker cannot silently leave the connection blocked or the policy too loose.
// This is a build-time header, so MQTT_BROWSER_WS_URL must be present in the
// build environment (the deploy workflow runs `vercel pull` first).
const brokerOrigin = (() => {
  const url = process.env.MQTT_BROWSER_WS_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    console.warn(`[csp] MQTT_BROWSER_WS_URL is not a valid URL: ${url}`);
    return null;
  }
})();

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  isProd ? "script-src 'self'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "worker-src 'self' blob:",
  "media-src 'self' data: blob:",
  isProd
    ? `connect-src 'self'${brokerOrigin ? ` ${brokerOrigin}` : ''}`
    : "connect-src 'self' ws: wss:",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise the framework/version
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Keep the Expo tsconfig untouched — Next uses its own. Type-checking is skipped
  // during the build because the shared React Native component tree legitimately
  // uses react-native-web-only style props (userSelect, cursor, ...) that RN core
  // types reject. `npm run typecheck` covers the app-specific code instead.
  typescript: { tsconfigPath: 'tsconfig.next.json', ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Allow importing the shared RN component tree that lives at the repo root
  // (components/, lib/, hooks/) from src/pages.
  experimental: { externalDir: true },
  // Keep pg out of the webpack bundle and ensure it is traced into the
  // serverless function output.
  serverExternalPackages: ['pg'],
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
