# PIPEVAL-010: Consolidate edit-distance contract utility for suggestion surfaces

**Status**: COMPLETED (2026-03-05)
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — shared contracts utility extraction + consumer updates
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-008-add-linkedwindow-contract-anti-drift-guards.md`

## Problem

Edit-distance logic is duplicated across contract modules (for example missing-reference suggestions and binding identifier alternatives). Duplication risks subtle behavior drift and increases maintenance cost.

## Assumption Reassessment (2026-03-05)

1. `missing-reference-diagnostic-contract.ts` contains a local Levenshtein implementation and threshold policy for suggestion alternatives.
2. `binding-identifier-contract.ts` contains a separate Levenshtein implementation for ranking in-scope identifier alternatives.
3. There is no shared contract-level distance utility with explicit ownership and guardrails today.
4. Coverage discrepancy: there is no `packages/engine/test/unit/contracts/binding-identifier-contract.test.ts` today. Current binding-identifier coverage is in `packages/engine/test/unit/kernel/binding-identifier-contract.test.ts` and only validates canonical identifier pattern behavior, not alternative-ranking behavior.
5. There is currently no lint/policy guard preventing local `levenshteinDistance` duplication in contract modules.

## Architecture Check

1. A shared contract utility for edit-distance + deterministic sorting is cleaner than per-module implementations and reduces drift risk.
2. This is generic contract infrastructure; it does not introduce game-specific behavior into GameDef/runtime/simulation.
3. No backwards-compatibility aliases/shims are required; consumers can be migrated directly to one utility.
4. Benefit over current architecture: consolidating distance primitives creates a single deterministic contract surface for suggestion/ranking policies; this improves extensibility (future contract suggestion surfaces can reuse one policy module) and lowers regression risk from algorithm drift.

## What to Change

### 1. Introduce shared contract utility

Add a contract utility module for deterministic string-distance computation and ranking primitives used by suggestion surfaces.

### 2. Migrate consumers

Update `missing-reference-diagnostic-contract.ts` and `binding-identifier-contract.ts` to use the shared utility while preserving current external behavior (thresholds, ranking stability, limits, dedupe semantics).

### 3. Add anti-drift guard coverage

Add/extend tests to ensure consumer modules do not reintroduce local Levenshtein implementations.

## Files to Touch

- `packages/engine/src/contracts/<new-shared-distance-utility>.ts` (new)
- `packages/engine/src/contracts/missing-reference-diagnostic-contract.ts` (modify)
- `packages/engine/src/contracts/binding-identifier-contract.ts` (modify)
- `packages/engine/src/contracts/index.ts` (modify, if utility is part of intended public surface)
- `packages/engine/test/unit/contracts/missing-reference-diagnostic-contract.test.ts` (modify)
- `packages/engine/test/unit/contracts/binding-identifier-contract.test.ts` (new)
- `packages/engine/test/unit/kernel/binding-identifier-contract.test.ts` (modify only if canonical-pattern coverage needs to delegate/shared imports; otherwise no change)
- `packages/engine/test/unit/lint/<new-or-existing-contract-distance-policy-test>.test.ts` (new/modify)

## Out of Scope

- Changing suggestion UX text, diagnostic code taxonomy, or broader validation semantics
- Any GameSpecDoc or visual-config behavioral changes
- Non-contract refactors outside suggestion/identifier alternative ownership

## Acceptance Criteria

### Tests That Must Pass

1. Missing-reference suggestion behavior remains stable (alternatives/threshold behavior preserved).
2. Binding-identifier alternative ranking behavior remains stable.
3. Policy coverage fails if local duplicate distance implementations are reintroduced in migrated modules.
4. Existing suite: `pnpm turbo test --force`

### Invariants

1. Edit-distance algorithm ownership is centralized for contract suggestion surfaces.
2. GameDef and simulation remain game-agnostic and unaffected by this refactor.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/contracts/missing-reference-diagnostic-contract.test.ts` — verify behavior remains stable after utility extraction.
2. `packages/engine/test/unit/contracts/binding-identifier-contract.test.ts` (new) — verify ranking behavior remains stable after utility extraction.
3. `packages/engine/test/unit/lint/<new-or-existing-contract-distance-policy-test>.test.ts` — anti-drift coverage for centralized utility ownership.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/contracts/missing-reference-diagnostic-contract.test.js packages/engine/dist/test/unit/contracts/binding-identifier-contract.test.js packages/engine/dist/test/unit/lint/contracts-edit-distance-source-guard.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

Implemented as planned with one scope correction:

1. Added `packages/engine/src/contracts/edit-distance-contract.ts` as the shared owner of `levenshteinDistance` + deterministic ranking primitives.
2. Migrated both consumers (`missing-reference-diagnostic-contract.ts` and `binding-identifier-contract.ts`) to shared ranking logic without changing external behavior contracts (thresholds/limits/tie ordering).
3. Added missing binding-alternative behavioral coverage in `packages/engine/test/unit/contracts/binding-identifier-contract.test.ts` (new), since no such contract test existed previously.
4. Strengthened missing-reference behavior coverage with tie-order assertions.
5. Added anti-drift policy guard `packages/engine/test/unit/lint/contracts-edit-distance-source-guard.test.ts` to prevent local Levenshtein duplication from returning.
