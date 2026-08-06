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
        {/* Typography. Inter carries the landing page (display + UI) with
            JetBrains Mono for micro-labels; Anton / Bebas Neue / DM Sans stay
            loaded because the console tree still maps onto them through the
            font utilities in global.css. Families that were only ever CSS
            fallbacks (Sora, Space Grotesk, IBM Plex Mono) are not requested. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&family=Anton&family=Bebas+Neue&family=JetBrains+Mono:wght@400;500;600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap"
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
body{background:#08090B;}`,
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
