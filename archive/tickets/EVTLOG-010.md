# EVTLOG-010: Consolidate Scope Display Rendering for Event Log Translation

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None - runner-only
**Deps**: none

## Problem

Scope-aware event-log formatting is partially centralized but still split across separate helpers and call sites. Variable change text uses `formatScopePrefix`/`formatScopedVariableChangeClause`, while resource-transfer endpoint text uses `formatResourceEndpoint` with duplicated scope branching and different fallback labels. This creates drift risk when scope semantics evolve (`global`/`perPlayer`/`zone`) and weakens long-term maintainability.

## Assumption Reassessment (2026-02-25)

1. `varChange` effect entries and trigger `varChanged` events already share one variable-change formatter path (`formatScopedVariableChangeClause`).
2. Resource-transfer endpoint scope labeling is handled by a different helper (`formatResourceEndpoint`) with overlapping scope concerns.
3. Current implementation has multiple scope-display decision points with non-identical fallback text (`Player` vs `Per Player`, `Zone`, `Global` endpoint-only label), so consistency relies on parallel logic.
4. Existing tests verify some scope cases (zone/per-player), but not a complete cross-kind consistency matrix for scope actor resolution + fallback behavior.

## Architecture Check

1. A single scope-display context utility with explicit render modes (prefix vs endpoint label) is cleaner and more extensible than parallel helper logic.
2. Centralizing scope actor resolution (player/zone/global + fallback) reduces semantic drift and enables deterministic behavior when new scope-aware messages are added.
3. Keep translation generic: read display labels from `VisualConfigProvider` and player lookup only; no game-specific branches.
4. No compatibility aliases/shims: remove superseded helper branches once unified.

## What to Change

### 1. Introduce unified scope display context utility for translation

Create one internal utility in runner model code that:
- resolves scope actor display value from scope + ids (`global`, `perPlayer`, `zone`)
- supports context-aware rendering needed by current messages:
  - prefix context (for variable-change clauses, e.g. `United States: `)
  - endpoint context (for transfers, e.g. `Global`, `United States`, `Alpha Zone`)
- preserves current user-visible semantics where not intentionally changed.

### 2. Migrate all scope-aware message paths to the unified utility

Apply the shared scope-display contract to:
- variable-change messages (`varChange`, `varChanged`)
- resource-transfer endpoint labels

### 3. Remove superseded helper branches

Delete duplicate/overlapping scope rendering helpers after migration so scope formatting has one source of truth.

### 4. Strengthen tests around scope consistency

Add/adjust tests that cover scope display consistency and fallback behavior across variable-change and resource-transfer messages.

## Files to Touch

- `packages/runner/src/model/translate-effect-trace.ts` (modify)
- `packages/runner/src/model/model-utils.ts` (modify/extend with shared scope display utility)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)
- `packages/runner/test/model/model-utils.test.ts` (modify if utility exported there)

## Out of Scope

- Engine/kernel scope data contracts
- UI component-level event-log styling
- Localization/i18n framework work

## Acceptance Criteria

### Tests That Must Pass

1. Scope labels/prefixes are consistent across variable-change and resource-transfer messages for `global`, `perPlayer`, and `zone`.
2. Fallback behavior is deterministic and validated for missing player/zone labels where applicable.
3. Existing message behavior is preserved where semantics are unchanged.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Scope display semantics are defined in one translation boundary, not duplicated across call sites.
2. Runner translation remains generic and does not introduce game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` - expand coverage with a cross-kind scope-consistency matrix (var change + trigger `varChanged` + resource transfer).
2. `packages/runner/test/model/model-utils.test.ts` - add direct unit tests for shared scope-display utility behavior (normal + fallback paths).

### Commands

1. `pnpm -F @ludoforge/runner test -- translate-effect-trace model-utils`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Added a shared scope-display utility in `packages/runner/src/model/model-utils.ts` (`formatScopeDisplay`) with explicit render contexts (`prefix` and `endpoint`).
  - Migrated `translate-effect-trace.ts` variable-change prefix rendering and resource-transfer endpoint rendering to use the shared utility.
  - Removed duplicate scope-rendering branches in `translate-effect-trace.ts` (`formatScopePrefix` and `formatResourceEndpoint`).
  - Expanded tests for scope consistency and fallback behavior in `translate-effect-trace.test.ts` and `model-utils.test.ts`.
- **Deviation from original plan**:
  - No structural deviation in scope; utility was hosted in `model-utils.ts` as planned and consumed by translation code.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- translate-effect-trace model-utils` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
