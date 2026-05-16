# 174WASMDEEPPRV-011: Phase 3b — Deep preview-drive materialized-state consumption

**Status**: PENDING
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

Unblocked on 2026-05-16 after `archive/tickets/174WASMDEEPPRV-013.md` completed the generic `chooseNStep` continuation materialization ABI required by `runDeepPass`.

Authorization ledger: user approved recommended Option 2 on 2026-05-16 after a Foundations-aligned 1-3-1 reassessment. Scope effect: the missing prerequisite work was split into `archive/tickets/174WASMDEEPPRV-013.md`; this ticket remains the production consumption owner now that 013 has landed.

Landed scope so far: reassessment and ticket/spec graph correction only; no runtime code has landed under this ticket.

Prerequisite status: `archive/tickets/174WASMDEEPPRV-013.md` landed the generic `chooseNStep` continuation compiler/materialization ABI and resolved the active source-size gate for the touched TypeScript/Rust preview-drive hubs. This ticket can now proceed to production `runDeepPass` consumption and supported deep activation proof.

Continuation owner: this ticket owns wiring `runDeepPass` to consume WASM-produced projected state and owns verifying that the inherited source-size gate remains resolved before terminal closeout.

Dependency/spec/sibling rewrites: this ticket depends on archived 012 and active 013; Spec 174 lists 013 before this active continuation; Phase 4 remains gated on 011.

Verification:
- `pnpm run check:ticket-deps` — passed; ticket dependency integrity check passed for 5 active tickets and 2359 archived tickets.
- `git diff --check` — passed.
- `git diff --no-index --check /dev/null archive/tickets/174WASMDEEPPRV-013.md` — whitespace-clean; command exited 1 with no diagnostics because the new untracked file differs from `/dev/null`.

Schema/generated fallout: none; markdown/ticket graph only.

Late-edit proof validity: approved Option 2 changed only ticket/spec/report graph prose and active-ticket status/dependency ownership. Dependency and markdown hygiene were rerun; no source, test, schema, WASM ABI, or runtime acceptance behavior changed, so no engine proof rerun is required for this blocked handoff.

Archive status: pending implementation and not archive-ready.

Next workflow: continue with `$implement-ticket tickets/174WASMDEEPPRV-011.md`.
