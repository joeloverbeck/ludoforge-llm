# 121TWOPHAPOL-001: Add phase fields to PolicyAgentDecisionTrace type

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel type definitions
**Deps**: `specs/15-gamespec-agent-policy-ir.md`

## Problem

The two-phase policy evaluation pipeline (Spec 121) needs trace fields to record which phase drove the agent's decision. Without these fields, debugging and auditing the phase-separated evaluation is opaque — there's no way to distinguish Phase 1 (move-scope) scores from Phase 2 (completion-scope) quality signals in the trace output.

## Assumption Reassessment (2026-04-09)

1. `PolicyAgentDecisionTrace` exists in `packages/engine/src/kernel/types-core.ts` with fields `finalScore`, `candidates`, `completionStatistics`, etc. — confirmed via session grep.
2. No `phase1Score`, `phase2Score`, or `phase1ActionRanking` fields exist yet — confirmed.
3. `PolicyEvaluationMetadata` in `packages/engine/src/agents/policy-eval.ts` will need corresponding fields, but that is out of scope for this ticket (handled in 003).

## Architecture Check

1. Adding optional fields to an existing trace interface is the minimal, non-breaking way to introduce phase awareness. Downstream consumers (trace serialization, golden tests) continue to work because the fields are optional.
2. No game-specific logic introduced — the phase fields are generic evaluation metadata, applicable to any game's policy agent.
3. No backwards-compatibility shims — existing traces without phase fields remain valid; the fields are simply absent.

## What to Change

### 1. Extend `PolicyAgentDecisionTrace` in `types-core.ts`

Add three optional fields:

```typescript
readonly phase1Score?: number | null;
readonly phase2Score?: number | null;
readonly phase1ActionRanking?: readonly string[];
```

- `phase1Score`: The move-scope score that selected the winning `actionId` in Phase 1.
- `phase2Score`: The completion-scope quality score from Phase 2 (if completion-scope considerations exist).
- `phase1ActionRanking`: Ordered list of `actionId`s by Phase 1 score (highest first), showing the action-type ranking before completion.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)

## Out of Scope

- Populating the new fields in `buildPolicyAgentDecisionTrace` (ticket 004)
- Restructuring the `chooseMove` pipeline (ticket 003)
- Updating golden test files (ticket 004)
- Changes to `PolicyEvaluationMetadata` (ticket 003)

## Acceptance Criteria

### Tests That Must Pass

1. TypeScript compilation succeeds with the new optional fields.
2. Existing golden tests pass without changes (fields are optional, absent in current traces).
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `PolicyAgentDecisionTrace` remains a readonly interface — no mutable fields.
2. All new fields are optional (`?`) — existing code that constructs traces without them must compile without error.

## Test Plan

### New/Modified Tests

1. No new tests required — this is a pure type addition. Compilation is the test.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completed: 2026-04-09
- Changed:
  - Added optional `phase1Score`, `phase2Score`, and `phase1ActionRanking` to `PolicyAgentDecisionTrace` in `packages/engine/src/kernel/types-core.ts`.
  - Added matching optional fields to the policy branch of `AgentDecisionTraceSchema` in `packages/engine/src/kernel/schemas-core.ts`.
  - Regenerated `packages/engine/schemas/Trace.schema.json` so the serialized trace contract stayed in sync with the source schema.
- Deviations from original plan:
  - The original `Files to Touch` list was stale. Foundations-compliant completion required updating the schema layer and regenerated trace artifact in addition to `types-core.ts`.
  - No metadata population or diagnostics wiring was added here; that work remains deferred to later `121TWOPHAPOL` tickets.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm turbo typecheck`
  - `pnpm -F @ludoforge/engine test`
  - The first `pnpm -F @ludoforge/engine test` run failed because `Trace.schema.json` was out of sync; after regenerating schema artifacts, the rerun passed.
