/**
 * The two questions the analysis layer answers, and the two depths of each.
 *
 * Diagnosis asks what is wrong with the machine now. Prognosis asks what is
 * going to be wrong with it, and when. They are different questions with
 * different evidence, which is why they are sections rather than sibling tabs,
 * and each is readable at two depths:
 *
 *   Overview   the answer, and what to do about it
 *   Advanced   the evidence the answer was derived from
 *
 * The previous model was one flat row of three, with keys that had drifted
 * away from their labels: the key `overview` rendered the page labelled
 * DIAGNOSIS, and the key `diagnosis` rendered the page labelled PROGNOSIS. A
 * reader of the routing could not tell which page a key opened. These keys say
 * which section and which depth, and nothing else has to be remembered.
 */
export type AnalysisSection = 'diagnosis' | 'prognosis';
export type AnalysisView = 'overview' | 'advanced';

export type AnalysisDepth = `${AnalysisSection}-${AnalysisView}`;

export const ANALYSIS_SECTIONS: readonly {
  key: AnalysisSection;
  label: string;
  hint: string;
}[] = [
  { key: 'diagnosis', label: 'DIAGNOSIS', hint: 'What is wrong now' },
  { key: 'prognosis', label: 'PROGNOSIS', hint: 'What is coming, and when' },
];

export const ANALYSIS_VIEWS: readonly {
  key: AnalysisView;
  label: string;
  hint: Record<AnalysisSection, string>;
}[] = [
  {
    key: 'overview',
    label: 'Overview',
    hint: { diagnosis: 'Condition and actions', prognosis: 'Outlook and forecasts' },
  },
  {
    key: 'advanced',
    label: 'Advanced',
    hint: { diagnosis: 'Signal-level evidence', prognosis: 'Model internals and bounds' },
  },
];

export function depthOf(section: AnalysisSection, view: AnalysisView): AnalysisDepth {
  return `${section}-${view}`;
}

export function sectionOf(depth: AnalysisDepth): AnalysisSection {
  return depth.startsWith('prognosis') ? 'prognosis' : 'diagnosis';
}

export function viewOf(depth: AnalysisDepth): AnalysisView {
  return depth.endsWith('advanced') ? 'advanced' : 'overview';
}

/** The depth a reader lands on when they pick a section from the section row. */
export const DEFAULT_DEPTH: AnalysisDepth = 'diagnosis-overview';

export function labelOf(depth: AnalysisDepth): string {
  const section = ANALYSIS_SECTIONS.find((s) => s.key === sectionOf(depth))!;
  const view = ANALYSIS_VIEWS.find((v) => v.key === viewOf(depth))!;
  return `${section.label} · ${view.label}`;
}
