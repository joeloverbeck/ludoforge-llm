# 111MULSTPPRE-005: Diagnostic enrichment and integration tests

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — agent diagnostics, trace types
**Deps**: `archive/tickets/111MULSTPPRE-004.md`, `archive/specs/111-multi-step-preview-for-granted-operations.md`

**Related follow-up**: `specs/113-preview-state-policy-surface.md`

## Problem

With multi-step preview implemented (tickets 001-004), the trace output needs to expose granted operation details for debugging and analysis. Additionally, integration tests must verify the complete pipeline works end-to-end with FITL game data, proving that granted-operation simulation is exercised on real production candidates without perturbing unrelated scoring paths.

## Assumption Reassessment (2026-04-05)

1. `policy-diagnostics.ts` builds traces via `buildPolicyAgentDecisionTrace()` at line 101 — confirmed.
2. The trace types from ticket 001 (`grantedOperationSimulated`, `grantedOperationMove`, `grantedOperationMarginDelta`) will be available on `PolicyCandidateDecisionTrace` — depends on ticket 001.
3. The `PreviewOutcome` will carry `grantedOperation` metadata from ticket 003 — depends on ticket 003.
4. FITL has 7 card sides granting operations to VC (confirmed from campaign traces: card-25, card-30, card-40, card-50, card-69, card-75, card-99).
5. Follow-up audit (2026-04-05) found no verified production FITL checkpoint where multi-step grant simulation alone raises the immediate projected-margin score over the single-step baseline. Real production candidates do simulate the granted operation and expose the trace metadata, but several granting events land at `grantedOperationMarginDelta === 0` under the current preview-visible scoring surfaces. That is evidence of a scoring-surface limitation, not of a broken grant-preview pipeline.

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

### 2. Integration test: FITL production granting-event proof

Create a test that:
1. Compiles the FITL game spec
2. Sets up a game state where the active card grants VC a free operation (e.g., card-75 shaded grants VC a free operation)
3. Runs the VC agent's policy evaluation on a decision point with the event available
4. Asserts `grantedOperationSimulated === true` in the event candidate's trace
5. Asserts granted-operation trace details are populated (`grantedOperationMove`, `grantedOperationMarginDelta`)
6. Asserts non-event candidate scores are identical with and without grant simulation

### 3. Regression test: existing golden traces unchanged

Verify that the FITL policy summary golden fixture (`fitl-policy-catalog.golden.json`) either remains identical or is regenerated with only the new optional trace fields added. Non-event candidates and non-granting events must produce identical scores.

### 4. Update cookbook with operational note

Add a note to `docs/agent-dsl-cookbook.md` in the "React to the active event card" section explaining that operation-granting events now benefit from automatic multi-step preview — the annotation-based bonus is complementary but no longer the only mechanism.

## Files to Touch

- `packages/engine/src/agents/policy-diagnostics.ts` (modify)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify)
- `docs/agent-dsl-cookbook.md` (modify)
- `packages/engine/test/unit/trace/policy-trace-events.test.ts` (modify if needed for trace projection stability)

## Out of Scope

- Changes to preview logic (tickets 002-003)
- Changes to callback implementation (ticket 004)
- Changes to agent profile YAML
- Performance optimization of multi-step preview

## Acceptance Criteria

### Tests That Must Pass

1. FITL integration: `grantedOperationSimulated` is true in trace for a production granting-event candidate
2. FITL integration: granted-operation trace details are populated for that candidate
3. FITL integration: non-event candidate scores are identical before and after
4. Regression: non-granting event candidates and existing trace/golden surfaces remain stable
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Diagnostic trace is a read-only projection — no behavioral side effects
2. Golden fixture either unchanged or updated with new optional fields only
3. Cookbook documentation is accurate and reflects implemented behavior

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` — end-to-end FITL production test with granting-event trace verification and non-event regression checks
2. `packages/engine/test/unit/trace/policy-trace-events.test.ts` — update only if trace projection shape changes require it

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

Completed: 2026-04-05

Implemented the granted-operation trace metadata flow end to end:
- preview now exposes granted-operation metadata to evaluation
- evaluation stores and threads that metadata into verbose diagnostics
- production FITL integration coverage proves that a real granting-event candidate emits `grantedOperationSimulated`, `grantedOperationMove`, and `grantedOperationMarginDelta`
- cookbook guidance now explains that bounded multi-step preview complements annotation-based event heuristics

Deviations from original plan:
- the original production acceptance claim, "granting-event score is higher than under single-step preview," was corrected during implementation after audit evidence showed no verified production FITL checkpoint where the current preview-visible scoring surfaces produce that stronger result
- the integration proof now asserts the strongest verified boundary instead: real production grant simulation is exercised, trace details are populated, and non-event candidate scores remain unchanged
- the ticket also produced a broader follow-up spec, [`specs/113-preview-state-policy-surface.md`](specs/113-preview-state-policy-surface.md), because the audit showed a generic preview-observable scoring-surface limitation beyond this ticket's owned boundary

Verification:
- `pnpm -F @ludoforge/engine build`
- `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js`
- `node --test packages/engine/dist/test/unit/agents/policy-diagnostics.test.js packages/engine/dist/test/unit/trace/policy-trace-events.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm run check:ticket-deps`
