/**
 * Which components of a machine have a health index worth charting.
 *
 * A component qualifies when its instrument points can be trended to an
 * approved limit. That is a property of the template's registry, so it is
 * derived here rather than configured — a template whose points carry a
 * component gets a breakdown, and one whose points do not gets an empty list
 * and no panel.
 *
 * Kept beside the estimator rather than in the console because the server
 * answers per component and has to agree with the selector the operator is
 * choosing from. Two lists would drift and the symptom would be a component
 * that appears in the picker and 404s when selected.
 */
import {
  TWIN_SCREW_COMPONENT_ORDER,
  TWIN_SCREW_POINT_REGISTRY,
} from '../machinePoints/twinScrewExtruderPoints';

export type RulComponentOption = { componentId: string; displayName: string };

/**
 * Only the twin screw, deliberately.
 *
 * It is the one template with a commissioned knowledge layer behind it — the
 * DOC-01..07 chain, the fault library and the analyzer are all written
 * against it — so it is the one where a health index means something a
 * diagnosis can be checked against. Every other registry carries a
 * `component` per point and can be added here in a line once somebody has
 * decided what end of life means for it.
 */
export function rulComponentsForTemplate(template: string): RulComponentOption[] {
  if (template !== 'Twin Screw Extruder') return [];
  const instrumented = new Set(TWIN_SCREW_POINT_REGISTRY.map((point) => point.component));
  return TWIN_SCREW_COMPONENT_ORDER.filter((component) => instrumented.has(component)).map((component) => ({
    componentId: component,
    displayName: component,
  }));
}
