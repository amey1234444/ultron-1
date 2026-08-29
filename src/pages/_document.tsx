import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Defense-in-depth anti-clickjacking guard (runs before render). The
            primary protection is the X-Frame-Options / CSP frame-ancestors
            headers in next.config.js; this same-origin script is a fallback that
            keeps the app from rendering inside a frame even if those headers are
            ever stripped by an intermediary or a mis-serving host. */}
        <script src="/anti-clickjack.js" />
        {/* Tab mark — the U from the ULTRON wordmark, white on the product
            black. The SVG is what Chrome, Edge and Firefox actually draw, so
            the mark stays sharp at any zoom or pixel ratio; the .ico is the
            fallback for the bare /favicon.ico request and for pinned sites,
            and the two PNGs cover browsers that take neither. */}
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        {/* Typography — two families for the whole product. Inter covers every
            text role across the landing page and the console (weight and
            tracking separate display from UI), JetBrains Mono covers
            engineering values and micro-labels. The display faces this project
            used to load (Anton, Bebas Neue, DM Sans) have been retired, which
            also takes three font requests off the critical path. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body>
        {/* react-native-web relies on the root elements filling the viewport so
            top-level `flex: 1` layouts expand correctly. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `html,body,#__next{height:100%;margin:0;padding:0;}
#__next{display:flex;flex-direction:column;}
body{background:#0A0A0A;}`,
          }}
        />
        {/* Landing-page entrance animations start from opacity 0 and are
            released by an IntersectionObserver. Without scripting that observer
            never runs, so the content is forced visible instead of staying
            blank. */}
        <noscript>
          <style
            dangerouslySetInnerHTML={{
              __html: '[data-reveal]{opacity:1!important;transform:none!important;}',
            }}
          />
        </noscript>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
