# 160PEROPTPREV-004: `preview.option.*` ref family + dispatch

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler ref lowering, compiled ref/schema contract, policy-bytecode feature registration, runtime default dispatch, generated `GameDef.schema.json`
**Deps**: `archive/specs/160-per-option-preview-inner-microturns.md`

## Problem

Spec 160 introduces eight new ref kinds in a `preview.option.*` family that operators query from microturn-scope considerations to read per-option preview values:

- `preview.option.victory.currentMargin.self`
- `preview.option.victory.currentRank.self`
- `preview.option.delta.victory.currentMargin.self`
- `preview.option.var.global.<id>`
- `preview.option.var.player.self.<id>`
- `preview.option.metric.<id>`
- `preview.option.outcome`
- `preview.option.driveDepth`

This ticket lands the static infrastructure: ref registration, dispatch wiring, and schema enum updates. The refs resolve to defaults (or `unresolved`) until ticket 005 supplies the per-option preview driver context — refs are declarative, behavior is wired up by the driver.

## Assumption Reassessment (2026-05-06)

1. `preview.victory.currentMargin.self` exists as a ref today (registered via `policy-surface.ts:207`); the new `preview.option.*` family is its per-option analog (verified during reassess-spec).
2. `microturn.option.*` refs (Spec 158) are registered at `packages/engine/src/cnl/compile-agents.ts:2235-2244`. The new family slots into the same registration pattern.
3. **Boundary reset approved 2026-05-06**: live ref dispatch is split across the compiler and runtime, not `policy-expr.ts`. `policy-expr.ts` analyzes generic expressions through a caller-provided `resolveRef`; authored ref lowering lives in `packages/engine/src/cnl/compile-agents.ts`, compiled ref/runtime dispatch lives in `packages/engine/src/agents/policy-evaluation-core.ts`, and the compiled contract/schema mirrors live in `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/schemas-core.ts`, and generated `packages/engine/schemas/GameDef.schema.json`. This ticket owns that live architecture; `policy-expr.ts` is verified-no-edit.

## Architecture Check

1. **Engine-agnostic** (Foundation 1): all eight refs are generic ref strings — no game identifiers in engine code.
2. **Specs are data** (Foundation 7): refs are declarative. Authoring `preferOptionProjectedMargin` against `preview.option.delta.victory.currentMargin.self` is data, not code.
3. **No backwards-compatibility shim** (Foundation 14): refs are additive — existing profiles do not reference them, so adding them silently breaks nothing.

## What to Change

### 1. Register eight new ref kinds in `feature-table.ts`

In `packages/engine/src/cnl/policy-bytecode/feature-table.ts`, register the eight ref kinds. Each ref kind:

- Has a string identifier (e.g., `preview.option.victory.currentMargin.self`).
- Has a scope tag indicating per-option preview (resolution requires the inner-preview driver context supplied by ticket 005).
- The `preview.option.delta.*` variant is per-option-specific — it reads the difference between post-option state and pre-option state. The other refs read the post-option state.

### 2. Add compiler/runtime dispatch in the live ref seams

In `packages/engine/src/cnl/compile-agents.ts`, lower authored `preview.option.*` ref strings to compiled preview-option refs and classify them as microturn-scope refs. In `packages/engine/src/agents/policy-evaluation-core.ts`, add runtime dispatch for the new compiled refs. Resolution rules:

- **Driver context unavailable** (the per-option preview drive has not been entered, e.g., during action-selection-only evaluation): the dispatch returns the default outcome — typically `unresolved` or `unknownNoPreviewDecision` — matching existing surface-ref convention.
- **Driver context available** (per-option preview drive has populated a resolved-refs map): the dispatch reads the value from the map.

### 3. Compiled contract and schema extension

Extend the compiled ref union and schema source, then regenerate `packages/engine/schemas/GameDef.schema.json` so the generated schema validates the new compiled ref kind.

## Files to Touch

- `packages/engine/src/cnl/policy-bytecode/feature-table.ts` (modify — register eight new ref kinds)
- `packages/engine/src/cnl/policy-bytecode/types.ts` (modify — register the feature-table kind)
- `packages/engine/src/cnl/compile-agents.ts` (modify — authored ref lowering and microturn-scope classification)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — default runtime dispatch)
- `packages/engine/src/kernel/types-core.ts` (modify — compiled ref type)
- `packages/engine/src/kernel/schemas-core.ts` (modify — schema source)
- `packages/engine/schemas/GameDef.schema.json` (generated — compiled ref schema)
- `packages/engine/src/agents/policy-expr.ts` (verified-no-edit — live expression analysis does not own authored ref dispatch)

