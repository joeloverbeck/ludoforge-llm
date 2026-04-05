# 111MULSTPPRE-005: Diagnostic enrichment and integration tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — agent diagnostics, trace types
**Deps**: `archive/tickets/111MULSTPPRE-004.md`, `specs/111-multi-step-preview-for-granted-operations.md`

## Problem

With multi-step preview implemented (tickets 001-004), the trace output needs to expose granted operation details for debugging and analysis. Additionally, integration tests must verify the complete pipeline works end-to-end with FITL game data — confirming the VC agent correctly prefers operation-granting events over alternatives.

## Assumption Reassessment (2026-04-05)

1. `policy-diagnostics.ts` builds traces via `buildPolicyAgentDecisionTrace()` at line 101 — confirmed.
2. The trace types from ticket 001 (`grantedOperationSimulated`, `grantedOperationMove`, `grantedOperationMarginDelta`) will be available on `PolicyCandidateDecisionTrace` — depends on ticket 001.
3. The `PreviewOutcome` will carry `grantedOperation` metadata from ticket 003 — depends on ticket 003.
4. FITL has 7 card sides granting operations to VC (confirmed from campaign traces: card-25, card-30, card-40, card-50, card-69, card-75, card-99).

## Architecture Check

1. Diagnostics are a read-only projection of evaluation state — no behavioral changes. Foundation 9 (Replay and Auditability).
2. Integration tests use production FITL game data, verifying the full compilation → evaluation → preview → scoring pipeline.
3. Golden trace tests ensure non-granting events and non-event candidates are unaffected (regression safety).

## What to Change

### 1. Wire granted operation metadata into diagnostics (`policy-diagnostics.ts`)

In the candidate trace building logic, read the granted operation metadata from the preview outcome and populate the trace fields:

```typescript
grantedOperationSimulated: candidate.grantedOperation !== undefined,
grantedOperationMove: candidate.grantedOperation
  ? { actionId: candidate.grantedOperation.move.actionId, params: candidate.grantedOperation.move.params }
  : undefined,
grantedOperationMarginDelta: candidate.grantedOperation
  ? (candidate.grantedOperation.postEventPlusOpMargin ?? 0) - (candidate.grantedOperation.preEventMargin ?? 0)
  : undefined,
```

### 2. Integration test: FITL VC agent prefers operation-granting events

Create a test that:
1. Compiles the FITL game spec
2. Sets up a game state where the active card grants VC a free operation (e.g., card-75 shaded grants VC a free operation)
3. Runs the VC agent's policy evaluation on a decision point with the event available
4. Asserts the event candidate's score is HIGHER with multi-step preview than without
5. Asserts `grantedOperationSimulated === true` in the event candidate's trace

### 3. Regression test: existing golden traces unchanged

Verify that the FITL policy summary golden fixture (`fitl-policy-catalog.golden.json`) either remains identical or is regenerated with only the new optional trace fields added. Non-event candidates and non-granting events must produce identical scores.

### 4. Update cookbook with operational note

Add a note to `docs/agent-dsl-cookbook.md` in the "React to the active event card" section explaining that operation-granting events now benefit from automatic multi-step preview — the annotation-based bonus is complementary but no longer the only mechanism.

## Files to Touch

- `packages/engine/src/agents/policy-diagnostics.ts` (modify)
- `packages/engine/test/agents/policy-preview-granted-op-integration.test.ts` (new)
- `docs/agent-dsl-cookbook.md` (modify)
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` (regenerate if needed)

## Out of Scope

- Changes to preview logic (tickets 002-003)
- Changes to callback implementation (ticket 004)
- Changes to agent profile YAML
- Performance optimization of multi-step preview

## Acceptance Criteria

### Tests That Must Pass

1. FITL integration: event candidate with `grantsOperation` for VC scores higher than with single-step preview
2. FITL integration: `grantedOperationSimulated` is true in trace for granting event candidates
3. FITL integration: non-granting event candidates have `grantedOperationSimulated` absent or false
4. Regression: non-event candidate scores are identical before and after
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Diagnostic trace is a read-only projection — no behavioral side effects
2. Golden fixture either unchanged or updated with new optional fields only
3. Cookbook documentation is accurate and reflects implemented behavior

## Test Plan

### New/Modified Tests

1. `packages/engine/test/agents/policy-preview-granted-op-integration.test.ts` — end-to-end FITL test with operation-granting event, score comparison, trace verification
2. `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` — regenerate if trace shape changes

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/agents/policy-preview-granted-op-integration.test.js`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
