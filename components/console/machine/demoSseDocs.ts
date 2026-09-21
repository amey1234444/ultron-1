export const HEALTHY_SSE_INPUT_VALUES = [
  'Motor DE Vibration: 1.50 mm/s RMS | Full range 0-15 | Configured limits H 2.8 | HH 7.1',
  'Motor NDE Vibration: 1.40 mm/s RMS | Full range 0-15 | Configured limits H 2.8 | HH 7.1',
  'Motor Temperature: 45 °C | Full range 0-150 | Configured limits H 75 | HH 90',
  'Motor RPM: 2000 RPM | Full range 0-3000 | Configured limits LL 1800 | L 1900 | H 2100 | HH 2200',
  'Motor Power: 18 kW | Full range 0-40 | Configured limits H 24 | HH 30',
  'Gearbox Input Vibration: 1.50 mm/s RMS | Full range 0-15 | Configured limits H 2.8 | HH 7.1',
  'Gearbox Output Vibration: 1.60 mm/s RMS | Full range 0-15 | Configured limits H 2.8 | HH 7.1',
  'Gearbox Temperature: 52 °C | Full range 0-150 | Configured limits H 70 | HH 85',
  'Hopper Level: 70 % | Full range 0-100 | Configured limits LL 15 | L 30 | H 90 | HH 95',
  'Zone 1 Temperature: 200 °C | Full range 0-300 | Configured limits LL 180 | L 190 | H 210 | HH 220',
  'Zone 2 Temperature: 200 °C | Full range 0-300 | Configured limits LL 180 | L 190 | H 210 | HH 220',
  'Zone 3 Temperature: 200 °C | Full range 0-300 | Configured limits LL 180 | L 190 | H 210 | HH 220',
  'Melt Temperature: 220 °C | Full range 0-300 | Configured limits LL 200 | L 210 | H 230 | HH 240',
  'Melt Pressure: 8.0 MPa | Full range 0-20 | Configured limits LL 5.6 | L 6.8 | H 9.2 | HH 10.4',
  'Screw RPM: 65 RPM | Full range 0-150 | Configured limits LL 58.5 | L 61.75 | H 68.25 | HH 71.5',
] as const;

export const HEALTHY_SSE_INPUT_SOURCE =
  'All 15 current values are HEALTHY. Vibration points also have real/simulated raw acceleration waveform samples for analyst plots. Healthy history is available for trend and prognosis display.';

export const HEALTHY_SSE_OVERVIEW_TOP_SUMMARY = [
  'Machine: Single-Screw Extruder (SSE)  |  Operating state: RUNNING  |  Data quality: GOOD.',
  'Overall machine condition: HEALTHY.',
  'Machine health score: near 100/100 (calculated from the healthy demo dataset).',
  'Active problems: 0  |  DANGER: 0  |  ALERT: 0.',
  'All 15/15 configured measurement points available.',
] as const;

export const HEALTHY_SSE_COMPLETE_HEALTH = [
  'Mechanical: HEALTHY.',
  'Drive / Load: HEALTHY.',
  'Heating / Thermal: HEALTHY.',
  'Pressure Generation: HEALTHY.',
  'Material Feeding: HEALTHY.',
  'Overall Extrusion Process: HEALTHY.',
] as const;

export const HEALTHY_SSE_TRAIN_HEALTH = [
  'Motor: HEALTHY.',
  'Gearbox: HEALTHY.',
  'Screw / Extrusion section: HEALTHY.',
  'Barrel / Zones: HEALTHY.',
  'Feeding: HEALTHY.',
  'Melt path: HEALTHY.',
] as const;

export const HEALTHY_SSE_LIVE_EVIDENCE = [
  'Show all 15 current sensor values with their correct engineering units and HEALTHY status.',
  'Show the configured L / H or LL / L / H / HH boundaries on the gauges/trends.',
  'Show one healthy machine-condition trend with no Alert or Danger event.',
  'Show "No active fault detected" and "No immediate action required".',
] as const;

export const HEALTHY_SSE_OVERVIEW_MESSAGE =
  'The operator should understand in a few seconds: the machine is running normally, the process is healthy, all measurements are available, and ULTRON is not creating a false fault.';

export const HEALTHY_SSE_DIAGNOSIS_RESULT = [
  'Complete Machine: HEALTHY.',
  'Diagnosis: No active mechanical, thermal, feeding, pressure, speed or process fault detected.',
  'Problem groups: 0.',
  'Highest-priority problem: None.',
  'Corrective action: None required; continue normal monitoring.',
] as const;

