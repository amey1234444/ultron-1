# Part 2 Diagnosis Integration - Retry

## Objective

Replace the content shown by the first Analysis depth with the complete Part 2 Diagnosis experience from `F:\Downloads2\Part.zip`, while preserving the existing Ultron console styling and live telemetry.

Target audience: plant reliability engineers and maintenance technicians diagnosing live machine problems.

## Engineering approach for this retry

Do not rewrite or delete `MachineAnalysisOverviewPage.tsx`. The previous attempt failed while applying a large replacement patch.

Instead:

1. Add a focused typed adapter at `components/console/machine/analysis/diagnosisModel.ts`.
2. Add a new screen at `components/console/machine/MachineDiagnosisPage.tsx`.
3. In `AnalysisWorkspace.tsx`, render `MachineDiagnosisPage` for internal view key `overview`, and pass the existing live analysis fields it needs.
4. Update `AnalysisTabs.tsx` labels only:
   - internal `overview` -> visible `DIAGNOSIS`
   - internal `diagnosis` -> visible `PRO DIAGNOSIS`
   - internal `advanced` -> visible `ADVANCED DIAGNOSIS`
5. Update the existing second-depth `MachineAnalysisPage` header/section copy so it visibly says Pro Diagnosis, without changing its evidence behavior.

Keep internal keys unchanged to protect navigation contracts.

## Part 2 source behavior

Reference only these archive sections; do not scan node_modules:

- `ui components/Part2/src/App.tsx`, function `Diagnosis`
- `ui components/Part2/src/styles.css`, diagnosis selectors
- `ui components/Part2/src/domain/types.ts`, problem group / Machine Doctor concepts

Part 2 Diagnosis behavior to reproduce:

- Left active-problem master list with count, condition, primary finding, score label, and selected state.
- Selection updates the right detail pane in-place.
- Selected problem title, component/location, and condition.
- Four-step diagnostic chain: what is happening, physical mechanism, primary likely cause, immediate action.
- Metadata: match score/confidence, evidence coverage, progression, lifecycle.
- Differential cause ranking with supporting/limiting evidence.
- Supporting, contradicting, and missing evidence.
- Sensor evidence table scoped to the selected problem.
- Machine/process/production/quality impact summaries.
- Confirmation checks, corrective options by cause, post-maintenance verification.
- Healthy empty state when no active problems exist.
- A real `Open Pro Diagnosis` action that navigates to the second depth.

## Existing live data mapping

Build the view model only from existing `AnalysisWorkspaceData`:

- `issues`: active problem groups, condition, component, trend, consequence, age, action, current score.
- `signals` and `findings`: scoped sensor and rule evidence.
- `hypothesis` and `hypotheses`: lead and differential explanations.
- `doThis`, `thenConfirm`, `modelCaveat`: correction and verification.
- `chain`, `conclusion`, `dataQuality`: mechanism, uncertainty, and coverage.

Never import Part 2's simulator, Vite shell, engine, extruder configuration, or node_modules. This production page remains machine-template agnostic.

Never present uncalibrated match scores as probability/confidence percentages. Use labels such as `MATCH SCORE 82` and keep the existing model caveat visible. When data cannot establish an impact, mechanism, or verification window, say so directly.

Selected problem behavior:

- Default to the first prioritized issue.
- Keep selection stable across live updates while that issue id still exists.
- If it disappears, select the new first issue.
- Expose `onSelectProblem` to the workspace so opening Pro Diagnosis can retain the selected issue id.

## Visual direction

Dense industrial diagnostic workstation, consistent with the current console.

- Use existing `Panel`, `MachineHeader`, `AnalysisTabs`, `useAppTheme`, `consolePalette`, `conditionHexes`, NativeWind classes, and existing typography.
- Inter for prose; JetBrains Mono for values and micro-labels.
- Current semantic colors only. No decorative hues, gradients, blobs, or marketing-scale typography.
- Desktop: approximately 30/70 master-detail layout.
- Narrow/mobile: master list above detail; no clipping or page-level horizontal overflow.
- Evidence table can use a contained horizontal ScrollView.
- Avoid nested cards: use bordered rows and unframed sub-sections inside the main detail Panel.
- Preserve dark and light theme contrast.
- Images: none.

## Functional and accessibility requirements

- Problem rows are accessible buttons with selected state.
- Every command performs a real action.
- Long text wraps without overlap.
- Empty arrays render explicit states.
- Preserve machine picker, refresh, Machine Overview cross-link, Pro Diagnosis, and Advanced Diagnosis navigation.
- Keep Expo 57 and React Native Web type compatibility. No new dependencies.

## Verification

- `npm run typecheck`
- `git diff --check`
- Use `src/pages/__machine-qa.tsx?view=analysis` for visual QA in dark and light mode when possible.

## Output path

`F:\Downloads2\ultron-1-1783405085-nextjs-vercel-auth`
