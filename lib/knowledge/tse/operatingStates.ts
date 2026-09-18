/**
 * Qualitative operating-state knowledge (DOC-01 §14) and material influence
 * (DOC-01 §15).
 *
 * DOC-01 §14 is careful about what it is doing: "DOC-01 describes the physics
 * of each state. DOC-02 will turn these descriptions into formal state-
 * detection logic and signal requirements." So there is no detection logic
 * here, and no thresholds — no "steady when RPM varies less than 2% for five
 * minutes". What there is instead is the `interpretationRule` for each state,
 * which is the part later analytics actually needs: what a reading means when
 * the machine is in that state, and what it would be wrong to conclude.
 *
 * `baselineUsable` is the one derived flag, and it earns its place because the
 * same mistake recurs in every condition-monitoring system: applying a steady-
 * production baseline to a startup transient and reporting the transient as a
 * fault. Only STEADY_PRODUCTION is marked usable.
 */

export type OperatingStateId =
  | 'STOPPED'
  | 'WARM_UP'
  | 'READY'
  | 'STARTUP'
  | 'RAMP_UP'
  | 'STEADY_PRODUCTION'
  | 'RECIPE_PRODUCT_CHANGE'
  | 'SHUTDOWN'
  | 'FAULT_TRIP'
  | 'MAINTENANCE_MANUAL_PURGE';

export type OperatingStateKnowledge = {
  stateId: OperatingStateId;
  name: string;
  physicalMeaning: string;
  interpretationRule: string;
  /** Whether a steady-production baseline may be applied in this state. */
  baselineUsable: boolean;
  /** Whether baseline *learning* should be frozen while in this state. */
  freezeBaselineLearning: boolean;
};

export const TSE_OPERATING_STATES: readonly OperatingStateKnowledge[] = [
  {
    stateId: 'STOPPED',
    name: 'Stopped',
    physicalMeaning: 'Screws not rotating and no intentional production feed. The barrel may remain hot after shutdown.',
    interpretationRule: 'Do not interpret elevated residual temperature as a steady-production fault.',
    baselineUsable: false,
    freezeBaselineLearning: true,
  },
  {
    stateId: 'WARM_UP',
    name: 'Warm-up',
    physicalMeaning: 'Heaters drive zone temperatures toward setpoint. Screw RPM and feed are normally zero or near zero.',
    interpretationRule: 'Temperature trajectory and heater response matter more than any production baseline.',
    baselineUsable: false,
    freezeBaselineLearning: true,
  },
  {
    stateId: 'READY',
    name: 'Ready',
    physicalMeaning: 'Required thermal conditions are satisfied but production has not begun.',
    interpretationRule: 'A useful distinction between cold-stopped and thermally-ready-stopped.',
    baselineUsable: false,
    freezeBaselineLearning: true,
  },
  {
    stateId: 'STARTUP',
    name: 'Startup',
    physicalMeaning: 'Screw rotation and feed begin. Torque, current and pressure build, and transient behaviour is expected.',
    interpretationRule: 'A steady baseline must not be applied blindly to an expected transient.',
    baselineUsable: false,
    freezeBaselineLearning: true,
  },
  {
    stateId: 'RAMP_UP',
    name: 'Ramp-up',
    physicalMeaning: 'Feed, RPM and process load are approaching the production target.',
    interpretationRule: 'Context is still changing; stability must be established before a steady baseline is used.',
    baselineUsable: false,
    freezeBaselineLearning: true,
  },
  {
    stateId: 'STEADY_PRODUCTION',
    name: 'Steady production',
    physicalMeaning: 'Recipe, feed, RPM and the relevant setpoints are stable enough for normal production analytics.',
    interpretationRule: 'The primary state for contextual baselines and for most fault logic.',
    baselineUsable: true,
    freezeBaselineLearning: false,
  },
  {
    stateId: 'RECIPE_PRODUCT_CHANGE',
    name: 'Recipe / product change',
    physicalMeaning: 'Material or setpoints change, so expected load, pressure and thermal relationships may shift.',
    interpretationRule: 'Freeze the old baseline learning and transition the context before diagnosing anything.',
    baselineUsable: false,
    freezeBaselineLearning: true,
  },
  {
    stateId: 'SHUTDOWN',
    name: 'Shutdown',
    physicalMeaning: 'Feed decreases or stops, process pressure and load decay, and RPM is reduced or stopped.',
    interpretationRule: 'Expected transients must not become false faults.',
    baselineUsable: false,
    freezeBaselineLearning: true,
  },
  {
    stateId: 'FAULT_TRIP',
    name: 'Fault / trip',
    physicalMeaning: 'The protection or control system has interrupted or limited operation.',
    interpretationRule: 'Record the event and respect plant protection as authoritative.',
    baselineUsable: false,
    freezeBaselineLearning: true,
  },
  {
    stateId: 'MAINTENANCE_MANUAL_PURGE',
    name: 'Maintenance / manual / purge',
    physicalMeaning: 'Machine behaviour is intentionally non-production or manually controlled.',
    interpretationRule: 'Suppress production analytics that do not apply, but preserve the data for service context.',
    baselineUsable: false,
    freezeBaselineLearning: true,
  },
] as const;

