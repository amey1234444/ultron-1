import Head from 'next/head';

import Capabilities from '../components/home/Capabilities';
import ProductStage from '../components/home/ProductStage';
import Pulse from '../components/home/Pulse';
import Results from '../components/home/Results';
import Rules from '../components/home/Rules';
import SignalField from '../components/home/SignalField';
import Signals from '../components/home/Signals';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import UltronHero from '../components/hero/UltronHero';
import SiteNav from '../components/web/SiteNav';

export default function HomePage() {
  return (
    <div className={styles.page}>
      <Head>
        <title>ULTRON — Total plant context, in real time</title>
        <meta
          name="description"
          content="ULTRON turns plant telemetry into a single auditable health score per asset, and the one instruction that follows from it."
        />
        <meta name="theme-color" content="#0A0A0A" />
      </Head>

      <SiteNav />
      <Rules />

      <div className={styles.content}>
        <UltronHero />

        {/* The console surface, straightening as it comes into view. */}
        <ProductStage />

        {/* Pinned noise → signal → decision sequence. Owns the `#signal` anchor. */}
        <SignalField />

        {/* Mirrored gather/emit bands — the symmetry argument, twice. */}
        <section className={`${styles.section} ${styles.ruled}`}>
          <div className={styles.inner}>
            <Signals />
          </div>
        </section>

        {/* Owns `#platform`. */}
        <Capabilities />

        {/* Owns `#results` — the dimension rail and the two specifications. */}
        <Results />

        {/* Closing sweep. The FAQ that used to sit here now lives on /about. */}
        <Pulse />

        <SiteFooter />
      </div>
    </div>
  );
}