export const HEALTHY_SSE_DIAGNOSIS_EVIDENCE = [
  'Motor and gearbox vibration remain within the configured healthy region.',
  'Motor and screw speed are at their healthy operating values and their ratio is normal.',
  'Motor power/load is normal.',
  'Motor and gearbox temperatures are normal.',
  'Zone 1-3 and melt temperature are normal.',
  'Melt pressure is normal.',
  'Hopper level is normal.',
  'No meaningful contradictory pattern or abnormal cross-sensor relationship is present.',
] as const;

export const HEALTHY_SSE_EVIDENCE_STATUS = [
  'Supporting evidence: healthy/normal evidence only.',
  'Contradicting evidence against a healthy conclusion: none material.',
  'Processing coverage: show all processing that was successfully performed from available source data.',
  'Additional physical evidence required: none for the Healthy SSE demonstration.',
] as const;

export const HEALTHY_SSE_DIAGNOSIS_MESSAGE =
  'Diagnosis must not invent a motor, gearbox, bearing, gear, thermal or process fault just to fill the page. The correct diagnosis for Demo 1 is a healthy machine.';

export const HEALTHY_SSE_PROGNOSIS_CONDITION = [
  'Current machine condition: HEALTHY.',
  'Historical period: 120 days of stable healthy operation.',
  'Degradation status: No meaningful degradation detected.',
  'Trend direction: STABLE.',
  'No persistent upward bearing, gear, vibration, temperature, pressure or load degradation pattern.',
] as const;

export const HEALTHY_SSE_FORECAST = [
  'Projected ALERT crossing: No reliable crossing predicted.',
  'Projected DANGER crossing: No reliable crossing predicted.',
  'Validated RUL: Not applicable for this healthy demonstration.',
  'Maintenance recommendation: Continue routine/planned maintenance.',
  'Prediction panel should clearly say that no significant degradation forecast is currently available.',
] as const;

export const HEALTHY_SSE_PROGNOSIS_PLOTS = [
  '120-day machine-health trend - stable.',
  'Selected sensor / feature degradation trend - stable around the healthy baseline.',
  'Forecast plot - history remains stable with no artificial threshold crossing.',
  'Maintenance/event timeline - only routine events if present.',
] as const;

export const HEALTHY_SSE_PROGNOSIS_MESSAGE =
  'Demo 1 should prove that ULTRON does not create a future failure date when the historical evidence does not support one.';

export const HEALTHY_SSE_ADVANCED_DEFAULT = [
  'Gearbox Output Vibration - healthy reference signal.',
  'Show sensor ID, location, direction, unit, sample rate, sample count, duration, RPM, operating state and data quality.',
  'Allow the analyst to switch to any of the other SSE measurements.',
] as const;

export const HEALTHY_SSE_ADVANCED_PLOTS = [
  ['Raw acceleration waveform', 'X: Time (s)  |  Y: Acceleration (g or m/s²)'],
  ['Velocity waveform', 'X: Time (s)  |  Y: Velocity (mm/s)'],
  ['Filtered / bandpass waveform', 'X: Time (s)  |  Y: same engineering signal unit'],
  ['Envelope time waveform', 'X: Time (s)  |  Y: Envelope amplitude'],
  ['FFT spectrum', 'X: Frequency (Hz)  |  Y: correctly scaled amplitude'],
  ['PSD', 'X: Frequency (Hz)  |  Y: Power spectral density, correct unit²/Hz'],
  ['Order spectrum', 'X: Order (X)  |  Y: Amplitude'],
  ['Envelope FFT', 'X: Frequency (Hz)  |  Y: Envelope amplitude'],
  ['Waterfall / historical spectra', 'X: Frequency (Hz)  |  History/Snapshot axis  |  Amplitude encoded consistently'],
  ['Trend', 'X: Date/Time  |  Y: Selected measurement engineering unit'],
] as const;

export const HEALTHY_SSE_ADVANCED_CONTROLS = [
  'Zoom, pan, reset zoom, single cursor and delta cursor.',
  'Current vs healthy-reference compare/overlay with matched scales and units.',
  'Peak markers, 1X/2X/order markers and other markers only when the required inputs exist.',
  'FFT window, frequency range, linear/log display and bandpass selection.',
  'Healthy waveform/spectrum should show no convincing bearing, gear or other fault signature.',
] as const;

