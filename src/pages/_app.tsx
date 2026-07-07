import '../../global.css';

import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../context/AuthContext';
import { loadWebFonts } from '../lib/webFonts';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    loadWebFonts();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Head>
          <title>ULTRON</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        </Head>
        <Component {...pageProps} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
