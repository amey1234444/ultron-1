/**
 * The component knowledge library (DOC-01 §9).
 *
 * Every component is described with the same six fields DOC-01 uses: purpose,
 * physical inputs, physical outputs, useful observables, main influences and
 * why it matters to BLACKGATE. Fault signatures are absent on purpose — DOC-01 §9
 * defers those to DOC-04, and inventing them here would put failure modes in
 * front of an operator that no document has approved.
 *
 * `alwaysPresent: false` marks the equipment DOC-01 qualifies with "if
 * installed": the side feeder and the vent/vacuum system. Analytics that assume
 * either is present will be wrong on a machine that has neither.
 */

import type { ComponentDefinition } from './types';

const COMMON = 'COMMON' as const;
const TSE = 'TSE_SPECIFIC' as const;

export const TSE_COMPONENT_LIBRARY: readonly ComponentDefinition[] = [
  {
    componentId: 'CD-MOTOR',
    assetId: 'DRV.MOTOR',
    name: 'Main Motor',
    purpose: 'Converts electrical power into rotating mechanical power for the extruder drive.',
    physicalInputs: ['Electrical supply', 'VFD command or speed reference', 'Mechanical load reflected through the gearbox'],
    physicalOutputs: ['Shaft speed', 'Torque capability', 'Heat', 'Electrical current and power'],
    usefulObservables: ['Current', 'Active power', 'Motor speed', 'DE and NDE bearing temperature', 'Overall vibration'],
    mainInfluences: ['Process load', 'Gearbox condition', 'Commanded speed', 'Cooling and ambient conditions'],
    whyItMatters:
      'Provides the torque and speed that ultimately determine screw rotation. Abnormal load propagates into current, power and thermal behaviour.',
    measurementLocationIds: ['ML-MOTOR'],
    knowledgeClass: COMMON,
    alwaysPresent: true,
  },
  {
    componentId: 'CD-VFD',
    assetId: 'DRV.VFD',
    name: 'Variable Frequency Drive',
    purpose: 'Controls motor speed and provides drive-side measurements and diagnostics.',
    physicalInputs: ['Speed or torque command', 'Electrical supply', 'Motor feedback or estimation'],
    physicalOutputs: ['Motor voltage, current and frequency', 'Speed control', 'Torque and power estimates', 'Diagnostic and trip codes'],
    usefulObservables: ['Actual speed', 'Actual current', 'Active power where available', 'Torque estimate', 'Drive status and trip codes'],
    mainInfluences: ['Control strategy', 'Motor data configuration', 'DC-bus and supply condition', 'Mechanical and process load'],
    whyItMatters:
      'An important existing data source. BLACKGATE should prefer trustworthy VFD values rather than duplicating sensors unnecessarily.',
    measurementLocationIds: ['ML-MOTOR'],
    knowledgeClass: COMMON,
    alwaysPresent: true,
  },
  {
    componentId: 'CD-COUPLING',
    assetId: 'DRV.COUPLING',
    name: 'Coupling',
    purpose: 'Transfers torque from motor to gearbox while accommodating the intended alignment and flexibility.',
    physicalInputs: ['Motor shaft torque and speed'],
    physicalOutputs: ['Gearbox input torque and speed', 'Mechanical reaction forces'],
    usefulObservables: ['Vibration near the motor and gearbox', 'Temperature only if instrumented'],
    mainInfluences: ['Alignment', 'Installation', 'Wear', 'Transmitted load'],
    whyItMatters:
      'Mechanical abnormalities here may show in both motor and gearbox vibration. Detailed vibration diagnosis belongs to Advanced CM.',
    measurementLocationIds: ['ML-MOTOR', 'ML-GEARBOX'],
    knowledgeClass: COMMON,
    alwaysPresent: true,
  },
  {
    componentId: 'CD-GEARBOX',
    assetId: 'DRV.GEARBOX',
    name: 'Gearbox / Twin-Shaft Drive',
    purpose: 'Reduces speed and transmits or splits torque to the two screw shafts.',
    physicalInputs: ['Motor torque and speed', 'Lubrication and cooling'],
    physicalOutputs: ['Lower-speed, higher-torque twin-shaft output', 'Heat'],
    usefulObservables: ['Oil temperature', 'Bearing temperature where available', 'Overall vibration', 'Input and output speed', 'Load or torque'],
    mainInfluences: ['Process torque', 'Lubrication', 'Cooling', 'Bearing and gear condition', 'Ambient'],
    whyItMatters: 'Connects process resistance to motor electrical load, and is a critical mechanical asset in its own right.',
    measurementLocationIds: ['ML-GEARBOX'],
    knowledgeClass: TSE,
    alwaysPresent: true,
  },
  {
    componentId: 'CD-MAIN-FEEDER',
    assetId: 'FEED.MAIN',
    name: 'Main Feeder',
    purpose: 'Meters the primary polymer or raw-material stream at a controlled mass or volumetric rate.',
    physicalInputs: ['Material in hopper', 'Rate setpoint', 'Feeder drive'],
    physicalOutputs: ['Material mass flow into the TSE'],
    usefulObservables: ['Actual feed rate', 'Feed setpoint', 'Feeder drive load', 'Refill status', 'Alarm and status'],
    mainInfluences: ['Bulk density', 'Refill', 'Bridging', 'Material flowability', 'Feeder calibration'],
    whyItMatters:
      'Feed is a primary process-context variable. Changes to it legitimately affect torque, fill, pressure and throughput, and are not faults by themselves.',
    measurementLocationIds: ['ML-MAIN-FEEDER'],
    knowledgeClass: TSE,
    alwaysPresent: true,
  },
  {
    componentId: 'CD-SIDE-FEEDER',
    assetId: 'FEED.SIDE',
    name: 'Side Feeder',
    purpose: 'Introduces fillers, fibres, additives or secondary solids at a downstream process location.',
    physicalInputs: ['Secondary material', 'Rate setpoint', 'Local melt condition'],
    physicalOutputs: ['Secondary material flow into the TSE'],
    usefulObservables: ['Side-feed rate', 'Feeder load and status', 'Main-process response'],
    mainInfluences: ['Local screw fill and pressure', 'Side-stuffer capacity', 'Material bulk density'],
    whyItMatters: 'Must be included in context and fault logic whenever it is active.',
    measurementLocationIds: ['ML-SIDE-FEEDER'],
    knowledgeClass: TSE,
    alwaysPresent: false,
  },
  {
    componentId: 'CD-FEED-THROAT',
    assetId: 'FEED.THROAT',
    name: 'Feed Throat',
    purpose: 'Transfers solids from the feeder into the screw channels without unintended softening or blockage.',
    physicalInputs: ['Fed solids', 'Local cooling and temperature', 'Screw conveying action'],
    physicalOutputs: ['Stable solids entry'],
    usefulObservables: ['Feed behaviour', 'Throat temperature where available', 'Feeder load'],
    mainInfluences: ['Material softening point', 'Cooling', 'Bulk density', 'Screw fill'],
    whyItMatters: 'Poor inlet behaviour can look like feeder instability; topology is what separates the two.',
    measurementLocationIds: ['ML-MAIN-FEEDER'],
    knowledgeClass: TSE,
    alwaysPresent: true,
  },
  {
    componentId: 'CD-SCREWS',
    assetId: 'PROC.SCREW_A',
    name: 'Twin Screws',
    purpose:
      'Perform conveying, melting, mixing, devolatilisation support and pressure generation according to the element sequence.',
    physicalInputs: ['Motor and gearbox torque', 'Fed material', 'Thermal boundary conditions'],
    physicalOutputs: ['Material transport', 'Shear and energy input', 'Mixing', 'Pressure development'],
    usefulObservables: ['Screw RPM', 'Torque', 'Power and specific energy', 'Process pressure and temperature response'],
    mainInfluences: ['Element geometry', 'Screw RPM', 'Feed rate', 'Viscosity', 'Material state'],
    whyItMatters: 'The central coupling between mechanical power and process behaviour.',
    measurementLocationIds: ['ML-SCREW-OUTPUT'],
    knowledgeClass: TSE,
    alwaysPresent: true,
  },
  {
    componentId: 'CD-BARREL',
    assetId: 'PROC.BARREL',
    name: 'Barrel and Zones',
    purpose: 'Contains the process and provides controlled thermal boundary conditions around the screw elements.',
    physicalInputs: ['Heater and cooling energy', 'Mechanical and process heat'],
    physicalOutputs: ['Barrel temperature profile', 'Heat exchange with the material'],
    usefulObservables: ['Zone actual temperature', 'Zone setpoint', 'Heater and cooling output where available'],
    mainInfluences: ['Setpoint profile', 'Process heat', 'Cooling availability', 'Sensor placement'],
    whyItMatters: 'Zone number alone does not define function. Zone function is configuration data.',
    measurementLocationIds: ['ML-BARREL-ZONES'],
    knowledgeClass: TSE,
    alwaysPresent: true,
  },
  {
    componentId: 'CD-HEATING',
    assetId: 'THERM.HEAT',
    name: 'Heating System',
    purpose: 'Adds thermal energy to barrel zones during warm-up and as needed during production.',
    physicalInputs: ['Controller command', 'Electrical energy'],
    physicalOutputs: ['Heat to the barrel'],
    usefulObservables: ['Heater output or current where available', 'Zone temperature response'],
    mainInfluences: ['Heater condition', 'SSR, contactor or control output', 'Process heat load'],
    whyItMatters:
      'A high melt temperature can occur even at low heater output, because mechanical shear also generates heat. Heater output is the signal that separates the two.',
    measurementLocationIds: ['ML-BARREL-ZONES'],
    knowledgeClass: COMMON,
    alwaysPresent: true,
  },
  {
    componentId: 'CD-COOLING',
    assetId: 'THERM.COOL',
    name: 'Cooling System',
    purpose: 'Removes heat from barrel and process zones to control the temperature profile.',
    physicalInputs: ['Cooling command', 'Water or air utility'],
    physicalOutputs: ['Heat removal'],
    usefulObservables: ['Cooling output or valve position', 'Supply and return temperature', 'Flow where available'],
    mainInfluences: ['Utility temperature and flow', 'Valve or fan response', 'Process heat generation'],
    whyItMatters: 'Cooling effectiveness is only interpretable together with zone temperature and process load.',
    measurementLocationIds: ['ML-COOLING-UTILITY', 'ML-BARREL-ZONES'],
    knowledgeClass: COMMON,
    alwaysPresent: true,
  },
  {
    componentId: 'CD-VENT',
    assetId: 'VENT.VACUUM',
    name: 'Vent / Vacuum System',
    purpose:
      'Removes entrained air, moisture or volatile species from a suitable low-pressure, partially filled process region.',
    physicalInputs: ['Vacuum pump or system', 'Exposed melt surface', 'Volatile load'],
    physicalOutputs: ['Gas and volatile removal'],
    usefulObservables: ['Vacuum pressure', 'Pump status', 'Vent condition where instrumented'],
    mainInfluences: ['Screw fill and melt seal', 'Process temperature', 'Volatile load', 'Vent blockage or flooding'],
    whyItMatters: 'Vacuum behaviour is meaningful only if the machine is actually configured for venting in that section.',
    measurementLocationIds: ['ML-VACUUM'],
    knowledgeClass: TSE,
    alwaysPresent: false,
  },
  {
    componentId: 'CD-MELT-PRESSURE',
    assetId: 'PROC.BARREL',
    name: 'Melt Pressure Measurement Points',
    purpose:
      'Measure process resistance and pressure at defined physical locations such as pre-screen, post-screen or die.',
    physicalInputs: ['Local melt pressure'],
    physicalOutputs: ['Electrical or digital pressure signal'],
    usefulObservables: ['Pressure value', 'Transmitter diagnostics and status'],
    mainInfluences: ['Tap location', 'Transmitter range', 'Melt temperature', 'Blockage at the pressure port'],
    whyItMatters:
      'Location metadata is essential. "Pressure = 90 bar" is not interpretable without knowing where it is measured.',
    measurementLocationIds: ['ML-PRE-SCREEN', 'ML-POST-SCREEN'],
    knowledgeClass: TSE,
    alwaysPresent: true,
  },
  {
    componentId: 'CD-SCREEN',
    assetId: 'DOWN.SCREEN',
    name: 'Screen / Filter',
    purpose: 'Filters contaminants and creates a pressure drop that changes as restriction increases.',
    physicalInputs: ['Melt flow'],
    physicalOutputs: ['Filtered melt', 'Pressure drop'],
    usefulObservables: ['Pre-screen pressure', 'Post-screen pressure', 'Calculated differential where both exist'],
    mainInfluences: ['Screen mesh', 'Contamination', 'Throughput', 'Viscosity'],
    whyItMatters: 'A dedicated upstream and downstream pressure pair significantly improves restriction localisation.',
    measurementLocationIds: ['ML-PRE-SCREEN', 'ML-POST-SCREEN'],
    knowledgeClass: TSE,
    alwaysPresent: true,
  },
  {
    componentId: 'CD-DIE',
    assetId: 'DOWN.DIE',
    name: 'Adapter / Die / Downstream Melt Path',
    purpose: 'Transfers and shapes the melt into the downstream process or product geometry.',
    physicalInputs: ['Melt flow'],
    physicalOutputs: ['Product flow, strand, profile or pellet-feed condition'],
    usefulObservables: ['Die or downstream pressure', 'Melt temperature', 'Throughput', 'Product quality where available'],
    mainInfluences: ['Geometry', 'Restriction', 'Temperature', 'Product setup'],
    whyItMatters:
      'Downstream configuration changes can change the normal pressure baseline even when the extruder itself is unchanged.',
    measurementLocationIds: ['ML-POST-SCREEN', 'ML-MELT-OUTLET'],
    knowledgeClass: TSE,
    alwaysPresent: true,
  },
] as const;

const BY_ID = new Map(TSE_COMPONENT_LIBRARY.map((component) => [component.componentId, component]));

export function componentDefinition(componentId: string): ComponentDefinition | undefined {
  return BY_ID.get(componentId);
}

export function componentsForAsset(assetId: string): ComponentDefinition[] {
  return TSE_COMPONENT_LIBRARY.filter((component) => component.assetId === assetId);
}

/** Components DOC-01 qualifies with "if installed". */
export function optionalComponents(): ComponentDefinition[] {
  return TSE_COMPONENT_LIBRARY.filter((component) => !component.alwaysPresent);
}
