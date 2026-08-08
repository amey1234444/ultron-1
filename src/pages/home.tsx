import Head from 'next/head';

import BuildOn from '../components/home/BuildOn';
import Capabilities from '../components/home/Capabilities';
import CaseStudy from '../components/home/CaseStudy';
import Industries from '../components/home/Industries';
import ProductStage from '../components/home/ProductStage';
import Results from '../components/home/Results';
import Rules from '../components/home/Rules';
import Singularity from '../components/home/Singularity';
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

        {/* Owns `#platform` — scrolling copy against a pinned panel. */}
        <Capabilities />

        {/* Owns `#industries` — the five materials, as specimens. */}
        <Industries />

        {/* The flagship deployment, stated as a result rather than a story. */}
        <CaseStudy />

        {/* Owns `#results` — the dimension rail and the two specifications. */}
        <Results />

        {/* The developer band. */}
        <BuildOn />

        {/* The closer: everything collapses to one point, and you go through it. */}
        <Singularity />

        <SiteFooter />
      </div>
    </div>
  );
}
