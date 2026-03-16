# 63CHOOPEROPT-003: Singleton probe pass for large-domain chooseN

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — legal-choices.ts, new choose-n-option-resolution.ts
**Deps**: 63CHOOPEROPT-001, 63CHOOPEROPT-002

## Problem

For domains above the exact-enumeration threshold, the engine currently has no option-level resolution. The singleton probe pass provides O(n) fast filtering by probing each candidate option individually using the discover-only path.

## Assumption Reassessment (2026-03-15)

1. `legalChoicesDiscover()` already exists as the discover-only path (no option legality evaluation). Used by MCTS.
2. The probe for `[...currentSelected, option]` must NOT compute nested option hints — it's a satisfiability check only.
3. `classifyProbeOutcomeLegality` already exists and classifies probe results into legal/illegal/unknown categories.
4. The probe path must handle stochastic and ambiguous outcomes (classified in 63CHOOPEROPT-006).

## Architecture Check

1. The probe helper reuses existing `legalChoicesWithPreparedContextStrict` with `shouldEvaluateOptionLegality = false`.
2. New file `choose-n-option-resolution.ts` keeps the growing resolver logic out of the already-large `legal-choices.ts`.
3. No game-specific logic. Pure kernel optimization.

## What to Change

### 1. Create `choose-n-option-resolution.ts`

New module with:
- `runSingletonProbePass()` — iterates unresolved options, probes each with `[...currentSelected, option]`
- Probe classification per spec 4.4:
  - probe illegal → `illegal`, `resolution: 'exact'`
  - probe satisfiable AND already confirmable at this size → `legal`, `resolution: 'exact'`
  - probe satisfiable but needs further picks → unresolved (candidate for witness search)
  - probe stochastic → `unknown`, `resolution: 'stochastic'`
  - probe ambiguous → `unknown`, `resolution: 'ambiguous'`
- The probe helper must accept a `PreparedContext` to avoid re-creating it per probe.

### 2. Wire singleton pass into strategy dispatcher

In `legal-choices.ts`, update the large-domain branch of the strategy dispatcher:
```
1. Static filtering (already done in buildChooseNPendingChoice)
2. resolveChooseNOptionsExhaustive() for small domains
3. NEW: runSingletonProbePass() for large domains
4. Unresolved options after probe → unknown/provisional (witness search in 004)
```

### 3. Extract discover-only probe helper

Create a focused probe function that:
- Accepts `PreparedContext`, `partialMove`, selected set
- Calls the discover path (not evaluate) — `shouldEvaluateOptionLegality = false`
- Returns a structured `ProbeSummary` (satisfiable, confirmable, stochastic, illegal, etc.)
- Decrements and checks the `MAX_CHOOSE_N_TOTAL_PROBE_BUDGET`

## Files to Touch

- `packages/engine/src/kernel/choose-n-option-resolution.ts` (new)
- `packages/engine/src/kernel/legal-choices.ts` (modify — wire in singleton pass)

## Out of Scope

- Witness search (63CHOOPEROPT-004)
- Canonical selection keys / bitset caches (63CHOOPEROPT-008)
- Selected-sequence validation (63CHOOPEROPT-005)
- Worker-local session (Phase B)
- `advance-choose-n.ts` changes
- UI changes

## Acceptance Criteria

### Tests That Must Pass

1. New test: 20-option domain with cardinality 1–3 — singleton pass resolves some options as exact `illegal`, remainder as `unknown`/`provisional`
2. New test: option that is immediately confirmable at `selected+1` size → marked `legal`, `resolution: 'exact'`
3. New test: probe budget is consumed — assert exact probe count equals number of unresolved options (no recursive nested probing)
4. New test: oracle parity — for small domains where both exhaustive and singleton pass can run, every `illegal` from singleton is also `illegal` in oracle (no false negatives on illegality)
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Singleton probe MUST NOT mark an option `legal` unless it is immediately confirmable at the probed size. Satisfiable-but-needs-further-picks → unresolved.
2. Probe path MUST NOT compute nested option legality (`shouldEvaluateOptionLegality = false`).
3. Probe count equals number of unresolved options — no combinatorial explosion.
4. Deterministic: stable option iteration order, count-based budget.
5. `PreparedContext` is shared across all probes in a single `mapChooseNOptions` call.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choose-n-option-resolution.test.ts` — singleton probe pass behavior, budget tracking, classification accuracy
2. Modify `packages/engine/test/unit/kernel/legal-choices.test.ts` — add large-domain fixtures that exercise the singleton path

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-15
- **What changed**:
  - `packages/engine/src/kernel/choose-n-option-resolution.ts`: New module with `runSingletonProbePass()`, `SingletonProbeOutcome` type, `SingletonProbeBudget` interface, and `classifySingletonProbe()` helper. Handles cardinality mismatch errors as unresolved, owner mismatch as ambiguous.
  - `packages/engine/src/kernel/legal-choices.ts`: Exported `optionKey` and `isChoiceDecisionOwnerMismatchDuringProbe`. Replaced large-domain provisional fallback in `mapChooseNOptions` with `runSingletonProbePass()` using `MAX_CHOOSE_N_TOTAL_PROBE_BUDGET`.
  - `packages/engine/src/kernel/index.ts`: Added export for `choose-n-option-resolution.ts`.
  - `packages/engine/test/unit/kernel/choose-n-option-resolution.test.ts`: Updated existing large-domain test (now expects legal+exact from singleton probe for min=1 enums), added 4 new tests: high-min unresolved/provisional, probe count tracking, oracle parity, immediately confirmable.
  - `packages/engine/test/unit/kernel/choose-n-strategy-dispatch.test.ts`: Updated 3 tests for singleton probe behavior (large-domain routing, mixed surface, selected options).
- **Deviations**: Added catch for `CHOICE_RUNTIME_VALIDATION_FAILED` errors (cardinality mismatch when probe selection is below min). This was not explicitly in the ticket but is required for correct behavior — without it, probing options with min > 1 would throw unhandled errors.
- **Verification**: 4667 tests pass, 0 failures. Typecheck clean (3/3 packages).
