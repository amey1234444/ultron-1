// Pipeline — how a reading becomes an instruction, in five stages.
//
// One line per stage and nothing else. The four capabilities above are the
// claims; this is the order they run in, and the reader who wants the long
// version has a link to it rather than four paragraphs here.

import styles from './Pipeline.module.css';
import { InnerHead, innerStyles } from '../pages/inner';
import { useInView } from '../home/primitives';

type Stage = {
  name: string;
  body: string;
};

const STAGES: Stage[] = [
  {
    name: 'Ingest',
    body: 'Read existing feeds — historian, PLC or file drop — with source, unit and quality intact.',
  },
  {
    name: 'Map',
    body: 'Bind each reading to one instrument on one component, or leave the gap named.',
  },
  {
    name: 'Baseline',
    body: 'Learn normal from the asset’s own healthy running, and re-fit it as the plant drifts.',
  },
  {
    name: 'Detect',
    body: 'Read points that move together as one finding, not as four separate excursions.',
  },
  {
    name: 'Instruct',
    body: 'Turn the finding into a maintenance window the production plan can take.',
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
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
