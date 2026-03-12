# FREEOPEORDPROCON-001: Progression Policy Contract Surface (schema + types + validation constants)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — contracts, schemas, Zod schemas, JSON schema artifacts
**Deps**: None (first ticket in the series)

## Problem

Ordered free-operation sequences have no explicit authoring-level progression policy. The runtime cannot distinguish between "strict" (current implicit default) and "implement what can in order" (new). This ticket introduces the type surface and schema plumbing — no runtime logic yet.

## Assumption Reassessment (2026-03-12)

1. `TurnFlowFreeOperationGrantContract` in `packages/engine/src/kernel/types-turn-flow.ts` and the effect AST shape in `packages/engine/src/kernel/types-ast.ts` both define `sequence` as `{ batch: string; step: number }` — no `progressionPolicy` field exists yet on the shared type surface.
2. `EventCardFreeOperationGrantSchema` in `packages/engine/src/kernel/schemas-extensions.ts` and the effect-issued `grantFreeOperation` schema in `packages/engine/src/kernel/schemas-ast.ts` both use strict `sequence` objects, so adding `progressionPolicy` requires updates in both schema entry points.
3. `createTurnFlowFreeOperationGrantSchema` / `collectTurnFlowFreeOperationGrantContractViolations` currently validate a single grant only. Mixed-policy-in-one-batch is a cross-grant rule and belongs in the validation layer (`validate-events.ts` / effect-path validation), not the per-grant contract helper.
4. `GameDef.schema.json` currently mirrors the free-operation grant authoring surface. `Trace.schema.json` / `EvalReport.schema.json` expose runtime batch context, but this ticket does not change runtime state, so those artifacts should only change if schema generation proves they reference the authoring sequence shape directly.

## Architecture Check

1. Adding a typed, closed union (`'strictInOrder' | 'implementWhatCanInOrder'`) at the shared grant contract level is the minimal change to make progression intent explicit.
2. Batch-level consistency checks should stay outside the single-grant contract collector. The current architecture already separates per-grant shape validation from cross-grant validation, and this ticket should preserve that boundary.
3. The policy lives in `GameSpecDoc` authoring (inside `sequence`) and is lowered through shared compiler/kernel schemas; runtime state changes remain out of scope for this ticket.
4. No aliases or backwards-compatibility shims. Omission means `strictInOrder` (current default, documented explicitly).

## What to Change

### 1. Shared contract/type surface

Add a const array and type for progression policy values:

```ts
export const TURN_FLOW_FREE_OPERATION_GRANT_PROGRESSION_POLICY_VALUES = [
  'strictInOrder',
  'implementWhatCanInOrder',
] as const;

export type TurnFlowFreeOperationGrantProgressionPolicy =
  (typeof TURN_FLOW_FREE_OPERATION_GRANT_PROGRESSION_POLICY_VALUES)[number];
```

Add the new const array / type to `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts`.

Extend the `sequence` shape in:

- `packages/engine/src/kernel/types-turn-flow.ts`
- `packages/engine/src/kernel/types-ast.ts`

to include `progressionPolicy?: TurnFlowFreeOperationGrantProgressionPolicy`.

### 2. Zod schemas

Update:

- `packages/engine/src/kernel/schemas-extensions.ts` for event-card `freeOperationGrants`
- `packages/engine/src/kernel/schemas-ast.ts` for effect-issued `grantFreeOperation`

so both `sequence` objects accept `progressionPolicy: z.enum(PROGRESSION_POLICY_VALUES).optional()`.

### 3. Compiler/lowering surface

Update the CNL lowering path so `grantFreeOperation.sequence.progressionPolicy` lowers through unchanged when present.

### 4. Cross-grant validation

Add a batch-level validation rule that rejects mixed `progressionPolicy` values within the same batch.

This should be implemented where cross-grant relationships already live:

- event-issued validation in `packages/engine/src/kernel/validate-events.ts`
- any needed effect-issued validation path that already reasons about multiple grants in execution order

Do not push this rule into `collectTurnFlowFreeOperationGrantContractViolations`, which is a single-grant helper today.

### 5. JSON schema artifacts

Regenerate `GameDef.schema.json` via `pnpm turbo schema:artifacts`. The `progressionPolicy` enum should appear inside the free-operation grant sequence definition.

## Files to Touch

- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts` (modify) — new const array and type
- `packages/engine/src/kernel/types-turn-flow.ts` (modify) — shared grant contract sequence shape extension
- `packages/engine/src/kernel/types-ast.ts` (modify) — effect AST sequence shape extension
- `packages/engine/src/kernel/schemas-extensions.ts` (modify) — event-issued Zod schema update
- `packages/engine/src/kernel/schemas-ast.ts` (modify) — effect-issued Zod schema update
- `packages/engine/src/cnl/compile-effects-free-op.ts` (modify) — preserve `progressionPolicy` during lowering
- `packages/engine/src/kernel/validate-events.ts` (modify) — mixed-policy batch rejection at cross-grant validation layer
- `packages/engine/schemas/GameDef.schema.json` (regenerate)
- `packages/engine/schemas/Trace.schema.json` (regenerate only if schema generation reflects an indirect change)
- `packages/engine/schemas/EvalReport.schema.json` (regenerate only if affected)

## Out of Scope

- Runtime state changes (`TurnFlowFreeOperationSequenceBatchContext`, `skippedStepIndices`) — that is FREEOPEORDPROCON-002.
- Kernel readiness logic (`isPendingFreeOperationGrantSequenceReady`) — that is FREEOPEORDPROCON-004.
- Validation of `requireMoveZoneCandidatesFrom` interaction with `implementWhatCanInOrder` — that is FREEOPEORDPROCON-003.
- MACV data rework — that is FREEOPEORDPROCON-006.
- Any runtime behavioral change.

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: a grant with `sequence: { batch: 'x', step: 0, progressionPolicy: 'strictInOrder' }` parses successfully through the Zod schema.
2. Unit test: a grant with `sequence: { batch: 'x', step: 0, progressionPolicy: 'implementWhatCanInOrder' }` parses successfully.
3. Unit test: a grant with `sequence: { batch: 'x', step: 0 }` (no progressionPolicy) parses successfully — field is optional.
4. Unit test: a grant with `sequence: { batch: 'x', step: 0, progressionPolicy: 'bogus' }` is rejected by Zod.
5. Unit/integration validation test: batch-level diagnostic is reported when two grants in the same batch disagree on `progressionPolicy` (e.g. step 0 has `strictInOrder`, step 1 has `implementWhatCanInOrder`).
6. Unit/integration validation test: no diagnostic when all grants in a batch share the same `progressionPolicy`.
7. Existing suite: `pnpm turbo test` — no regressions.
8. Schema artifacts: `pnpm turbo schema:artifacts` passes (JSON schemas regenerated and checked in).

### Invariants

1. Omitting `progressionPolicy` must remain valid and implicitly mean `strictInOrder`.
2. No existing test or game data file breaks — no behavioral change yet.
3. The progression policy type is a closed enum with exactly two values.
4. Event-issued and effect-issued grant schemas both accept the same `progressionPolicy` field.
5. Cross-grant consistency remains enforced in the validation layer rather than the per-grant contract helper.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — new event/effect schema acceptance and rejection cases for `sequence.progressionPolicy`
2. `packages/engine/test/unit/compile-effects.test.ts` — lowering preserves `sequence.progressionPolicy`
3. `packages/engine/test/unit/json-schema.test.ts` — `GameDef.schema.json` accepts the new sequence field for event-issued and effect-issued grants
4. Validation test in the existing event/effect validation suite — mixed-policy batches reject at the cross-grant validation layer

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-12
- What changed:
  - Added the closed `progressionPolicy` contract (`strictInOrder | implementWhatCanInOrder`) to the shared free-operation grant contract surface.
  - Extended shared kernel types, event/effect Zod schemas, compiler lowering, and generated JSON schema artifacts to carry `sequence.progressionPolicy`.
  - Added batch-level validation that rejects mixed progression policies within a batch for both declarative event grants and effect-issued grants, normalizing omitted policy to the default `strictInOrder`.
  - Added focused tests for schema acceptance/rejection, compiler lowering, JSON schema artifacts, and mixed-policy validation.
- Deviations from original plan:
  - The ticket was corrected before implementation. Mixed-policy rejection was implemented in `validate-events.ts`'s cross-grant validation layer instead of `collectTurnFlowFreeOperationGrantContractViolations`, because the current architecture keeps per-grant validation and cross-grant validation separate.
  - The effect-issued schema update landed in `packages/engine/src/kernel/schemas-ast.ts`, not `schemas-extensions.ts`, because that is the actual effect AST schema entry point.
- Verification results:
  - `node --test dist/test/unit/schemas-ast.test.js dist/test/unit/compile-effects.test.js dist/test/unit/json-schema.test.js dist/test/unit/validate-gamedef.test.js` (from `packages/engine`) passed.
  - `pnpm turbo schema:artifacts` passed and regenerated checked-in schema artifacts.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed with existing repo warnings only; no new lint errors were introduced by this ticket.
