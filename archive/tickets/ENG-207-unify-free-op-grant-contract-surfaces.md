# ENG-207: Unify Free-Operation Grant Contract Surfaces

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — shared free-operation grant policy contract across event/effect/runtime grant paths
**Deps**: archive/tickets/FITLEVENTARCH/ENG-201-free-op-grant-viability-gating.md, packages/engine/src/kernel/types-events.ts, packages/engine/src/kernel/types-ast.ts, packages/engine/src/kernel/types-turn-flow.ts, packages/engine/src/cnl/compile-effects.ts, packages/engine/src/kernel/schemas-ast.ts, packages/engine/src/kernel/schemas-extensions.ts, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/effects-turn-flow.ts

## Problem

Grant capabilities are currently split: event-side grants support `viabilityPolicy`, while effect-based `grantFreeOperation` does not. This creates divergent semantics for conceptually identical grant behavior.

## Assumption Reassessment (2026-03-08)

1. Event free-operation grants include `viabilityPolicy` in schema/types and enforce it at issue/play time in `turn-flow-eligibility.ts`.
2. Effect AST `grantFreeOperation` does not currently expose `viabilityPolicy` in `types-ast.ts`, `schemas-ast.ts`, `compile-effects.ts`, or behavior validation.
3. Runtime pending grants (`TurnFlowPendingFreeOperationGrant`) currently omit policy metadata.
4. Prior ticket assumptions referencing an event runtime file are stale; enforcement is split across `turn-flow-eligibility.ts` (event-grant issuance/playability gates) and `effects-turn-flow.ts` (effect-grant emission).
5. Correction: unify grant policy contract and issue-time viability enforcement so event and effect declarations share one policy model.

## Architecture Check

1. Unified grant contracts reduce semantic drift and improve long-term extensibility.
2. Shared contract remains game-agnostic and data-driven (`GameSpecDoc`), with no game-specific runtime branching.
3. No backwards-compatibility aliases/shims: one canonical grant policy model across declaration surfaces.
4. Policy evaluation logic should be reusable/shared (single implementation path) instead of duplicated by source surface.

## What to Change

### 1. Introduce shared grant policy contract

Define shared grant-policy fields/types once and reuse in event grant, effect grant, and runtime pending grant structures.

### 2. Extend effect grant schema/lowering/validation

Add unified policy fields to `grantFreeOperation` AST schema/lowering/runtime validation so effect grants can express the same policy semantics as event grants.

### 3. Ensure consistent runtime enforcement

Honor unified policy fields identically at grant issue-time regardless of source surface (event declaration or effect execution), while preserving existing event play-time gate semantics for `requireUsableForEventPlay`.

### 4. Keep contract boundaries explicit

Synchronize type/schema/runtime contract updates (`types-*`, `schemas-*`, lowering, runtime application) so there is no hidden source-specific policy path.

## Files to Touch

- `packages/engine/src/kernel/types-events.ts` (modify)
- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Mandating all existing cards use effect grants.
- Sequence context and mandatory outcome contracts (ENG-202/ENG-203).

## Acceptance Criteria

### Tests That Must Pass

1. Event-defined and effect-defined grants both accept and enforce shared policy fields.
2. Lowered/runtime pending grants are policy-equivalent for semantically equivalent event/effect declarations.
3. Existing suites: `node --test packages/engine/dist/test/unit/compile-effects.test.js packages/engine/dist/test/unit/effects-turn-flow.test.js`

### Invariants

1. Free-operation grant semantics are defined by one canonical shared contract model.
2. Issue-time viability evaluation is source-agnostic (shared policy logic).
3. Runtime enforcement does not rely on game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — policy field parsing/lowering for `grantFreeOperation`.
2. `packages/engine/test/unit/effects-turn-flow.test.ts` — effect grant issue-time policy enforcement and runtime payload parity.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — cross-surface parity regression for policy-gated grants.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-effects.test.js packages/engine/dist/test/unit/effects-turn-flow.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Outcome amended: 2026-03-08
- Completion date: 2026-03-08
- What changed:
  - Added canonical free-operation grant viability policy contract in `contracts/` and exported it through the contracts index.
  - Unified contract surfaces so effect AST, event grants, and pending runtime grants all support `viabilityPolicy`.
  - Extended effect lowering/schema/validation/runtime for `grantFreeOperation.viabilityPolicy`.
  - Added source-agnostic issue-time viability probing for effect-issued grants using shared turn-flow eligibility logic.
  - Synced runtime schemas (`GameDef`/`Trace`/`EvalReport`) with the updated grant contract; runtime pending grants now include policy metadata and explicit `allowDuringMonsoon`.
  - Added/updated unit + integration coverage for policy lowering, runtime emission, suppression behavior, and cross-surface parity.
  - Tightened issue-time viability semantics after archival: free-operation grant viability probes now require strict decision-sequence satisfiability (not merely admissibility), and probe evaluation is isolated to the candidate grant.
- Deviations from original plan:
  - Runtime policy suppression no longer relies on admissibility semantics for unresolved decision sequences; it now requires strict satisfiability for issue-time viability checks.
  - Updated stale ticket assumptions/file paths before implementation.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `pnpm -F @ludoforge/engine run schema:artifacts` passed (artifacts regenerated)
  - `node --test packages/engine/dist/test/unit/compile-effects.test.js packages/engine/dist/test/unit/effects-turn-flow.test.js` passed
  - `node packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm -F @ludoforge/engine lint` passed
