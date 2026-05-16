# 174WASMDEEPPRV-011: Phase 3b — Deep preview-drive materialized-state consumption

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — TypeScript host bridge consumption, deep preview dispatch after ABI prerequisite
**Deps**: `tickets/174WASMDEEPPRV-008.md`, `archive/tickets/174WASMDEEPPRV-012.md`, `archive/tickets/174WASMDEEPPRV-013.md`

## Problem

`174WASMDEEPPRV-008` can truthfully count broad preview-drive WASM activation, but live reassessment found that `runDeepPass` cannot consume `evaluateProductionPreviewDriveBatchWithWasm` as its implementation because the WASM row output does not include the materialized projected `GameState` required by `ChooseNStepInnerPreviewResult.state` and `projectedStateByOptionKey`. Counting a WASM row while still using TypeScript to produce the state would make fallback success look like route activation and would violate Foundations #9, #16, and #20.

This ticket wires `runDeepPass` to consume WASM-produced projected state after the prerequisite state-patch/materialization ABI in `archive/tickets/174WASMDEEPPRV-012.md` exists and after `archive/tickets/174WASMDEEPPRV-013.md` lands the missing generic `chooseNStep` continuation materialization ABI.

## Assumption Reassessment (2026-05-16)

1. `evaluateProductionPreviewDriveBatchWithWasm` currently returns row/value/status metadata and preview-state slot values, not a full materialized `GameState`.
2. `runDeepPass` must return `ChooseNStepInnerPreviewResult` objects whose `state` is the projected post-preview state; downstream callers expose that state through `projectedStateByOptionKey`.
3. `174WASMDEEPPRV-008` records deep-phase unsupported counters and keeps the TypeScript fallback until this ABI/state contract exists.
4. Additional reassessment on 2026-05-16 found that `runDeepPass` operates on `chooseNStep` microturn continuations, while the existing production preview-drive compiler is rooted in root action `Move` pipelines. A scalar/global-only bridge would still require TypeScript to apply the deep continuation to derive state deltas, so it is not a Foundation-aligned proof that WASM produced the consumed projected state. `archive/tickets/174WASMDEEPPRV-012.md` owns the prerequisite generic state-patch/materialization ABI.
5. Reassessment after 012 landed found that the prerequisite ABI is necessary but not sufficient: live `compileProductionPreviewDrive` still compiles action-pipeline-rooted `Move` programs, while `runDeepPass` needs `chooseNStep` continuation state patches. User-approved Option 2 on 2026-05-16 split that missing prerequisite into `archive/tickets/174WASMDEEPPRV-013.md` and keeps this ticket blocked until it lands.

## Architecture Check

1. Foundations #9 and #16 require the accelerated route to produce the consumed public result, not only an adjacent diagnostic row.
2. Foundation #20 requires preview status and unavailable/fallback provenance to remain explicit across the new state-return boundary.
3. The ABI must remain game-agnostic: serialized state materialization cannot inspect FITL identifiers or authored profile names.

## What to Change

### 0. Source-size gate resolution

Before terminal closeout, resolve the source-size gate inherited from the `174WASMDEEPPRV-012` substrate and carried into `archive/tickets/174WASMDEEPPRV-013.md`: the current implementation grew the canonical preview-drive TypeScript/Rust hubs past the repo's 800-line guidance. Because this ticket will touch the same ABI and deep-consumption surfaces after 013 lands, it owns confirming that 013 resolved the gate or carrying an explicit user-approved 1-3-1 deferral before terminal closeout.

### 1. Materialized projected-state ABI

Consume the preview-drive state-patch ABI from `archive/tickets/174WASMDEEPPRV-012.md` plus the `chooseNStep` continuation materialization ABI from `archive/tickets/174WASMDEEPPRV-013.md` so a supported deep preview-drive row can return enough deterministic state data to reconstruct the projected `GameState` required by `runDeepPass`.

### 2. Deep-phase WASM consumption

Update `policy-preview-inner-deepening.ts` so supported deep options consume the WASM-produced projected state. Keep unsupported classes explicit and fail closed or fall back only under the corrected contract.

### 3. Activation and parity proof

Add tests that prove:
- deep `recordProductionPolicyWasmPreviewDrive('supported')` increments only when the WASM route produced the consumed projected state;
- unsupported deep classes increment unsupported counters and preserve explicit reason/fallback provenance;
- TypeScript and WASM deep projected states are byte-equivalent through the nearest public serialized-state oracle.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-preview-drive.ts` (modify)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` (modify)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify)
- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify if ABI export shape changes)
- `packages/engine/test/integration/` (new/modified deep projected-state parity and activation tests)

