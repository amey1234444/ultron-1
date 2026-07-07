import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head />
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
