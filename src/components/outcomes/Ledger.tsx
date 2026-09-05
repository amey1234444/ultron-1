// Ledger — the Northfield case, told as its own dates.
//
// A paper plate with the case summary, a raised plate with the one number that
// mattered on the floor, and a timeline of what happened when. The figures
// match the landing page's EvidenceCase exactly.

import { DetailSection, GateMark, InnerHead, Plate, PlateWall, Timeline, innerStyles } from '../pages/inner';

const TICKS = [
  {
    when: 'Week 0',
    title: 'Cutover',
    body: 'Forty-one assets mapped to existing historian points. Nine held at CONFIGURATION_REQUIRED for missing tags; no new sensors fitted.',
  },
  {
    when: 'Week 2',
    title: 'First baselines armed',
    body: 'Fourteen days of healthy running on the extruder line. Rules armed against the bands the plant taught, not vendor defaults.',
  },
  {
    when: 'Week 6',
    title: 'First finding',
    body: 'Gearbox 02 output bearing: temperature, 1× vibration and BPFO envelope moved together. Range given as 19–26 days.',
    tag: 'Confirmed',
    hot: true,
  },
  {
    when: 'Week 8',
    title: 'Planned take-out',
    body: 'Bearing replaced in a Thursday-night window already on the production plan. Inspection found spalling on the outer race, as named.',
  },
  {
    when: 'Month 7',
    title: 'Fourth bearing caught',
    body: 'Three more bearings across pumps and a drive, each with notice inside the range given. One finding on a pump seal was not confirmed and is counted as such.',
  },
  {
    when: 'Month 14',
    title: 'Comparison closed',
    body: 'Unplanned downtime 31 per cent below the twelve-month baseline. Median notice fourteen days before the window closed.',
    tag: 'Study end',
  },
];

export default function Ledger() {
  return (
    <section id="northfield" className={`${innerStyles.section} ${innerStyles.sectionRuled}`}>
      <div className={innerStyles.inner}>
        <InnerHead
          eyebrow="Case · Northfield"
          title="Northfield. *14 months later.*"
          lead="Polymer extrusion · 41 assets · Existing instrumentation"
        />

        <PlateWall>
          <Plate
            tone="paper"
            span={7}
            eyebrow="Summary"
            title="Four bearings caught before they seized"
            body="Four confirmed bearing findings. One unconfirmed finding. Every result counted."
            foot={
              <dl className={innerStyles.factGrid}>
                <div>
                  <dt>Assets</dt>
                  <dd>41 monitored</dd>
                </div>
                <div>
                  <dt>Sensors added</dt>
                  <dd>None</dd>
                </div>
                <div>
                  <dt>Install → first finding</dt>
                  <dd>6 weeks</dd>
                </div>
                <div>
                  <dt>Confirmed / total</dt>
                  <dd>4 of 5</dd>
                </div>
              </dl>
            }
          />
          <Plate
            tone="bronze"
            span={5}
            eyebrow="The figure that mattered"
            delay={100}
            mark={<GateMark />}
          >
            <p className={innerStyles.bigNumber}>
              31<span>%</span>
            </p>
            <p className={innerStyles.bigNumberLabel}>
              fewer unplanned downtime hours over twelve months, against the site&rsquo;s own
              record for the twelve before.
            </p>
          </Plate>
        </PlateWall>

        <div style={{ marginTop: 56 }}>
          <DetailSection label="View the deployment timeline" variant="inline">
            <Timeline items={TICKS} />
          </DetailSection>
        </div>
      </div>
    </section>
  );
}
