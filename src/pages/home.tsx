import Head from 'next/head';

import Ambience from '../components/home/Ambience';
import Capabilities from '../components/home/Capabilities';
import Cutover from '../components/home/Cutover';
import EvidenceCase from '../components/home/EvidenceCase';
import Industries from '../components/home/Industries';
import InTheRoom from '../components/home/InTheRoom';
import NextStep from '../components/home/NextStep';
import Operators from '../components/home/Operators';
import ProductStage from '../components/home/ProductStage';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import UltronHero from '../components/hero/UltronHero';
import SiteNav from '../components/web/SiteNav';

export default function HomePage() {
  return (
    <div className={styles.page}>
      <Head>
        <title>ULTRON — Condition monitoring for rotating equipment</title>
        <meta
          name="description"
          content="Stop finding out after it breaks. ULTRON turns plant telemetry into a named component, an evidence trail and a window to take the machine out in."
        />
        <meta name="theme-color" content="#0A0A0A" />
      </Head>

      <SiteNav />
      <Ambience />

      {/* One field, one surface. The page used to alternate between black,
          grey and a single light plate so consecutive sections read as plates
          laid on each other; every band below is transparent instead and the
          fixed Ambience field runs from the fold to the footer without a seam.
          Structure is carried by hairlines and by the two picture plates, which
          is what the reference does — the ground never changes value, so the
          only things on the page that step in brightness are the ones that mean
          something.

          Reading order, and it is an argument rather than a tour:

            hero       what this is for
            condition  what measurably changes after cutover
            evidence   one named plant, and what was actually found there
            platform   the surface it all lands on
            industries where it runs
            next step  the ask
            in the room who opens a finding, and what each of them checks
            operators  the same thing, in their words                        */}
      <div className={styles.content}>
        <UltronHero />

        {/* Owns `#condition` — the four outcome figures against their baseline. */}
        <Cutover />

        {/* Owns `#evidence` — Northfield, fourteen months. */}
        <EvidenceCase />

        {/* The console surface, straightening as it comes into view. */}
        <ProductStage />

        {/* Owns `#platform` — scrolling copy against a pinned panel. */}
        <Capabilities />

        {/* Owns `#industries` — the five materials, as specimens. */}
        <Industries />

        <NextStep />

        <InTheRoom />

        <Operators />

        <SiteFooter />
      </div>
    </div>
  );
}
