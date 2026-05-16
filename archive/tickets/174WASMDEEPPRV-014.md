# 174WASMDEEPPRV-014: Phase 4c — Diagnose failed post-011 residual owner

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — diagnostic telemetry or measurement harness only, unless reassessment identifies a smaller generic runtime owner
**Deps**: `tickets/174WASMDEEPPRV-009.md`

## Problem

`tickets/174WASMDEEPPRV-009.md` recorded a Phase 4 **Fail** verdict after the post-011 15-seed witness. The slow-tier median regressed from the post-008 baseline `27211.75 ms` to `62042.20 ms`, while the witness recorded production preview-drive route count `181` and unsupported count `3394`.

The architectural blocker is not yet narrow enough for a default flip or a direct optimization ticket. The largest residual class, `coupArvnRedeployPolice:chooseOne`, recorded `275891.21 ms` of measured agent-call time with `0` production preview-drive route and `0` unsupported counts. Several other slow classes record large unsupported counts, but the current witness only exposes unsupported activity by microturn class, not by the lower-level `unsupportedDriveClass` / `unsupportedOwner` reason.

## Assumption Reassessment (2026-05-16)

1. `reports/174-phase-4-gate-decision.md` records a Fail verdict and explicitly blocks `archive/tickets/174WASMDEEPPRV-010.md`.
2. `reports/174-phase-4-architectural-blocker.md` identifies both unsupported-count residuals and zero-counter high-wall-time residuals.
3. The existing witness CSV now records `wasmProductionPreviewDriveRouteCount`, `wasmProductionPreviewDriveUnsupportedCount`, and `wasmProductionPreviewDriveBatchCount` per decision, but not the exact unsupported reason per row.

## Architecture Check

1. Foundation #20 requires unsupported preview-drive provenance to remain explicit; this ticket must expose the missing reason-granular evidence rather than treating unsupported counts as scalar noise.
2. Foundation #1 still forbids FITL-specific runtime branches. Any retained code must be generic over preview-drive classes, token/query workloads, or measurement telemetry.
3. Foundation #16 requires the next owner to prove the residual classification through a repeatable witness before reopening the default-flip path.

## What to Change

### 1. Reason-granular residual evidence

Extend the smallest generic telemetry or witness surface needed to attribute production preview-drive unsupported counts by `unsupportedDriveClass` and owner/reason. Preserve the existing counter totals.

### 2. Zero-counter residual classification

Explain why `coupArvnRedeployPolice:chooseOne` and other high-wall-time classes record no production preview-drive route or unsupported counts. Classify each dominant zero-counter class as:

- bypassing the preview-drive route;
- hidden unsupported/fallback without reason-granular telemetry;
- dominated by token/query/runtime work outside the preview-drive route; or
- measurement-boundary artifact.

### 3. Next-owner decision

Produce a short report that names the next non-overlapping implementation owner, or records why no further Spec 174 default-flip path remains valid without a respec.

## Files to Touch

- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (modify if witness telemetry needs reason-granular fields)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` (modify to render the new reason-granular fields)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify only if the existing runtime counters cannot expose reason-granular telemetry through a narrower script-side seam)
- `packages/engine/src/agents/policy-wasm-runtime-counters.ts` (new counter module extracted from `policy-wasm-runtime.ts` to avoid growing the oversized runtime file)
- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify only to attach broad-route unsupported detail to existing counter increments)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify only to attach deep-continuation unsupported detail to existing counter increments)
- `packages/engine/test/unit/agents/policy-wasm-runtime-preview-drive-counters.test.ts` (modify because telemetry code changed)
- `reports/174-phase-4c-residual-owner.md` (new)
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4c-residual.md` (new witness output)
- `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4c-residual.csv` (new witness CSV)
- `tickets/174WASMDEEPPRV-015.md` (new follow-up owner if Phase 4c selects a non-overlapping implementation owner)
- `specs/174-wasm-preview-drive-coverage-extension.md` (modify only for ticket-list/outcome parity)
- `archive/tickets/174WASMDEEPPRV-010.md` (modify only if a later Pass path is reauthorized)

## Out of Scope

- No default flip or A/B deletion.
- No FITL-specific runtime branch.
- No profile retuning, GameSpecDoc changes, or budget weakening.

## Acceptance Criteria

### Tests That Must Pass

1. The residual-owner report names the exact reason-granular unsupported classes or records why the live route exposes no unsupported reason for a dominant class.
2. If telemetry code changes, focused tests prove the new diagnostic fields do not change route activation semantics.
3. Existing engine suite remains green: `pnpm turbo test`.

### Invariants

1. Unsupported/fallback success cannot count as supported WASM route activation.
2. The next owner is non-overlapping with rejected ticket 010's default-flip path.

## Test Plan

### New/Modified Tests