export const FAULTY_SSE_OVERVIEW_ROWS = [
  ['Complete Machine', 'ALERT'],
  ['Complete Process', 'ALERT'],
  ['Primary Problem', 'Increased Process Resistance / Downstream Restriction'],
  ['Likely Location', 'Downstream melt path - screen pack / die region'],
] as const;

export const FAULTY_SSE_OVERVIEW_SHOULD_SHOW = [
  'Machine is running but operating abnormally under increased process load.',
  'Active problem groups: 1 main related problem group, not many separate sensor faults.',
  'Highest-priority problem: Increasing Process Resistance.',
  'Pressure Generation: ALERT.',
  'Material Conveying / Melt Path: ALERT.',
  'Drive Loading: ALERT.',
  'Material Feeding: HEALTHY.',
  'Heating / Barrel Zones: HEALTHY.',
  'Motor: ALERT due to elevated load response, not automatically a motor defect.',
  'Gearbox: load affected; do not show a confirmed gearbox defect without spectral evidence.',
  'Melt Pressure 10.0 MPa, Motor Power 27 kW, Motor RPM 1875 RPM, Screw RPM 60.9 RPM as the strongest live evidence.',
  'Motor DE/NDE and Gearbox Output vibration elevated as secondary load-related evidence.',
  'Priority action card: inspect screen pack and downstream die/melt-flow path.',
  'Diagnostic integrity/data quality should show GOOD if all demo inputs are valid.',
] as const;

export const FAULTY_SSE_OVERVIEW_MUST_NOT_SHOW = [
  'Do not show DANGER for the whole machine in this selected demo stage.',
  'Do not show motor bearing failure, gearbox bearing failure, misalignment or gear tooth damage unless real waveform processing supports it.',
  'Do not split each abnormal sensor into a separate top-level fault.',
] as const;

export const FAULTY_SSE_DIAGNOSIS_ROWS = [
  ['Diagnosis', 'Developing downstream process restriction'],
  ['Diagnostic Direction', 'Screen-pack loading or die restriction is the leading cause'],
] as const;

export const FAULTY_SSE_MACHINE_DOCTOR = [
  ['WHAT', 'Increasing resistance to polymer flow is increasing screw torque demand and drive load.'],
  ['WHERE', 'Downstream melt path, primarily screen-pack / die region.'],
  ['WHY', 'Melt pressure is elevated while drive power rises and motor/screw speed fall together.'],
  ['SEVERITY', 'ALERT - developing fault; machine is still running.'],
  ['IMPACT', 'Higher mechanical load, reduced process efficiency and risk of escalation if restriction increases.'],
] as const;

export const FAULTY_SSE_SUPPORTING_EVIDENCE = [
  'Melt Pressure: 10.0 MPa - elevated.',
  'Motor Power: 27 kW - elevated.',
  'Motor RPM: 1875 RPM - reduced.',
  'Screw RPM: 60.9 RPM - reduced.',
  'Motor DE Vibration: 3.2 mm/s RMS - elevated.',
  'Motor NDE Vibration: 2.9 mm/s RMS - elevated.',
  'Gearbox Output Vibration: 3.0 mm/s RMS - elevated.',
  'Motor/Screw speed ratio remains approximately unchanged, arguing against a drivetrain-ratio fault.',
] as const;

export const FAULTY_SSE_LIMITING_EVIDENCE = [
  'Zone 1-3 temperatures remain healthy.',
  'Hopper level remains healthy; no clear feed-starvation evidence.',
  'Gearbox temperature remains healthy.',
  'Motor temperature is elevated from baseline but remains healthy.',
  'No specific bearing/gear fault evidence should be claimed unless real FFT/envelope processing finds it.',
] as const;

export const FAULTY_SSE_CAUSE_RANKING = [
  '1. Screen-pack restriction / loading - MOST LIKELY.',
  '2. Die / downstream restriction - LIKELY.',
  '3. Material viscosity/property change - POSSIBLE.',
  '4. Low melt temperature / inadequate melting - LESS LIKELY.',
  '5. Excessive feed - LOW / insufficient support.',
] as const;

export const FAULTY_SSE_RECOMMENDED_ACTION =
  'Inspect screen-pack differential condition and downstream die/melt-flow path; clean or replace the restricted element if confirmed, then verify pressure, power, speed and vibration return toward baseline.';

export const FAULTY_SSE_PROGNOSIS_ROWS = [
  ['Current Condition', 'ALERT'],
  ['Prediction Mode', 'Limited unless sufficient time history is available'],
] as const;

