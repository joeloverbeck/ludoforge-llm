# ENGINEARCH-089: Pending-Choice Replay Safety via Deterministic Recompute Contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No runtime feature changes; test coverage hardening only
**Deps**: archive/tickets/ENGINEARCH-088-decision-authority-context-hardening.md

## Problem

The original ticket proposed introducing a new `decisionContextId` token. After reassessing the current kernel, that assumption is stale: authority and pending-choice identity are already engine-owned and recomputed from current state.

The actual remaining risk is weaker coverage around stale/replayed params. We should lock the existing architecture with explicit tests instead of introducing redundant runtime identity tokens.

## Assumption Reassessment (2026-02-27)

1. `ENGINEARCH-088` already removed caller authority overrides and made decision authority engine-owned.
2. Pending choice identity is already state-derived and deterministic through `decisionId` composition/scoping (`composeScopedDecisionId`) plus current-state legality evaluation.
3. Choice resolution already enforces chooser ownership (`decisionPlayer`) and option-domain membership in runtime paths.
4. Discrepancy in original 089: it assumed missing authority binding and listed kernel runtime files for feature work. Corrected scope is coverage hardening for replay/staleness invariants.

## Architecture Reassessment

1. Adding a second explicit binding token now is not a net architectural improvement.
2. It duplicates state-derived identity contracts already enforced by legality/apply pipelines and would add protocol surface without increasing core determinism.
3. Stronger tests on existing deterministic recompute behavior provide cleaner long-term architecture than introducing parallel identity channels.
4. No compatibility shims or aliasing paths are needed.

## What to Change

### 1. Add stale decision payload rejection coverage

Add tests proving that when pending decision identity changes across state transitions, previously captured decision params do not satisfy current pending requests.

### 2. Add replay determinism coverage across discovery/apply/sequence paths

Add or strengthen tests that assert replayed/cross-seat decision payloads are rejected deterministically through existing ownership and legality contracts.

### 3. Keep contracts engine-generic

Ensure test fixtures remain generic engine behavior checks with no game-specific runtime branching.

## Files to Touch

- `packages/engine/test/unit/apply-move.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add if needed)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify/add if needed)

## Out of Scope

- New runtime identity/token fields (for example `decisionContextId`).
- Network/session transport APIs.
- Persisted save-game migration.

## Acceptance Criteria

### Tests That Must Pass

1. Replayed stale decision params are rejected when they do not match the current pending decision identity.
2. Cross-seat ownership mismatch remains rejected deterministically across discovery/evaluate/apply/sequence paths.
3. Existing suite passes: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Decision identity/authority remain engine-owned and game-agnostic.
2. Choice resolution preserves existing option-domain legality semantics.
3. No additional runtime token channels are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/apply-move.test.ts` — stale decision param replay rejection under changed pending decision identity.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — ownership/replay determinism assertions (only if current coverage gaps are found).
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — deterministic rejection behavior for stale or ownership-invalid supplied params (only if current coverage gaps are found).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/apply-move.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
5. `pnpm -F @ludoforge/engine lint`
6. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-02-27
- **What changed**:
  - Reassessed the original token-based proposal against current engine architecture and corrected scope to coverage hardening.
  - Added replay/staleness contract tests across discover/apply/decision-sequence paths:
    - `packages/engine/test/unit/kernel/legal-choices.test.ts`
    - `packages/engine/test/unit/apply-move.test.ts`
    - `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
  - Fixed a compile-time call-site regression in `packages/engine/src/kernel/apply-move.ts` (`validateMove` arity mismatch in simultaneous submission flow), uncovered during hard-test execution.
- **Deviation from original plan**:
  - Did not introduce `decisionContextId` or any new runtime token channel.
  - Chose to preserve the current deterministic architecture (engine-owned authority + recomputed decision identity) and lock it with stronger tests.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/apply-move.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (307 passed, 0 failed)
