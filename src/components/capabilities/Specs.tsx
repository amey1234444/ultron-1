// Specs — the numbers an engineer asks for on the second call.
//
// A stat strip and then two columns of terse definition rows: what it connects
// to, and what it needs from the site. Nothing here is a claim about outcomes;
// that is the outcomes page. This is the datasheet.

import { InnerHead, Rows, StatStrip, innerStyles } from '../pages/inner';

const STATS = [
  { value: '48', unit: 'k', label: 'points per minute, sustained, per gateway' },
  { value: '< 90', unit: 's', label: 'reading to finding, at the 95th percentile' },
  { value: '14', unit: 'd', label: 'healthy running to arm a first baseline' },
  { value: '0', label: 'new sensors required to start' },
];

const CONNECTS = [
  { term: 'Historians', detail: 'OSIsoft PI, AVEVA, Honeywell PHD, Ignition tags — read-only, at the rate the historian already stores.' },
  { term: 'Controllers', detail: 'OPC-UA and Modbus TCP direct from the PLC or gateway where there is no historian in the way.' },
  { term: 'Files', detail: 'Timed CSV or Parquet drops for sites that export rather than expose. Late files are back-filled, not dropped.' },
  { term: 'Out', detail: 'Findings and instructions leave over webhook, e-mail, or a CMMS work-order (SAP PM, Maximo) — the plant’s system stays the system.' },
];

const NEEDS = [
  { term: 'Runs where', detail: 'On-premise on one industrial server, in a private cloud, or hosted by us. The console is the same in all three.' },
  { term: 'Internet', detail: 'Not required. An air-gapped site receives model updates on media and sends nothing out.' },
  { term: 'Data', detail: 'Stays the plant’s. Export is a button; on leaving, the full history is handed back in open formats and our copy is destroyed.' },
  { term: 'Access', detail: 'Accounts are created by the plant’s own administrator. Roles for operator, engineer and reader; SSO where the site has it.' },
];

export default function Specs() {
  return (
    <section id="specs" className={`${innerStyles.section} ${innerStyles.sectionRuled}`}>
      <div className={innerStyles.inner}>
        <InnerHead
          eyebrow="Specification"
          title="The *datasheet*, not the brochure"
          lead="Throughput, latency, what it connects to and what the site has to provide. The numbers here are what a plant engineer asks for on the second call."
        />
        <StatStrip items={STATS} />
        <div className={innerStyles.twoCol}>
          <div>
            <p className={innerStyles.colLabel}>Connects to</p>
            <Rows items={CONNECTS} numbered={false} />
          </div>
          <div>
            <p className={innerStyles.colLabel}>Needs from the site</p>
            <Rows items={NEEDS} numbered={false} />
          </div>
        </div>
      </div>
    </section>
  );
}