1. Add or update focused telemetry tests only if production code changes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds <bounded set> --timeout-ms 400000 --date <YYYY-MM-DD>-phase-4c-residual --profile-buckets`
3. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Implementation completed on 2026-05-16.
Outcome amended: 2026-05-16

Landed scope:
- Extracted production policy WASM counters from `packages/engine/src/agents/policy-wasm-runtime.ts` into `packages/engine/src/agents/policy-wasm-runtime-counters.ts`, preserving the existing route/unsupported totals while adding reason-granular unsupported counts.
- Extended the 15-seed decomposition witness CSV and Markdown to include `wasmProductionPreviewDriveUnsupportedReasons`.
- Recorded broad preview-drive unsupported reasons in `policy-wasm-score-routing.ts` and deep chooseNStep continuation unsupported reasons in `policy-preview-inner-deepening.ts`.
- Produced the full Phase 4c witness at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4c-residual.md` and `.csv`.
- Produced `reports/174-phase-4c-residual-owner.md`.
- Created `tickets/174WASMDEEPPRV-015.md` as the next non-overlapping owner: zero-counter `continuedDeepening` token/query residuals.
- Updated `specs/174-wasm-preview-drive-coverage-extension.md` so the active ticket list and outcome name the Phase 4c result.

Residual classification:
- Reason-granular unsupported leaders are now explicit: `govern:chooseNStep:add` has `667` `agent-guided-completion` rows and `92` no-projected-state rows; `govern:chooseNStep:confirm` has `464` no-projected-state rows; `event` has `457` card-event action rows.
- Dominant zero-counter classes remain outside production preview-drive route activity: `coupArvnRedeployPolice:chooseOne` has `278705.94 ms` with `0` route, unsupported, and batch counts; `coupArvnRedeployOptionalTroops:chooseOne` has `34117.37 ms` with the same zero-counter shape.
- The next owner was `archive/tickets/174WASMDEEPPRV-015.md`, not rejected default-flip ticket `archive/tickets/174WASMDEEPPRV-010.md`.

Generated/artifact fallout: checked-in Phase 4c witness Markdown/CSV and residual-owner report were created. No schema, golden, GameSpecDoc, WASM ABI, or checked-in generated JSON artifact changed.

Source-size ledger:
- `packages/engine/src/agents/policy-wasm-runtime.ts | before 1424 | after 1360 | crossed cap? no, reduced preexisting oversize | active growth none; counters extracted | extraction/defer rationale: moved counter state/detail logic to adjacent module | successor if any: none`
- `packages/engine/src/agents/policy-wasm-runtime-counters.ts | before 0 | after 135 | crossed cap? no | active growth new helper under typical band | extraction/defer rationale: source-size gate resolution for runtime counter telemetry | successor if any: none`
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs | before 700 | after 754 | crossed cap? no | active growth under cap | extraction/defer rationale: reason-delta aggregation belongs in witness script; still below 800 | successor if any: none`
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs | before 201 | after 260 | crossed cap? no | active growth under cap | extraction/defer rationale: rendered reason table belongs beside existing report rendering helper | successor if any: none`

Post-review correction:
- Replaced reason-row sorting introduced by this ticket with explicit codepoint comparators in `policy-wasm-runtime-counters.ts`, `profile-fitl-arvn-15-seed-decomposition.mjs`, and `profile-fitl-arvn-15-seed-report-rendering.mjs`, so the diagnostic order does not depend on the process locale.
- The full Phase 4c measurement remains valid because the correction changes ordering only, not counters, route classification, or measured execution. A post-review one-seed smoke verified the current report/CSV output shape.

Command ledger:
- Diagnostic syntax | `node --check packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` | passed.
- Diagnostic syntax | `node --check packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` | passed.
- Test Plan | `pnpm -F @ludoforge/engine build` | passed.
- Test Plan | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-16-phase-4c-residual --profile-buckets` | passed; wrote `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4c-residual.md` and `.csv`.
- Acceptance | `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-runtime-preview-drive-counters.test.js` | passed after the broad turbo test rebuild.
- Test Plan | `pnpm turbo test` | passed; 5/5 tasks successful, 1 cached; runner jsdom/canvas and ticker-error-fence stderr remained advisory/non-ticket-owned while the runner task passed.
- Test Plan | `pnpm turbo lint` | passed; 2/2 tasks successful, 1 cached.
- Test Plan | `pnpm turbo typecheck` | passed; 3/3 tasks successful, 1 cached.
- Ticket graph integrity | `pnpm run check:ticket-deps` | passed after final status/graph edits.
- Post-review correction | `node --check packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` | passed.
- Post-review correction | `node --check packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` | passed.
- Post-review correction | `pnpm -F @ludoforge/engine build` | passed.
- Post-review correction | `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-runtime-preview-drive-counters.test.js` | passed; 2 tests, 1 suite, 0 failures.
- Post-review correction | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000 --timeout-ms 400000 --date 2026-05-16-phase-4c-post-review-smoke --profile-buckets --output-dir /tmp/ludoforge-174-phase4c-post-review-smoke` | passed; verified current CSV/header and reason-table output shape.

Late-edit proof validity: final edits after terminal proof only changed ticket status/proof transcription; source, report, spec, command scope, residual-owner selection, and successor scope did not change. Ticket graph integrity was rerun after the terminal status edit.
