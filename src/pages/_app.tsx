import '../../global.css';

import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLoader } from '../components/web/AppLoader';
import { AuthProvider } from '../context/AuthContext';
import { startSmoothScroll } from '../lib/smoothScroll';
import { loadWebFonts } from '../lib/webFonts';

/**
 * Routes that scroll as one long document, and so get inertial wheel easing.
 *
 * Everything not on this list keeps native scrolling. That is the console —
 * `/` — plus the short auth forms, where a page that eases has nothing to ease
 * and an interceptor is pure cost. See `lib/smoothScroll.ts`.
 */
const SMOOTH_SCROLL_ROUTES = new Set([
  '/home',
  '/how-it-works',
  '/capabilities',
  '/outcomes',
  '/about',
  '/faq',
  '/contact',
]);

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [routing, setRouting] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    loadWebFonts();
  }, []);

  // Re-armed per route: the listener is torn down and rebuilt on navigation, so
  // leaving a marketing page for the console hands the wheel straight back.
  useEffect(() => {
    if (!SMOOTH_SCROLL_ROUTES.has(router.pathname)) return;
    return startSmoothScroll();
  }, [router.pathname]);

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
          <title>BlackGATE</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        </Head>
        <Component {...pageProps} />
        {routing ? <AppLoader overlay /> : null}
      </AuthProvider>
    </SafeAreaProvider>
  );
}
