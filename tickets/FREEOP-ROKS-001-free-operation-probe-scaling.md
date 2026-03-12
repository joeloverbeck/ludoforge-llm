# FREEOP-ROKS-001: Fix free-operation decision probing and move synthesis scaling for complex operation profiles

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel free-operation discovery, action applicability preflight, decision probing, integration tests
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/legal-moves.ts`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/src/kernel/free-operation-grant-bindings.ts`, `packages/engine/src/kernel/action-applicability-preflight.ts`, `packages/engine/src/kernel/apply-move-pipeline.ts`, `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `packages/engine/test/helpers/decision-param-helpers.ts`, `data/games/fire-in-the-lake/30-rules-actions.md`, `data/games/fire-in-the-lake/41-events/065-096.md`

## Problem

Card 70 (`ROKs`) exposed an engine failure mode: a legal free-operation grant can compile successfully yet drive free-operation discovery / decision probing into heap exhaustion when the granted operation profile contains richer selection and movement structure than the stock FITL profiles.

That is not acceptable architecture. A game-agnostic engine must either:

1. synthesize free-operation moves for complex profiles within bounded memory/time, or
2. reject unsupported shapes deterministically at a shared boundary.

Silently allowing authored `GameSpecDoc` content to compile and then crash runtime probing leaves the engine neither robust nor extensible.

## Assumption Reassessment (2026-03-12)

1. FITL production spec currently compiles with a non-null `gameDef` after the `ROKs` authored-data changes. Confirmed locally via `runGameSpecStagesFromBundle(...)`.
2. Production-spec compilation assertions in `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` pass with the updated `ROKs` encoding. Confirmed locally.
3. Runtime execution of the dedicated `ROKs` integration test currently fails by out-of-memory during free-operation resolution/probing, even after reducing explicit test-side `legalMoves()` calls. Confirmed locally in `packages/engine/test/integration/fitl-events-roks.test.ts`.
4. The current failure is broader than card-70 authoring correctness. It is a shared engine scalability/termination problem in free-operation move synthesis for complex granted operations.

## Architecture Check

1. The engine should own bounded free-operation probing semantics once, generically, rather than forcing each game card to avoid legitimate operation shapes.
2. Fixing the kernel boundary is cleaner than introducing FITL-specific workarounds or moving operational logic out of `GameSpecDoc` into ad hoc simulator code.
3. The right end state is game-agnostic: either generic bounded exploration for granted operations, or a generic “unsupported for free-op synthesis” validation failure surfaced before runtime.
4. No backwards-compatibility shims should preserve the current unbounded behavior. Replace it with one explicit contract.

## What to Change

### 1. Add bounded free-operation probing semantics

Rework free-operation discovery / legal-move synthesis so complex granted operations cannot allocate unbounded decision trees.

This likely requires one or more of:

- structural pruning before full decision expansion,
- shared probe budgets that short-circuit deterministically,
- move-template emission that defers expensive choice materialization until apply-time,
- or explicit unsupported-shape rejection when a profile cannot be safely surfaced as a free move.

The implementation must be generic and documented by tests rather than card-specific.

### 2. Make failure semantics explicit

If some operation-profile shapes are too expensive or ambiguous to synthesize as free-operation legal moves, the engine must surface a deterministic kernel error/diagnostic rather than exhausting memory.

That contract should be shared across all games and all free-operation sources.

### 3. Add regression coverage for high-complexity granted operations

Add integration and/or unit coverage proving that:

- complex granted operations terminate,
- pending free-operation grants remain consumable,
- and decision normalization helpers do not hide or reintroduce the scaling issue.

### 4. Preserve `ROKs` as a reevaluation client, not a one-off workaround

Do not bake card-70-specific escape hatches into the kernel. Track card-70 authored-data follow-up separately in `tickets/FITL70-001-reevaluate-roks-after-engine-rework.md`.

## Files to Touch

- `tickets/FREEOP-ROKS-001-free-operation-probe-scaling.md` (new)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-bindings.ts` (modify if shared bind reduction is needed)
- `packages/engine/src/kernel/action-applicability-preflight.ts` (modify if probe modes/budgets move here)
- `packages/engine/src/kernel/apply-move-pipeline.ts` (modify only if deferred move-template execution is required)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-roks.test.ts` (modify)
- `packages/engine/test/helpers/decision-param-helpers.ts` (modify if helper assumptions must be tightened)

## Out of Scope

- Final FITL card-70 authored-data shape
- Visual presentation changes in `visual-config.yaml`
- FITL-specific kernel branches or special cases
- Backwards-compatibility flags preserving unbounded probe behavior

## Acceptance Criteria

### Tests That Must Pass

1. A complex granted operation similar in structure to `ROKs` can be surfaced/applied without heap exhaustion.
2. If the engine rejects an unsupported free-operation shape, it does so deterministically with a shared kernel error/diagnostic rather than OOM.
3. Existing execute-as and ordered free-operation grant coverage continues to pass.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Free-operation discovery remains game-agnostic and does not branch on FITL identifiers, card ids, factions, or map spaces.
2. `GameSpecDoc` remains the place where game-specific granted-operation content is authored; the engine only provides generic bounded execution semantics.
3. No backwards-compatibility alias path preserves the old unbounded probing contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-roks.test.ts` — prove the `ROKs`-class grant path either terminates successfully or fails with the new deterministic shared boundary.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add a generic high-complexity grant fixture that stresses free-operation discovery without using FITL-specific engine logic.
3. `packages/engine/test/unit/...` under the touched kernel area — pin any new probe-budget / deferred-template / explicit-rejection semantics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-roks.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

