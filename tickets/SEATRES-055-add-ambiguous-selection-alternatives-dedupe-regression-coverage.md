# SEATRES-055: Add ambiguous-selection alternatives dedupe regression coverage

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — CNL selection contract test coverage
**Deps**: archive/tickets/SEATRES/SEATRES-039-unify-cnl-identifier-normalization-and-selection-alternatives.md

## Problem

`selectDataAssetById()` now deduplicates alternatives by normalized identity, but current regression coverage only asserts this in explicit selector missing-reference flow. The ambiguous-selection path (`selectedId === undefined` with multiple assets) does not yet lock the same alternatives contract.

## Assumption Reassessment (2026-03-03)

1. `selectDataAssetById()` now builds alternatives from normalized ids via dedupe + stable sort. **Verified.**
2. `data-asset-selection.test.ts` currently covers normalized dedupe under explicit missing-reference, not ambiguous-selection. **Verified.**
3. No active ticket in `tickets/*` currently scopes this missing ambiguity-path regression coverage specifically. **Verified.**

## Architecture Check

1. Locking the alternatives contract across both failure modes is cleaner than relying on incidental implementation behavior.
2. This is pure game-agnostic CNL policy testing; it does not add game-specific branching or move behavior into `GameDef`/runtime.
3. No backwards-compatibility aliases/shims; this ticket only hardens invariant coverage.

## What to Change

### 1. Add ambiguity-path normalized dedupe assertion

Add a unit test where `selectedId` is omitted, multiple assets collide after normalization, and expected `alternatives` are deduplicated canonical values.

### 2. Add policy pass-through coverage

Add/adjust a policy-layer test so `selectScenarioLinkedAssetWithPolicy()` ambiguity diagnostics observe the same deduplicated alternatives contract from `selectDataAssetById()`.

## Files to Touch

- `packages/engine/test/unit/data-asset-selection.test.ts` (modify)
- `packages/engine/test/unit/data-asset-selection-policy.test.ts` (modify)

## Out of Scope

- Changing selection algorithm semantics
- Changing diagnostic code taxonomy/messages
- Runtime/kernel simulation behavior

## Acceptance Criteria

### Tests That Must Pass

1. `selectDataAssetById()` ambiguous-selection path returns normalized, deduplicated, sorted alternatives.
2. Scenario-linked policy ambiguity diagnostics reflect deduplicated alternatives with no duplicate normalized ids.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Alternatives contract is deterministic and normalized across all selection failure modes.
2. Selection policy remains game-agnostic and independent of visual config concerns.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/data-asset-selection.test.ts` — add ambiguous-selection normalized-collision alternatives assertion. Rationale: closes uncovered failure-mode branch.
2. `packages/engine/test/unit/data-asset-selection-policy.test.ts` — add ambiguity-dialect assertion for deduped alternatives. Rationale: verifies policy-layer pass-through contract.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/data-asset-selection.test.js`
3. `node --test packages/engine/dist/test/unit/data-asset-selection-policy.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo typecheck && pnpm turbo lint`
