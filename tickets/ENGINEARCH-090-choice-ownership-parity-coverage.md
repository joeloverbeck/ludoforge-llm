# ENGINEARCH-090: Choice Ownership Parity Coverage for `chooseN` and Pipeline Paths

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test coverage and minor contract cleanup if needed
**Deps**: tickets/ENGINEARCH-088-decision-authority-context-hardening.md

## Problem

Current ownership tests cover `chooseOne` non-pipeline scenarios but do not fully cover `chooseN` ownership enforcement or staged pipeline execution parity.

## Assumption Reassessment (2026-02-27)

1. `chooseOne` ownership behavior has direct tests in legality/apply paths.
2. Equivalent `chooseN` ownership and pipeline-stage parity tests are missing.
3. Mismatch: architecture intent is parity across choice primitives and execution modes; corrected scope is targeted coverage to lock invariants.

## Architecture Check

1. Parity tests are essential architecture guardrails for a generic engine contract.
2. Coverage remains game-agnostic and independent of GameSpecDoc game-specific content.
3. No compatibility code paths; this is specification-strengthening through tests.

## What to Change

### 1. Add `chooseN` ownership enforcement tests

Cover legality discover/evaluate and apply execution with ownership mismatch/match outcomes.

### 2. Add pipeline-stage ownership tests

Cover staged action pipelines where pending decisions arise in pipeline stages, including ownership metadata and enforcement behavior.

### 3. Clarify request-contract expectations in tests

Assert which choice request variants carry ownership metadata and keep assertions consistent across paths.

## Files to Touch

- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add)
- `packages/engine/test/unit/apply-move.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify/add)
- `packages/engine/test/integration/decision-sequence.test.ts` (modify/add if needed)

## Out of Scope

- New runtime features beyond coverage/contract assertions.
- Runner/UI behavior.

## Acceptance Criteria

### Tests That Must Pass

1. `chooseN` ownership mismatch is rejected and match is accepted in legality + apply paths.
2. Pipeline-stage choice ownership behaves identically to non-pipeline paths.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `chooseOne`/`chooseN` ownership semantics are parity-locked by tests.
2. Pipeline and non-pipeline decision semantics remain equivalent for ownership checks.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — `chooseN` ownership and staged pipeline pending metadata parity.
2. `packages/engine/test/unit/apply-move.test.ts` — apply enforcement parity for `chooseN` and pipeline-generated decisions.
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — probing parity across `chooseOne`/`chooseN` with ownership context.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
4. `node --test packages/engine/dist/test/unit/apply-move.test.js`
5. `pnpm -F @ludoforge/engine test`