## Out of Scope

- No FITL-specific code.
- No Phase 4 measurement or default flip; those remain in tickets 009 and 010 after this prerequisite lands.
- No policy-profile retuning or GameSpecDoc changes.
- No prerequisite state-patch ABI design; ticket 012 owns the payload contract and decoder substrate.

## Acceptance Criteria

### Tests That Must Pass

1. New deep projected-state parity/activation test passes.
2. Existing `policy-wasm-preview-drive-production-route-activation.test.ts` is updated so deep supported activation replaces the 008 unsupported fallback expectation.
3. Parity oracle (007) remains green.
4. Engine suite green: `pnpm turbo build && pnpm turbo test`.
5. Determinism gates green (same list as ticket 002).

### Invariants

1. Deep supported activation is counted only when WASM produced the projected state consumed by `runDeepPass`.
2. Unsupported deep classes keep explicit unsupported counters and reason/fallback provenance.
3. Serialized projected state remains deterministic and byte-equivalent to the TypeScript reference.

## Test Plan

### New/Modified Tests

1. Deep projected-state parity/activation integration test — proves WASM-produced state consumption.
2. `packages/engine/test/integration/policy-wasm-preview-drive-production-route-activation.test.ts` — update deep assertion from unsupported fallback to supported activation.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test <compiled deep projected-state parity test>`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
3. `pnpm run check:ticket-deps`

## Outcome

Implementation completed on 2026-05-16.

Authorization ledger: user approved recommended Option 2 on 2026-05-16 after a Foundations-aligned 1-3-1 reassessment. Scope effect: the missing prerequisite work was split into `archive/tickets/174WASMDEEPPRV-013.md`; this ticket remained the production consumption owner after 013 landed.

Landed scope:
- `runDeepPass` now attempts a deep `chooseNStep` WASM materialization route before the TypeScript continuation fallback. Supported activation is recorded only after the WASM runtime returns a state patch and the host materializer consumes that patch as the projected `GameState` used by the public deep preview result.
- Unsupported/no-runtime deep classes still fall back to `continueChooseNStepInnerPreviewDrive` and increment explicit unsupported telemetry, so fallback success cannot count as route activation.
- The generic `applyChooseNStepDecision` state-patch materializer now supports terminal `confirm` continuations in addition to add/remove continuations, using the same published microturn decision protocol.
- `policy-wasm-preview-drive-production-route-activation.test.ts` now proves deep supported activation, no unsupported count on the supported WASM fixture, no-runtime unsupported fallback preservation, and byte-equivalent projected states against the TypeScript reference through `serializeGameState`.

Touched-file scope:
- Modified: `packages/engine/src/agents/policy-preview-inner-deepening.ts`, `packages/engine/src/agents/policy-preview-inner-choosenstep.ts`, `packages/engine/src/agents/policy-wasm-preview-choosenstep-continuation.ts`, `packages/engine/src/agents/policy-wasm-preview-drive-state-patch.ts`, `packages/engine/test/integration/policy-wasm-preview-drive-production-route-activation.test.ts`, `packages/engine/test/unit/agents/policy-wasm-preview-choosenstep-continuation-abi.test.ts`.
- Verified-no-edit: `packages/engine/src/agents/policy-wasm-preview-drive.ts`, `packages/engine/src/agents/policy-wasm-runtime.ts`, `packages/engine/src/agents/policy-wasm-production-preview-drive.ts`, `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts`, `packages/engine-wasm/policy-vm/src/preview_drive.rs`, and `packages/engine-wasm/policy-vm/src/lib.rs`; ABI version, magic, Rust mirror, and FFI export shape stayed unchanged.
- Same-series graph: `tickets/174WASMDEEPPRV-008.md` was unblocked because this ticket satisfied its named prerequisite; Phase 4 tickets remain gated on 009/010.

Generated/schema fallout: ignored Rust WASM target rebuilt during verification. No schema, golden, GameSpecDoc, or checked-in generated JSON artifact changed.

Source-size ledger:
- `packages/engine/src/agents/policy-preview-inner-deepening.ts | before 225 | after 374 | crossed cap? no | active growth deep WASM consumption helper | extraction/defer rationale: under cap and keeps the route beside runDeepPass | successor if any: none`
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts | before 610 | after 610 | crossed cap? no | active growth none, export-only change | extraction/defer rationale: under cap | successor if any: none`
- `packages/engine/src/agents/policy-wasm-preview-choosenstep-continuation.ts | before 101 | after 96 | crossed cap? no | active growth none | extraction/defer rationale: under cap | successor if any: none`
- `packages/engine/src/agents/policy-wasm-preview-drive-state-patch.ts | before 243 | after 243 | crossed cap? no | active growth none, confirm support replaced prior fail-closed branch | extraction/defer rationale: under cap | successor if any: none`
- `packages/engine/src/agents/policy-wasm-preview-drive.ts | before 735 | after 735 | crossed cap? no | active growth none, verified-no-edit | extraction/defer rationale: 013 already resolved inherited hub growth | successor if any: none`
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts | before 881 | after 881 | crossed cap? no, preexisting oversize with no active growth | active growth none, verified-no-edit | extraction/defer rationale: production action-pipeline compiler hub not changed by deep consumption | successor if any: none`
- `packages/engine/src/agents/policy-wasm-runtime.ts | before 1424 | after 1424 | crossed cap? no, preexisting oversize with no active growth | active growth none, verified-no-edit | extraction/defer rationale: no FFI call-shape/counter change required | successor if any: none`
- `packages/engine-wasm/policy-vm/src/preview_drive.rs | before 733 | after 733 | crossed cap? no | active growth none, verified-no-edit | extraction/defer rationale: Rust mirror already accepts confirm op encoding | successor if any: none`
- `packages/engine-wasm/policy-vm/src/lib.rs | before 1307 | after 1307 | crossed cap? no, preexisting oversize with no active growth | active growth none, verified-no-edit | extraction/defer rationale: ABI export shape unchanged | successor if any: none`

Command ledger:
- Test Plan | `pnpm -F @ludoforge/engine build && node --test <compiled deep projected-state parity test>` | split into package build plus focused compiled Node tests | passed.
- Acceptance | existing `policy-wasm-preview-drive-production-route-activation.test.ts` | updated and run directly plus through `pnpm turbo test` | passed; deep supported activation replaced the 008 unsupported fallback expectation while no-runtime unsupported fallback remains proven.
- Acceptance | parity oracle (007) | run directly and through `pnpm turbo test` | passed.
- Acceptance | determinism gates list | run directly | passed.
- Test Plan | `pnpm -F @ludoforge/engine-wasm build` | run directly | passed.
- Test Plan | `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` | split into four serial turbo lanes | passed.
- Test Plan | `pnpm run check:ticket-deps` | run after terminal status/sibling status edits | passed.

Verification:
- `pnpm -F @ludoforge/engine build` - passed.
- `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-choosenstep-continuation-abi.test.js packages/engine/dist/test/integration/policy-wasm-preview-choosenstep-continuation-materialization.test.js packages/engine/dist/test/integration/policy-wasm-preview-drive-production-route-activation.test.js packages/engine/dist/test/integration/policy-wasm-preview-drive-state-patch-materialization.test.js` - passed; 8 tests, 4 suites, 0 failures.
- `pnpm -F @ludoforge/engine-wasm build` - passed.
- `node --test packages/engine/dist/test/integration/policy-wasm-preview-drive-equivalence.test.js packages/engine/dist/test/determinism/spec-140-replay-identity.test.js packages/engine/dist/test/determinism/forked-vs-fresh-runtime-parity.test.js packages/engine/dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js packages/engine/dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js` - passed; 17 tests, 6 suites, 0 failures.
- `pnpm turbo build` - passed; 3 successful, 1 cached. Advisory emission only: existing runner Vite large-chunk warning.
- `pnpm turbo test` - passed; 5 successful, 3 cached; engine default lane reported 85/85 files passed. Advisory emissions only: existing runner jsdom/canvas messages while runner tests passed.
- `pnpm turbo lint` - passed; 2 successful, 1 cached.
- `pnpm turbo typecheck` - passed; 3 successful, 1 cached.
- `pnpm run check:ticket-deps` - passed; ticket dependency integrity check passed for 4 active tickets and 2360 archived tickets.

Late-edit proof validity: this terminal closeout updates status, touched-file/proof transcription, and the same-series 008 unblock note after all source/test proof lanes passed. No source, test, schema, WASM ABI, runtime behavior, acceptance command semantics, or Phase 4 ownership changed after those lanes; `pnpm run check:ticket-deps` passed after the status edits. This exact checker-result transcription is clerical and changes no graph edge or acceptance claim.

Archive status: completed and ready for post-ticket review.
