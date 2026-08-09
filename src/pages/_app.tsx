import '../../global.css';

import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLoader } from '../components/web/AppLoader';
import { AuthProvider } from '../context/AuthContext';
import { loadWebFonts } from '../lib/webFonts';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [routing, setRouting] = useState(false);

  useEffect(() => {
    loadWebFonts();
  }, []);

  // Page-to-page navigation. These bundles are large enough that without this
  // the old screen simply sits there, and the click reads as having done
  // nothing at all.
  useEffect(() => {
    const start = () => setRouting(true);
    const done = () => setRouting(false);
    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', done);
    router.events.on('routeChangeError', done);
    return () => {
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', done);
      router.events.off('routeChangeError', done);
    };
  }, [router]);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Head>
          <title>ULTRON</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        </Head>
        <Component {...pageProps} />
        {routing ? <AppLoader overlay /> : null}
      </AuthProvider>
    </SafeAreaProvider>
  );
}
