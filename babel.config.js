// Shared Babel config for BOTH the Expo/Metro build (mobile + expo web) and the
// Next.js build (Vercel web). We branch on the Babel caller so each toolchain gets
// the preset it needs while the repo keeps a single babel.config.js.
module.exports = function (api) {
  const callerName = api.caller((caller) => (caller ? caller.name : ''));
  const isMetro = callerName === 'metro';
  // Cache per-caller so Metro and Next don't clobber each other's cached config.
  api.cache.using(() => callerName);

  if (isMetro) {
    return {
      presets: [
        ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
        'nativewind/babel',
      ],
    };
  }

  // Next.js (webpack + babel-loader). `next/babel` wires up React/TS/Next transforms;
  // we point the React runtime at nativewind so `className` works on RN-web primitives.
  return {
    presets: [
      ['next/babel', { 'preset-react': { runtime: 'automatic', importSource: 'nativewind' } }],
      'nativewind/babel',
    ],
  };
};
