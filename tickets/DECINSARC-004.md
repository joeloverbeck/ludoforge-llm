# DECINSARC-004: Rewrite move construction and legal-choices to use DecisionKey

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `move-decision-sequence.ts`, `legal-choices.ts`
**Deps**: DECINSARC-001, DECINSARC-002, DECINSARC-003

## Problem

`move-decision-sequence.ts` reconstructs `DecisionOccurrence` structs from `ChoicePendingRequest` fields and calls `writeMoveParamForDecisionOccurrence()` to populate move params. `legal-choices.ts` builds discovery contexts that rely on the old occurrence machinery. Both need to use `DecisionKey` directly.

## Assumption Reassessment (2026-03-13)

1. `move-decision-sequence.ts` (~180 lines) — `resolveMoveDecisionSequence()` calls `writeMoveParamForDecisionOccurrence()` with a manually reconstructed occurrence object from 9+ fields — confirmed.
2. `legal-choices.ts` (~150+ lines) — `executeDiscoveryEffectsStrict()` and `executeDiscoveryEffectsProbe()` create discovery contexts via factory functions — confirmed. These now need `decisionScope` instead of `decisionOccurrences`.
3. `writeMoveParamForDecisionOccurrence` and `resolveMoveParamForDecisionOccurrence` are both from `decision-occurrence.ts` — confirmed, these calls must be replaced.

## Architecture Check

1. Move params keyed by `DecisionKey` strings directly — `move.params[request.decisionKey] = selectedValue`. No multi-key lookup strategy needed.
2. Discovery contexts get `decisionScope` from factory functions (updated in DECINSARC-002). No special handling.
3. Massive simplification — `resolveMoveDecisionSequence` reduces from ~80 lines of occurrence reconstruction to ~10 lines of direct key usage.

## What to Change

### 1. Rewrite `move-decision-sequence.ts` — `resolveMoveDecisionSequence()`

- Replace `writeMoveParamForDecisionOccurrence(move.params, occurrence, selected)` with direct `move.params[request.decisionKey] = selected`
- Remove the entire `DecisionOccurrence` reconstruction block (lines building `decisionIndex`, `decisionOccurrenceKey`, `nameIndex`, etc.)
- Remove imports from `decision-occurrence.ts`
- When reading pending request, use `request.decisionKey` directly

### 2. Rewrite `move-decision-sequence.ts` — any `normalizeDecisionParams` calls

- If `normalizeDecisionParams()` or `normalizeDecisionParamsForMove()` is called here, replace with direct `decisionKey` usage (no alias fallback chain needed)

### 3. Update `legal-choices.ts` — discovery context creation

- Ensure `executeDiscoveryEffectsStrict()` and `executeDiscoveryEffectsProbe()` pass a valid `decisionScope` (via the updated factory functions from DECINSARC-002)
- Remove any references to `decisionOccurrences` or `iterationPath` from context building

### 4. Remove old imports

- Remove all imports of `writeMoveParamForDecisionOccurrence`, `resolveMoveParamForDecisionOccurrence`, `decisionOccurrenceKey`, `consumeDecisionOccurrence` from both files

## Files to Touch

- `packages/engine/src/kernel/move-decision-sequence.ts` (modify — major simplification)
- `packages/engine/src/kernel/legal-choices.ts` (modify — context creation update)

## Out of Scope

- Modifying `effects-choice.ts`, `effects-control.ts`, `effect-dispatch.ts` (done in DECINSARC-003)
- Deleting `decision-occurrence.ts` or `decision-id.ts` (DECINSARC-005)
- Modifying test helpers (DECINSARC-006)
- Modifying runner code (DECINSARC-007)
- Any game-specific logic

## Acceptance Criteria

### Tests That Must Pass

1. `resolveMoveDecisionSequence` correctly writes selected values to `move.params` keyed by `DecisionKey`
2. Multi-decision moves (compound actions with 2+ choices) populate all keys correctly
3. `executeDiscoveryEffectsStrict` returns pending choices with valid `decisionKey` field
4. `executeDiscoveryEffectsProbe` returns pending choices with valid `decisionKey` field
5. Probe vs strict discovery semantics remain unchanged (probe allows stacking violations, strict does not)
6. Chooser-owned decisions still enforce authority correctly
7. Engine build passes: `pnpm -F @ludoforge/engine build`
8. **Note**: Tests that construct `ChoicePendingRequest` with old fields will still fail until DECINSARC-006.

### Invariants

1. `move.params` is keyed exclusively by `DecisionKey` strings — no fallback alias keys.
2. No `DecisionOccurrenceContext` referenced anywhere in these files.
3. No multi-key lookup strategy — one key, one lookup.
4. Discovery and execution modes both use the same `DecisionKey` for the same decision.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — update tests for `DecisionKey`-based param writing
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — update discovery context tests

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