## Out of Scope

- Per-option preview driver — ticket 005 supplies the driver context that wires resolved refs.
- `delta.*` subtraction semantics — implemented in ticket 005 alongside the driver.
- Tests for ref resolution — those land in tickets 005 and 006 alongside the driver behavior.

## Acceptance Criteria

### Tests That Must Pass

1. Existing `pnpm -F @ludoforge/engine test:unit` continues to pass — new ref kinds registered, default-resolution paths unchanged.
2. `pnpm turbo schema:artifacts` regenerates artifacts cleanly with the extended enum.
3. `pnpm turbo typecheck` — new ref kinds typecheck.

### Invariants

1. (architectural-invariant) Each of the eight ref kinds is registered in exactly one location (the feature-table registration).
2. (architectural-invariant) Compiler lowering and runtime dispatch each have one explicit preview-option ref family arm; `policy-expr.ts` remains generic expression analysis and is verified-no-edit.

## Test Plan

### New/Modified Tests

- `packages/engine/test/unit/cnl/compile-preview-option-refs.test.ts` — verifies authored lowering for all eight `preview.option.*` refs and confirms they are microturn-scoped.
- `packages/engine/test/unit/cnl/compile-microturn-refs.test.ts` — extended to verify feature-table encoding for all eight compiled preview-option refs.
- `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts` — extended so the new feature-table kind is registered and non-silent through VM fallback and evaluation-context resolution.
- Behavioral driver tests remain deferred to tickets 005 and 006.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo typecheck`
4. `pnpm -F @ludoforge/engine test`

## Outcome

Completed on 2026-05-06.

Outcome amended: 2026-05-07 — updated archived Spec 160 dependency path after spec archival.

- Landed boundary: the eight `preview.option.*` refs lower to a distinct compiled `previewOptionRef` family, are classified as microturn-scope refs, receive deterministic policy-bytecode feature-table encoding, and resolve from an optional per-option preview map when present. With no driver map, runtime resolution returns the existing unresolved/undefined default; ticket 005 remains the owner of driver population, hidden-info routing, and delta semantics.
- Ticket corrections applied: `policy-expr.ts` dispatch -> live compiler/runtime dispatch in `compile-agents.ts` and `policy-evaluation-core.ts`; generated schema enum -> source schema/type contract plus regenerated `GameDef.schema.json`.
- Touched-file ledger: `feature-table.ts` done; `policy-bytecode/types.ts` owned fallout; `compile-agents.ts` done; `policy-evaluation-core.ts` done; `types-core.ts` and `schemas-core.ts` done; `GameDef.schema.json` regenerated; `policy-expr.ts` verified-no-edit; tests added/updated as listed above; `policy-diagnostics.ts` and `compile-effect-footprint.ts` owned shared-contract fallout so diagnostics and footprint scans do not silently ignore the new ref family.
- Schema/artifact fallout: `pnpm turbo schema:artifacts` regenerated `GameDef.schema.json`; `Trace.schema.json` and `EvalReport.schema.json` were written by the generator but remained byte-identical.
- Final verification:
  - `pnpm -F @ludoforge/engine build` — passed.
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/cnl/compile-preview-option-refs.test.js dist/test/unit/cnl/compile-microturn-refs.test.js dist/test/unit/agents/policy-bytecode-fallback-completeness.test.js` — passed, 6 tests.
  - `pnpm turbo schema:artifacts` — passed; regenerated `GameDef.schema.json`; `Trace.schema.json` and `EvalReport.schema.json` were byte-identical.
  - `pnpm turbo typecheck` — passed, 3 tasks.
  - `pnpm -F @ludoforge/engine test` — passed; default lane summary `64/64 files passed`.
  - `pnpm run check:ticket-deps` — passed; dependency integrity check passed for 7 active tickets and 2260 archived tickets.
- Source file size ledger: `policy-evaluation-core.ts` and `compile-agents.ts` were preexisting oversize contract hubs; this ticket adds small dispatch/type arms to the canonical owners. Extraction was considered but deferred because splitting the dispatch arm would obscure the live ref seam; residual owner: none for this ticket-sized additive registration.
- Runtime surface breadth: shared engine compiled-policy contract; no game-specific logic.
- No-invalidation note: after the final source/schema proof, only terminal status, proof transcription, and dependency-check transcription changed. No scope, acceptance, command, touched-file, follow-up, dependency, source, test, schema, or artifact contract changed after the final proof lanes.