export const FAULTY_SSE_PROGNOSIS_WHAT = [
  'Current condition is ALERT because the fault already exists now.',
  'If only the single snapshot is loaded: show "No reliable long-term forecast - insufficient degradation history."',
  'If short supporting history is provided: show whether pressure/load are STABLE, WORSENING or IMPROVING.',
  'Show current distance to configured DANGER limits for the main parameters.',
  'Show that prognosis is secondary in Demo 2; the main purpose is current diagnosis.',
  'Never invent days-to-DANGER from the fault name or from a single current value.',
  'Do not call any threshold projection RUL unless a validated failure criterion/model exists.',
] as const;

export const FAULTY_SSE_OPTIONAL_SHORT_HISTORY = [
  'Melt Pressure trend: rising or persistent high if demo history is supplied.',
  'Motor Power trend: rising or persistent high.',
  'Speed trend: falling or persistently below healthy baseline.',
  'Process-resistance indicator: worsening if actual history supports it.',
  'Forecast status: MONITORING or INSUFFICIENT_HISTORY unless enough valid history is present.',
] as const;

export const FAULTY_SSE_MAINTENANCE_GUIDANCE = [
  'Inspect restriction soon rather than waiting for DANGER.',
  'After corrective maintenance, verify melt pressure decreases, motor power decreases, motor/screw speed recover and load-related vibration falls.',
  'If the values do not recover, continue differential diagnosis for material, die, screw/barrel or drive causes.',
] as const;

export const FAULTY_SSE_ADVANCED_PLOTS = [
  ['Trend - Melt Pressure', 'Time', 'MPa', 'Show elevated pressure versus healthy baseline and H/HH limits.'],
  ['Trend - Motor Power', 'Time', 'kW', 'Show increased drive load.'],
  ['Trend - Motor RPM', 'Time', 'RPM', 'Show speed reduction.'],
  ['Trend - Screw RPM', 'Time', 'RPM', 'Show screw speed reduction.'],
  ['Trend - Motor DE Vibration', 'Time', 'mm/s RMS', 'Show elevated vibration response.'],
  ['Raw Vibration Waveform', 'Time (s)', 'Acceleration (g or m/s²)', 'Actual generated/measured waveform only.'],
  ['FFT Spectrum', 'Frequency (Hz)', 'Amplitude with correct vibration unit', 'Show load-related spectrum; no fake bearing markers/evidence.'],
  ['Order Spectrum', 'Order (X)', 'Amplitude', 'Use actual RPM reference.'],
  ['Pressure vs Motor Power', 'Pressure (MPa)', 'Power (kW)', 'Show positive process-load relationship.'],
  ['Pressure vs Screw RPM', 'Screw RPM', 'Pressure (MPa)', 'Show pressure rising as speed/load behavior changes.'],
  ['Correlation / Lag', 'Time lag or aligned time', 'Correlation coefficient', 'Use actual synchronized samples.'],
  ['Current vs Healthy Overlay', 'Same X-axis', 'Same unit/scale', 'Overlay current data with healthy reference.'],
] as const;

export const FAULTY_SSE_ADVANCED_ACTIONS = [
  'Select one sensor at a time with correct engineering scale and unit.',
  'Compare current vs healthy baseline and before/after maintenance.',
  'Overlay only compatible units on one Y-axis; use separate axes or normalization for unlike units.',
  'Zoom, pan, cursors, delta cursors, threshold lines, annotations and event markers.',
  'For vibration: real raw waveform -> FFT/PSD/orders/bandpass/envelope processing; do not fabricate evidence.',
  'Trace any diagnosis evidence back to the exact source sensor/history used.',
] as const;

export const FAULTY_SSE_ADVANCED_CONCLUSION =
  'The combined process and drive evidence is consistent with increased downstream process resistance. The vibration increase is interpreted as load-related unless independent waveform evidence proves a mechanical fault.';

export const PREDICTIVE_SSE_OVERVIEW_ROWS = [
  ['Complete Machine', 'HEALTHY'],
  ['Current Active ALERT/DANGER Problems', '0'],
  ['Predictive Findings', '1 - Early gearbox-output bearing degradation pattern'],
  ['Current Live Measurements', '15 / 15 HEALTHY'],
] as const;

