/**
 * The prognosis parser, at the boundary it defends.
 *
 * This payload is the ML service's own JSON with `history` bolted on by the
 * route, so its field names are snake_case and its shape is only as reliable as
 * the service. A parser that throws here takes the analysis tab down with it,
 * which is strictly worse than a panel saying the model is unreachable.
 */
import { crossedFaults, dominantHorizon, parsePrognosis } from '../contract';

let failures = 0;
function ok(name: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

const horizon = (minutes: number, probability: number, crossed = false) => ({
  horizon_minutes: minutes,
  probability,
  calibrated: true,
  threshold: 0.6,
  raise_threshold: 0.7,
  clear_threshold: 0.4,
  persistence_met: crossed,
  consecutive_eligible_cycles: crossed ? 3 : 0,
  crossed,
});

const payload = {
  machine_id: 'm-1',
  generated_at: '2026-09-28T10:00:00Z',
  degraded: false,
  prognosis: [
    {
      fault_id: 'f-low',
      fault_name: 'Screw wear',
      horizons: [horizon(15, 0.2), horizon(60, 0.35)],
      history: [{ observed_at: '2026-09-28T09:00:00Z', probability: 0.3 }],
    },
    { fault_id: 'f-high', fault_name: 'Bearing fault', horizons: [horizon(60, 0.91, true)], history: [] },
  ],
};

const parsed = parsePrognosis(payload);
ok('parses both faults', parsed.faults.length === 2, `got ${parsed.faults.length}`);
ok('not degraded', parsed.degraded === false);
ok('keeps machine id and timestamp', parsed.machineId === 'm-1' && parsed.generatedAt === '2026-09-28T10:00:00Z');
ok('maps snake_case horizons', parsed.faults[0].horizons[0].horizonMinutes === 15 && parsed.faults[0].horizons[0].raiseThreshold === 0.7);
ok('keeps stored history', parsed.faults[0].history.length === 1 && parsed.faults[0].history[0].probability === 0.3);

// The dominant horizon is the longest, not the first or the worst: a fault is
// judged on the furthest-out window the model reported for it.
ok('dominant horizon is the longest', dominantHorizon(parsed.faults[0])?.horizonMinutes === 60);
ok('no horizons yields null rather than throwing', dominantHorizon({ faultId: 'x', faultName: null, horizons: [], history: [] }) === null);

const crossed = crossedFaults(parsed);
ok('only crossed faults are returned', crossed.length === 1 && crossed[0].faultId === 'f-high');

// Every shape the route can actually produce must resolve, not throw.
ok('degraded payload resolves', parsePrognosis({ machine_id: 'm-1', degraded: true, prognosis: [], detail: 'offline' }).degraded === true);
ok('degraded detail is kept', parsePrognosis({ degraded: true, detail: 'offline', prognosis: [] }).detail === 'offline');
for (const [label, value] of [['null', null], ['string', 'nope'], ['empty object', {}], ['array', []]] as const) {
  let threw = false;
  let result: ReturnType<typeof parsePrognosis> | null = null;
  try {
    result = parsePrognosis(value);
  } catch {
    threw = true;
  }
  ok(`malformed payload (${label}) resolves instead of throwing`, !threw && result !== null);
}
ok('missing prognosis key yields no faults', parsePrognosis({ machine_id: 'm' }).faults.length === 0);
ok('camelCase field names also parse', parsePrognosis({ machineId: 'm-2', prognosis: [] }).machineId === 'm-2');

console.log(failures === 0 ? '\nml prognosis contract: all checks passed' : `\nml prognosis contract: ${failures} check(s) failed`);
if (failures > 0) process.exit(1);
