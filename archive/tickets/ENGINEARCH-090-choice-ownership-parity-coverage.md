# ENGINEARCH-090: Choice Ownership Parity Coverage for `chooseN` and Pipeline Paths

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test coverage and minor contract cleanup if needed
**Deps**: tickets/ENGINEARCH-088-decision-authority-context-hardening.md

## Problem

Current ownership tests cover `chooseOne` non-pipeline scenarios but do not fully cover `chooseN` ownership enforcement or staged pipeline execution parity.

## Assumption Reassessment (2026-02-27)

1. `chooseOne` ownership behavior is already covered in non-pipeline legality/apply/decision-sequence tests.
2. `chooseN` ownership enforcement parity is not covered with the same depth.
3. Pipeline-stage ownership parity is not explicitly covered for chooser-owned pending decisions and cross-seat resolution rejection.
4. Mismatch corrected: scope is parity coverage expansion only; no runtime behavior redesign is required by this ticket.

## Architecture Check

1. Parity tests are essential architecture guardrails for a generic engine contract.
2. Coverage remains game-agnostic and independent of GameSpecDoc game-specific content.
3. No compatibility code paths; this is specification-strengthening through tests.

## What to Change

### 1. Add `chooseN` ownership enforcement tests

Cover legality discover/evaluate, move decision sequence resolution, and apply execution with ownership mismatch/match outcomes.

### 2. Add pipeline-stage ownership parity tests

Cover staged action pipelines where chooser-owned pending decisions arise in pipeline stages, including ownership metadata and cross-seat rejection behavior.

### 3. Clarify request-contract expectations in tests

Assert parity for `decisionPlayer` metadata and rejection behavior across `chooseOne`/`chooseN` and pipeline/non-pipeline paths.

## Files to Touch

- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add)
- `packages/engine/test/unit/apply-move.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify/add)

## Out of Scope

- New runtime features beyond coverage/contract assertions.
- Runner/UI behavior.

## Acceptance Criteria

### Tests That Must Pass

1. `chooseN` ownership mismatch is rejected and match is accepted in legality, decision-sequence, and apply paths.
2. Pipeline-stage chooser-owned decision behavior matches non-pipeline ownership semantics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `chooseOne`/`chooseN` ownership semantics are parity-locked by tests.
2. Pipeline and non-pipeline decision semantics remain equivalent for ownership checks.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — `chooseN` ownership and staged-pipeline pending metadata/enforcement parity.
2. `packages/engine/test/unit/apply-move.test.ts` — apply enforcement parity for `chooseN` in non-pipeline and pipeline-generated decisions.
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — decision-sequence ownership parity across `chooseOne`/`chooseN`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
4. `node --test packages/engine/dist/test/unit/apply-move.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-27
- What changed:
  - Added `chooseN` chooser-ownership parity tests in legality (`legalChoicesDiscover`/`legalChoicesEvaluate`), apply (`applyMove`), and decision-sequence resolution helpers.
  - Added explicit pipeline-stage ownership parity tests for chooser-owned `chooseN` decisions, including pending metadata (`decisionPlayer`) and cross-seat rejection.
  - Corrected ticket assumptions/scope to reflect that `chooseOne` ownership coverage already existed in non-pipeline paths, while `chooseN` and pipeline-stage parity were the actual gaps.
- Deviations from original plan:
  - No integration test file changes were needed; unit coverage was sufficient to lock the intended invariants.
  - No runtime/kernel behavior changes were required; this ticket closed as coverage/contract hardening only.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - Targeted tests for modified files passed.
  - `pnpm -F @ludoforge/engine test` passed (`307` pass, `0` fail).
  - `pnpm -F @ludoforge/engine lint` passed.
