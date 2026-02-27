# ENGINEARCH-097: Cross-Seat Choice Probe Authority Decoupling

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel legality probing + choice ownership enforcement path
**Deps**: tickets/ENGINEARCH-089-pending-choice-authority-binding.md

## Problem

`legalChoicesEvaluate` can throw `choiceRuntimeValidationFailed` for cross-seat chooser decisions before a decision is submitted, because legality probing currently simulates selections under active-seat authority. This breaks pending-choice introspection for cross-seat flows and makes legality evaluation brittle.

## Assumption Reassessment (2026-02-27)

1. Current code probes option legality by injecting candidate move params and recursively executing discovery logic.
2. Choice ownership validation now reads engine-owned `decisionAuthority` and rejects mismatches during effect evaluation.
3. Mismatch: pending-choice introspection and submitted-choice ownership validation are currently coupled. Corrected scope: decouple probing authority from resolution authority so probing remains deterministic and non-throwing while ownership checks stay strict for resolution.

## Architecture Check

1. Separating probe-time and resolution-time authority concerns is cleaner than using one path for both, and avoids brittle control-flow exceptions.
2. This stays game-agnostic: no game-specific IDs or branching in GameDef/runtime.
3. No backwards-compatibility aliases; adopt one explicit legality-probing contract.

## What to Change

### 1. Add explicit probe-time choice ownership behavior

In legality evaluation/probing mode, avoid hard failure when a candidate decision value belongs to a different chooser seat; instead classify as illegal/unknown deterministically without throwing.

### 2. Preserve strict resolution-time ownership checks

Keep current hard ownership enforcement when actually resolving submitted move params.

### 3. Add regression coverage for cross-seat probing

Cover `legalChoicesEvaluate` and decision-sequence probing for chooser-owned cross-seat decisions to guarantee pending introspection remains stable.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify/add)

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

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — cross-seat pending evaluation remains queryable (no throw).
2. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — probing behavior classifies cross-seat candidates without runtime crashes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