const BY_ID = new Map(TSE_OPERATING_STATES.map((state) => [state.stateId, state]));

export function operatingState(stateId: OperatingStateId): OperatingStateKnowledge | undefined {
  return BY_ID.get(stateId);
}

/**
 * Whether a steady-production baseline may be applied right now.
 *
 * Defaults to false for an unknown state. An unrecognised state is not a licence
 * to assume steady production — it is a reason not to.
 */
export function baselineApplies(stateId: string): boolean {
  return BY_ID.get(stateId as OperatingStateId)?.baselineUsable ?? false;
}

/* Material and recipe influence — DOC-01 §15 ---------------------------------- */

export type MaterialInfluence = {
  property: string;
  whyItMatters: string;
  affects: string[];
};

export const TSE_MATERIAL_INFLUENCE: readonly MaterialInfluence[] = [
  {
    property: 'Viscosity / rheology',
    whyItMatters: 'Changes resistance to deformation and to pumping.',
    affects: ['Torque', 'Pressure', 'Energy', 'Mixing behaviour'],
  },
  {
    property: 'Melt / softening behaviour',
    whyItMatters: 'Changes where and how melting occurs.',
    affects: ['Thermal profile', 'Torque transition', 'Residence and mixing'],
  },
  {
    property: 'Filler / fibre loading',
    whyItMatters: 'Can increase process load and abrasiveness, and changes the mixing requirement.',
    affects: ['Torque', 'Energy', 'Pressure', 'Wear and quality context'],
  },
  {
    property: 'Moisture / volatile content',
    whyItMatters: 'Changes the devolatilisation load and may affect product quality.',
    affects: ['Vacuum behaviour', 'Vent load', 'Quality'],
  },
  {
    property: 'Bulk density / flowability',
    whyItMatters: 'Affects feeder performance and solids intake.',
    affects: ['Feed stability', 'Feeder load', 'Throughput'],
  },
  {
    property: 'Additive / pigment concentration',
    whyItMatters: 'Changes composition and potentially viscosity and mixing requirement.',
    affects: ['Energy', 'Quality', 'Recipe context'],
  },
  {
    property: 'Abrasiveness / corrosiveness',
    whyItMatters: 'Affects long-term wear and materials-of-construction decisions.',
    affects: ['Maintenance context — not inferred from process data alone'],
  },
  {
    property: 'Heat sensitivity',
    whyItMatters: 'Limits acceptable temperature, time and shear exposure.',
    affects: ['Thermal and energy interpretation', 'Quality risk'],
  },
] as const;

/**
 * DOC-01 §15's ML rule, kept next to the data it governs.
 *
 * Worth stating in code because it is the failure mode contextual analytics
 * falls into most often: the process genuinely moved, the numbers genuinely
 * changed, and the system reports a fault that is really a recipe change.
 */
export const RECIPE_CHANGE_RULE =
  'A change in recipe or material can legitimately shift torque, pressure, temperature and energy. Such a shift is not a fault by itself. The context change must be marked, and the correct baseline selected or learned, before a fault is diagnosed.';
