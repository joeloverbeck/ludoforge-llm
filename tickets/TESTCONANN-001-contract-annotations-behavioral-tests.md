# TESTCONANN-001: Contract annotations on behavioral integration tests

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — test comments only
**Deps**: None

## Problem

The 3 tests in `fitl-event-free-operation-grants.test.ts` that encode the outcome policy behavioral contract (required grants surfaced at enumeration, policy enforced at apply time) lack contract annotation comments. Without annotations, future contributors cannot tell from reading tests which behavioral contracts they encode. This was the root cause of FREEOP-OUTCOME-001 — code was changed that contradicted the established contract because the tests did not clearly communicate what they proved.

## Assumption Reassessment (2026-03-22)

1. The 3 outcome-policy tests are:
   - `surfaces required non-executionContext grants immediately after event issuance` (line ~2225)
   - `blocks pass during required grant windows and rejects free operations that fail outcome policy` (line ~3500)
   - `rejects overlapping free operations that fail required outcome policy even when pending grants are reordered` (line ~3543)
2. No existing contract annotation pattern exists in the test suite — this ticket establishes the pattern.
3. The tests encode: (a) required grants appear in `legalMoves` unconditionally, (b) `applyMove` rejects moves that fail outcome policy, (c) the split is enumeration-surfaces / apply-enforces.

## Architecture Check

1. Comment-only change — zero risk of behavioral regression. Establishes a reusable annotation pattern for future use.
2. Engine-agnostic: the contract being documented is generic (outcome policy is not game-specific).
3. No shims or aliases.

## What to Change

### 1. Add contract annotation block above the first outcome-policy test

Add a comment block before the first relevant test specifying:
- **Contract name**: `OUTCOME-POLICY-SPLIT`
- **Contract statement**: "Required free-operation grants are surfaced unconditionally at enumeration time (`legal-moves.ts` `isFreeOperationCandidateAdmitted`). The outcome policy (`mustChangeGameplayState`) is enforced at apply time (`apply-move.ts` `validateFreeOperationOutcomePolicy`). These tests prove both halves."
- **Origin**: "Established during FREEOP-OUTCOME-001 resolution (2026-03-22)"

### 2. Add per-test `@contract` tags

On each of the 3 outcome-policy tests, add a brief comment indicating which half of the contract it proves:
- `// @contract OUTCOME-POLICY-SPLIT: required grants surface at enumeration even when outcome policy cannot be satisfied`
- `// @contract OUTCOME-POLICY-SPLIT: required grants suppress pass, surface free-op; applyMove enforces outcome policy`
- `// @contract OUTCOME-POLICY-SPLIT: strongest-grant resolution under overlap preserves enforcement`

## Files to Touch

- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify — add contract annotation comments)

## Out of Scope

- Annotating other behavioral contracts in other test files (future work; this ticket establishes the pattern)
- Creating a contract registry or tooling to extract contract annotations
- Any code changes

## Acceptance Criteria

### Tests That Must Pass

1. No new tests required — comments only
2. Existing suite: `pnpm turbo test`

### Invariants

1. No behavioral changes — diff must contain only comment lines
2. Contract annotations must reference specific source file locations for traceability

## Test Plan

### New/Modified Tests

1. None — comments only

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo test`
