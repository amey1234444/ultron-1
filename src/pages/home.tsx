import Head from 'next/head';

import BuildOn from '../components/home/BuildOn';
import Capabilities from '../components/home/Capabilities';
import Pipeline from '../components/home/Pipeline';
import ProductStage from '../components/home/ProductStage';
import Pulse from '../components/home/Pulse';
import Results from '../components/home/Results';
import Rules from '../components/home/Rules';
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

        {/* Pinned sensor → broker → backend → console chain. Owns `#signal`. */}
        <Pipeline />

        {/* Everything on the floor converging on one context. */}
        <section className={`${styles.section} ${styles.ruled}`}>
          <div className={styles.inner}>
            <Signals />
          </div>
        </section>

        {/* Owns `#platform` — scrolling copy against a pinned panel. */}
        <Capabilities />

        {/* Owns `#results` — the dimension rail and the two specifications. */}
        <Results />

        {/* The developer band. */}
        <BuildOn />

        {/* Closing sweep. The FAQ that used to sit here now lives on /about. */}
        <Pulse />

        <SiteFooter />
      </div>
    </div>
  );
}
