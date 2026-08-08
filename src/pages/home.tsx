import Head from 'next/head';

import Capabilities from '../components/home/Capabilities';
import CaseStudy from '../components/home/CaseStudy';
import Industries from '../components/home/Industries';
import ProductStage from '../components/home/ProductStage';
import Results from '../components/home/Results';
import Rules from '../components/home/Rules';
import SignalBand from '../components/home/SignalBand';
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

      {/* The section order is also the tonal order. Consecutive bands step
          between black and a lifted grey so the page reads as plates laid on one
          another rather than as one continuous black scroll:

            hero      #080808   flat black, the darkest thing on the site
            stage     #0a0a0a   page black
            platform  #101011   lifted — the longest section gets its own plate
            industries#0a0a0a   back to black; its own hairline gaps carry it
            deployment light    the single inversion on the site
            results   #101011   steps back down to grey out of the inversion
            signals   #0a0a0a   black again, so the three white ticks are the
                                brightest marks in the lower half of the page */}
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

        {/* The closer. The protocol strips that used to sit here have moved to
            /how-it-works, where the wire format is a question the reader has
            actually arrived at. */}
        <SignalBand />

        <SiteFooter />
      </div>
    </div>
  );
}
