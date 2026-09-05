// Pipeline — how a reading becomes an instruction, in five stages.
//
// A horizontal rail of five stages, each with a one-line artefact under it so
// the reader can see what leaves each stage. The rail is drawn once, in white,
// and the stages are drawn on top of it.

import styles from './Pipeline.module.css';
import { InnerHead, innerStyles } from '../pages/inner';
import { useInView } from '../home/primitives';

type Stage = {
  name: string;
  body: string;
  artefact: string;
  out: string;
};

const STAGES: Stage[] = [
  {
    name: 'Ingest',
    body: 'Historian, PLC and gateway feeds arrive as they are — OPC-UA, Modbus, CSV drops — and are stamped with source, unit and quality.',
    artefact: 'A point, with its unit and provenance intact.',
    out: '48k pts / min',
  },
  {
    name: 'Map',
    body: 'Each channel is bound to one instrument on one component. A channel that measures a quantity the instrument does not is refused, not converted.',
    artefact: 'A mapped asset, with its unmapped gaps named.',
    out: '≥ 80 % or held',
  },
  {
    name: 'Baseline',
    body: 'Normal is fitted from the asset’s own healthy running and re-fitted as the plant drifts. Until it exists, nothing downstream is armed.',
    artefact: 'A band, per point, that the plant taught.',
    out: 're-fit weekly',
  },
  {
    name: 'Detect',
    body: 'Points that move together are read together. A single channel excursion is noted; a component’s worth of them is a finding.',
    artefact: 'A finding, with its points, values and limits.',
    out: '3 pts / finding',
  },
  {
    name: 'Instruct',
    body: 'Where the trend can carry it, a forecast cone is drawn; the instruction is placed in a maintenance window the production plan can take.',
    artefact: 'One line per asset: what, how sure, when.',
    out: 'range, not date',
  },
];

export default function Pipeline() {
  const { ref, inView } = useInView<HTMLOListElement>('0px 0px -10% 0px');
  return (
    <section id="pipeline" className={`${innerStyles.section} ${innerStyles.sectionRuled}`}>
      <div className={innerStyles.inner}>
        <InnerHead
          eyebrow="Composition"
          title="From a reading to an *instruction*"
          lead="The four capabilities are stages of one pipeline. Each stage hands the next a specific object, and nothing is armed until the object before it exists."
          more={{ href: '/how-it-works', label: 'The long version' }}
        />

        <ol ref={ref} className={`${styles.rail} ${inView ? styles.shown : ''}`}>
          <span className={styles.line} aria-hidden="true" />
          {STAGES.map((stage, index) => (
            <li
              key={stage.name}
              className={styles.stage}
              style={{ ['--delay' as string]: `${index * 110}ms` }}
            >
              <span className={styles.node} aria-hidden="true">
                <span className={styles.nodeDot} />
              </span>
              <p className={styles.index}>{String(index + 1).padStart(2, '0')}</p>
              <h3 className={styles.name}>{stage.name}</h3>
              <p className={styles.body}>{stage.body}</p>
              <div className={styles.out}>
                <p className={styles.outLabel}>Out</p>
                <p className={styles.outValue}>{stage.out}</p>
                <p className={styles.artefact}>{stage.artefact}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
