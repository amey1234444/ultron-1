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
        {/* Landing-page typography: sharp display plus premium UI faces, loaded
            from Google Fonts for the web pages. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Sora:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
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
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
