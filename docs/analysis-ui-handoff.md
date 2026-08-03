# Analysis UI Handoff

The analyzer zip did not include a finished React/Next UI. It provided Python domain/service code, CLI/report outputs, tests, and docs. The current app now exposes the analyzer as in-app TypeScript data and Next API routes so UI can be built without deploying a separate service.

## Existing Overview Integration

The Machine -> Overview tab already renders compact analyzer panels from `components/studio/machine/MachineOverview.tsx`:

- Readiness
- Operating state
- Condition
- Derived values
- Analysis limits
- Signal quality
- Probable condition
- Evidence ranking
- Deep analyzer: anomaly, maintenance, Machine Doctor, quality, baseline lifecycle

## API Contract

`POST /api/analysis/machine/:id`

Runs analysis for the machine using saved canvas mappings and current gateway telemetry. Persists a snapshot, quality rows, baselines, anomaly episode rows, and maintenance case rows.

`GET /api/analysis/machine/:id`

Returns:

```json
{
  "latest": {},
  "snapshots": [],
  "episodes": [],
  "cases": []
}
```

`latest` is the full `RotaryAirlockAnalysisResult` payload from `lib/analysis/rotaryAirlockAnalyzer.ts`.

## UI Screens To Build

- Analysis history: list `snapshots` by generated time, readiness, state, anomaly severity, top condition.
- Signal quality: table from `latest.quality`, grouped by `GOOD`, `DEGRADED`, `BAD`, `UNAVAILABLE`.
- Baselines: table from `latest.baselines`, showing maturity, sample count, median, MAD, limitations.
- Anomaly episodes: timeline from `episodes`, with severity, score, contributors, resolved state.
- Diagnosis: ranked cards from `latest.diagnoses`, showing support, contradiction, limitations, action, inspection.
- Maintenance cases: workflow from `cases`, with open/closed state, priority, recommended actions, verification steps.
- Machine Doctor report: `latest.doctorReport`, with summary, safety, what changed, next checks, caveats.
- Plant overview: aggregate `latest.plantSummary` across machines once plant-level page wiring is added.

## Gateway Data Requirements

For real gateway values to appear:

- Gateway and rack devices must be bound to the same `gateway_id` and `rack_id` sent by `ultron-gateway`.
- Rack cards must use the same physical slot numbers.
- Saved machine boxes must map to the correct rack channel IDs.
- Gateway telemetry should include `channel_id`, `channel_number`, or `channel` when a card has more than one channel.
- Measurements must be valid and quality `GOOD` to be used as trusted analyzer evidence.

## Implemented In App

- In-app analyzer engine: `lib/analysis/rotaryAirlockAnalyzer.ts`
- Server runner/persistence: `src/server/analysis.ts`
- API: `src/pages/api/analysis/machine/[id].ts`
- Database schema: `src/server/db.ts`
- Supabase migration: `supabase/migrations/20260803000000_in_app_analysis_layer.sql`
- Per-channel gateway persistence: `src/server/mqttIngest.ts`, `services/mqtt-ingest/handlers.js`
