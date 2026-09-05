import Head from 'next/head';

import Ambience from '../components/home/Ambience';
import Capabilities from '../components/home/Capabilities';
import Cutover from '../components/home/Cutover';
import EvidenceCase from '../components/home/EvidenceCase';
import InTheRoom from '../components/home/InTheRoom';
import NextStep from '../components/home/NextStep';
import Operators from '../components/home/Operators';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import BrandHero from '../components/hero/BrandHero';
import SiteNav from '../components/web/SiteNav';

export default function HomePage() {
  return (
    <div className={styles.page}>
      <Head>
        <title>BlackGATE — Condition monitoring for rotating equipment</title>
        <meta
          name="description"
          content="Stop finding out after it breaks. BlackGATE turns plant telemetry into a named component, an evidence trail and a window to take the machine out in."
        />
        <meta name="theme-color" content="#070707" />
      </Head>

      <SiteNav />
      <Ambience />

      {/* One field, one surface. Every band below is transparent and the fixed
          Ambience layers run from the fold to the footer without a seam. There
          are no rules between sections: tone rises and falls instead, because
          alternating bands carry a vertical gradient that starts and ends fully
          transparent, so a section change is felt rather than drawn.

          The console screenshot that used to sit between evidence and platform
          is gone. Two photographs carry this page — a works at dusk and two
          people arguing over a report — and a third picture that was really a
          product shot diluted both of them.

          Reading order, and it is an argument rather than a tour:

            hero       what this is for
            condition  what measurably changes after cutover
            evidence   one named plant, and what was actually found there
            platform   the surface it all lands on
            next step  the ask
            in the room who opens a finding, and what each of them checks
            operators  the same thing, in their words                        */}
      <div className={styles.content}>
        <BrandHero />

        {/* Owns `#condition` — the four outcome figures against their baseline. */}
        <Cutover />

        {/* Owns `#evidence` — Northfield, fourteen months. */}
        <EvidenceCase />

        {/* Owns `#platform` — scrolling copy against a pinned panel. */}
        <Capabilities />

        <NextStep />

        <InTheRoom />

        <Operators />

        <SiteFooter />
      </div>
    </div>
  );
}