export const PREDICTIVE_SSE_OVERVIEW_SHOULD_SHOW = [
  'Overall machine condition: HEALTHY. The machine is running normally at the current instant.',
  'All 15 current sensor values remain within configured HEALTHY limits.',
  'Gearbox Output Vibration is 2.45 mm/s RMS - still below the H threshold of 2.8 mm/s.',
  'No current DANGER and no current ALERT problem group should be shown.',
  'Predictive Risk card: Gearbox Output Bearing - DEGRADATION DETECTED.',
  'Predictive finding is separated from current machine condition so HEALTHY is not overwritten by a future risk.',
  'Historical trend indicator should show a persistent upward degradation pattern on the gearbox output side.',
  'Priority recommendation: plan inspection during the next suitable maintenance opportunity and continue closer monitoring.',
  'Data quality / diagnostic integrity should show GOOD when the generated data is valid.',
] as const;

export const PREDICTIVE_SSE_SUMMARY_ROWS = [
  ['Current Condition', 'HEALTHY'],
  ['Predictive Status', 'DEGRADATION DETECTED'],
  ['Location', 'Gearbox -> Output Side -> Bearing'],
  ['Projected ALERT', 'Approximately 12-18 days, only if calculated from the generated history'],
  ['Projected DANGER', 'Later horizon; approximately 70-90 days if the calculated model supports it'],
] as const;

export const PREDICTIVE_SSE_OVERVIEW_MUST_NOT_SHOW = [
  'Do not change the current machine condition to ALERT simply because a future degradation trend exists.',
  'Do not show a hardcoded failure date or RUL.',
  'Do not show a bearing fault merely because Part 1 selected a simulation scenario; the predictive finding must come from processed history/waveforms.',
] as const;

export const PREDICTIVE_SSE_DIAGNOSIS_ROWS = [
  ['Current Diagnosis', 'HEALTHY - no current ALERT/DANGER fault'],
  ['Observed Early Pattern', 'Gearbox-output bearing-related degradation indicators under observation'],
  ['Current Fault Severity', 'No current fault escalation; predictive evidence only'],
] as const;

export const PREDICTIVE_SSE_MACHINE_DOCTOR = [
  ['WHAT', 'No present operating limit is exceeded; the machine is currently HEALTHY.'],
  ['WHERE', 'Historical evidence is localized primarily to the gearbox output-side vibration measurement.'],
  ['WHY IT IS BEING WATCHED', 'waveform-derived impulsiveness/envelope features are progressively increasing even though overall RMS remains below ALERT.'],
  ['IMPACT NOW', 'no confirmed current process or production impairment.'],
  ['RISK IF TREND CONTINUES', 'a gearbox-output bearing condition may develop into an ALERT condition in the future.'],
] as const;

export const PREDICTIVE_SSE_SUPPORTING_EVIDENCE = [
  'Gearbox Output Vibration remains HEALTHY but has risen progressively toward its H threshold.',
  'Historical raw waveform snapshots show increasing impulsive content on the gearbox output side.',
  'Part 2-calculated kurtosis and crest factor trend upward across snapshots.',
  'Part 2-calculated envelope energy / bearing-frequency family trend increases over time.',
  'Gearbox Input Vibration remains comparatively stable, helping localize the pattern to the output side.',
  'RPM and operating context remain sufficiently comparable for the trend to be meaningful.',
] as const;

export const PREDICTIVE_SSE_LIMITING_EVIDENCE = [
  'Motor vibration remains healthy and comparatively stable.',
  'Motor power and melt pressure remain healthy, arguing against process-overload as the primary explanation.',
  'Gear-mesh indicators should remain stable if real FFT processing does not support a gear fault.',
  'Current gearbox temperature remains healthy.',
  'No specific outer-race/inner-race conclusion should be shown unless the actual envelope spectrum and metadata support it.',
] as const;

export const PREDICTIVE_SSE_DIAGNOSIS_MESSAGE =
  'Current machine condition is HEALTHY. Historical vibration processing indicates an early localized degradation pattern at the gearbox output side that warrants predictive monitoring, not an immediate current-fault alarm.';

export const PREDICTIVE_SSE_PROGNOSIS_ROWS = [
  ['Current Condition', 'HEALTHY'],
  ['Prediction Status', 'FORECAST AVAILABLE / DEGRADATION DETECTED'],
  ['Prediction Target', 'Time to configured ALERT and DANGER thresholds - not automatic RUL'],
] as const;

