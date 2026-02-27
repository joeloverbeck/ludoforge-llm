# ENGINEARCH-097: Cross-Seat Choice Probe Authority Decoupling

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel legality probing behavior for pending choice option evaluation
**Deps**: Delivered by [archive/tickets/ENGINEARCH-089-pending-choice-authority-binding.md](../archive/tickets/ENGINEARCH-089-pending-choice-authority-binding.md)

## Problem

`legalChoicesEvaluate` can throw `choiceRuntimeValidationFailed` for cross-seat chooser decisions before a decision is submitted, because legality probing currently simulates selections under active-seat authority. This breaks pending-choice introspection for cross-seat flows and makes legality evaluation brittle.

## Assumption Reassessment (2026-02-27)

1. Confirmed: `legalChoicesEvaluate` computes option legality by probing injected candidate decision params via `mapOptionsForPendingChoice` and recursive satisfiability classification.
2. Confirmed: `chooseOne`/`chooseN` ownership checks in `effects-choice.ts` enforce `decisionAuthority.player === chooser` whenever a decision param is present.
3. Confirmed mismatch: for chooser-owned cross-seat pending requests, legality probing can hit `choiceRuntimeValidationFailed` (`decision owner mismatch`) before any user-submitted decision exists.
4. Confirmed existing contract: submitted cross-seat decision params are currently rejected in both `legal-choices.test.ts` and `move-decision-sequence.test.ts`; this remains in scope and must not regress.
5. Corrected scope: harden probe-time behavior in `legalChoicesEvaluate` only, so pending introspection is non-throwing and deterministic while resolution/submitted-param ownership enforcement remains strict.

## Architecture Check

1. Separating probe-time and resolution-time authority concerns is cleaner than using one path for both, and avoids brittle control-flow exceptions.
2. This stays game-agnostic: no game-specific IDs or branching in GameDef/runtime.
3. No backwards-compatibility aliases; adopt one explicit legality-probing contract.

## What to Change

### 1. Add explicit probe-time choice ownership behavior

In legality option probing (`legalChoicesEvaluate` internal candidate probes), avoid hard failure when injected candidate decision values trigger chooser-ownership mismatch. Classify these candidates deterministically (`unknown`/`illegal`) instead of throwing.

### 2. Preserve strict submitted-param ownership checks

Keep current hard ownership enforcement for submitted cross-seat decision params (existing behavior covered by current unit tests).

### 3. Add regression coverage for cross-seat probing

Add/adjust unit coverage so `legalChoicesEvaluate` for chooser-owned cross-seat pending requests returns a pending request with deterministic option legality metadata and does not throw.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (verify no-regression only; code changes not expected)

## Out of Scope

- Replay/stale-token binding protocol design (`decisionContextId`) beyond this fix.
- Runner/UI transport authentication.

## Acceptance Criteria

### Tests That Must Pass

1. `legalChoicesEvaluate` for cross-seat chooser with no submitted decision returns pending request and does not throw.
2. Cross-seat submitted decisions still fail ownership checks unless authority context is valid for resolution.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Ownership enforcement stays strict for resolution paths.
2. Legality probing remains deterministic and non-game-specific.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — cross-seat pending evaluation remains queryable (no throw) and returns deterministic option legality metadata.
2. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — existing cross-seat submitted-param rejection assertions remain green (no-regression guard).
3. `packages/engine/test/unit/kernel/runtime-reasons.test.ts` — canonical runtime reason registry includes the explicit probe-authority mismatch reason.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-27
- **What changed**:
  - Introduced explicit decision-authority ownership policy (`strict` vs `probe`) in core runtime context so probing and resolution authority semantics are first-class instead of inferred from exceptions.
  - Updated choice-effect ownership mismatch handling in [`packages/engine/src/kernel/effects-choice.ts`](../packages/engine/src/kernel/effects-choice.ts) to emit a dedicated probe-time reason (`choiceProbeAuthorityMismatch`) under discovery probing policy.
  - Hardened legality option probing in [`packages/engine/src/kernel/legal-choices.ts`](../packages/engine/src/kernel/legal-choices.ts) so probe-time chooser ownership mismatches are classified deterministically (`unknown`) instead of throwing.
  - Added regression assertions in [`packages/engine/test/unit/kernel/legal-choices.test.ts`](../packages/engine/test/unit/kernel/legal-choices.test.ts) for both direct and pipeline choice primitives: `legalChoicesEvaluate` now remains queryable for cross-seat pending requests.
  - Extended runtime reason taxonomy coverage in [`packages/engine/test/unit/kernel/runtime-reasons.test.ts`](../packages/engine/test/unit/kernel/runtime-reasons.test.ts).
  - Preserved strict submitted-param ownership enforcement for cross-seat decisions (existing rejection tests remain green).
- **Deviations from original plan**:
  - We intentionally expanded the implementation beyond the initial minimal fix to improve architecture: authority-enforcement policy is now explicit in runtime contracts instead of being represented indirectly through catch-time heuristics.
  - `effects-choice.ts`, `types-core.ts`, and runtime reason taxonomy files were updated to encode the policy cleanly and explicitly.
  - `move-decision-sequence.test.ts` did not need new assertions; existing cross-seat rejection coverage already enforces the strict submitted-param contract.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (309 passed, 0 failed)
  - `pnpm -F @ludoforge/engine lint` ✅
