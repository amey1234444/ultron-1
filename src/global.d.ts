// Font assets imported directly are handled by a webpack asset/resource rule and
// resolve to a URL string.
declare module '*.ttf' {
  const src: string;
  export default src;
}
declare module '*.otf' {
  const src: string;
  export default src;
}
declare module '*.png' {
  const src: string | { src: string };
  export default src;
}

// Side-effect CSS imports (global.css) processed by Next/PostCSS.
declare module '*.css';