export const PREDICTIVE_SSE_PROGNOSIS_WHAT = [
  '120-day historical degradation trend with the present-day point clearly marked.',
  'Degradation onset detected from the historical feature trajectory.',
  'Current gearbox output RMS: 2.45 mm/s RMS, still below H = 2.8 mm/s.',
  'Forecast curve extending into the future from Today.',
  'Projected ALERT crossing: approximately 12-18 days if independently calculated from the generated dataset.',
  'Projected DANGER crossing: later horizon, approximately 70-90 days if supported by the selected model/history.',
  'Prediction interval / uncertainty band around the forecast.',
  'Prediction confidence based on actual model fit, history quality and backtest - not a fixed demo number.',
  'Recommended inspection / maintenance window before the projected ALERT crossing.',
  'Prediction wording: "projected to reach configured threshold" rather than "machine will fail".',
] as const;

export const PREDICTIVE_SSE_FORECAST_PLOTS = [
  ['Degradation Trend', 'Date / Time', 'Selected derived feature or mm/s RMS'],
  ['Forecast + Threshold Crossing', 'Historical + Future Date / Time', 'Same selected feature with H / HH thresholds'],
  ['Prediction Interval', 'Future Date / Time', 'Lower / predicted / upper feature value'],
  ['Health Forecast', 'Date / Time', 'Health score 0-100'],
  ['Backtest', 'Historical Date / Time', 'Predicted vs actual feature / threshold horizon'],
  ['Forecast History', 'Forecast run date', 'Predicted days to threshold'],
] as const;

export const PREDICTIVE_SSE_MAINTENANCE_GUIDANCE = [
  'Increase monitoring frequency for the gearbox output vibration point.',
  'Inspect bearing/lubrication condition during the next planned maintenance window.',
  'After maintenance, verify that the derived bearing features and vibration trend stabilize or fall toward the healthy reference.',
] as const;

export const PREDICTIVE_SSE_ADVANCED_ROWS = [
  ['Selected Measurement', 'Gearbox Output Vibration'],
  ['Comparison', 'Healthy Reference / Day -120 vs Today'],
  ['Primary Goal', 'Prove the predictive finding using real historical waveform processing'],
] as const;

export const PREDICTIVE_SSE_ADVANCED_PLOTS = [
  ['Trend', 'Date / Time', 'mm/s RMS', 'Current value still HEALTHY but progressively rising.'],
  ['Raw Acceleration Waveform', 'Time (s)', 'Acceleration (g or m/s²)', 'Healthy reference vs current; current shows more impulsive content.'],
  ['FFT Spectrum', 'Frequency (Hz)', 'Correct vibration amplitude', 'Compare reference vs current spectral content.'],
  ['PSD', 'Frequency (Hz)', 'Unit²/Hz', 'Broadband / resonance energy comparison.'],
  ['Order Spectrum', 'Order (X)', 'Amplitude', 'Check speed-related components with actual RPM.'],
  ['Envelope Time', 'Time (s)', 'Envelope amplitude', 'Show developing impacts from actual bandpassed waveform.'],
  ['Envelope FFT', 'Frequency (Hz)', 'Envelope amplitude', 'Show calculated bearing-frequency family only if metadata/data support it.'],
  ['Historical Spectrum Overlay', 'Frequency (Hz)', 'Same amplitude scale', 'Day -120 / -30 / Today on one compatible scale.'],
  ['Waterfall', 'Frequency (Hz) + history', 'Amplitude', 'Progressive spectral/envelope evolution across snapshots.'],
  ['Feature Trend', 'Date / Time', 'RMS / kurtosis / crest / band energy', 'Show progression of independently calculated features.'],
  ['Forecast Overlay', 'Date / Time', 'Selected degradation feature', 'Historical data + forecast + H/HH + uncertainty band.'],
] as const;

export const PREDICTIVE_SSE_ADVANCED_ACTIONS = [
  'One sensor at a time with correct engineering units and defined X/Y scales.',
  'Overlay Today vs Healthy Reference and historical snapshots using the same compatible scale.',
  'Zoom, pan, cursor, delta cursor, peak markers, harmonic markers and annotations.',
  'Enable 1X/2X, BPFO/BPFI/BSF/FTF and GMF markers only when their required RPM/metadata are available.',
  'Every FFT, envelope, waterfall and feature value must be calculated from the raw snapshots; no pre-generated diagnostic evidence.',
  'Trace the predictive conclusion back to the exact waveform snapshots and historical features used.',
] as const;

export const PREDICTIVE_SSE_ADVANCED_CONCLUSION =
  'The machine is currently HEALTHY, but the gearbox output-side vibration history shows a persistent localized degradation pattern. The analyst can verify the progression in raw waveform, envelope/spectral evidence, feature trends and forecast without relying on a current alarm threshold crossing.';
