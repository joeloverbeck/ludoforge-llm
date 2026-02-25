# EVTLOG-010: Consolidate Scope Display Rendering for Event Log Translation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: none

## Problem

Scope-aware event-log formatting is partially centralized but still split across different helpers/call sites (`varChange`, `varChanged`, and resource-endpoint labeling). This increases drift risk when adding or changing scope semantics (`global`/`perPlayer`/`zone`) and weakens long-term maintainability.

## Assumption Reassessment (2026-02-25)

1. `varChange` and trigger `varChanged` now share scoped variable-change rendering.
2. Resource-transfer endpoint scope labeling is handled by a separate helper with overlapping scope display concerns.
3. **Mismatch + correction**: Scope-label semantics are not yet fully unified behind a single display-context boundary, so formatting consistency still depends on multiple independent functions.

## Architecture Check

1. A single scope-display context for event-log translation is cleaner and more extensible than parallel helper logic, reducing semantic drift and formatter duplication.
2. This keeps game-specific presentation data in `visual-config.yaml` consumption paths and preserves `GameDef`/runtime/simulator agnosticism.
3. No backwards-compatibility aliases/shims are introduced; old helper paths should be removed once unified.

## What to Change

### 1. Introduce unified scope display context for translation

Create a single internal utility/module that resolves scope labels and prefixes for `global`, `perPlayer`, and `zone` from visual config + player lookup.

### 2. Migrate all scope-aware message paths to the unified utility

Apply the same scope-display contract to:

- variable-change messages (`varChange`, `varChanged`)
- resource-transfer endpoint labels

### 3. Remove superseded helper branches

Delete duplicate/overlapping formatting helpers after migration to keep a single source of truth.

## Files to Touch

- `packages/runner/src/model/translate-effect-trace.ts` (modify)
- `packages/runner/src/model/model-utils.ts` (modify or extend, if chosen as utility host)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)

## Out of Scope

- Engine/kernel scope data contracts
- UI component-level event-log styling
- Localization/i18n framework work

## Acceptance Criteria

### Tests That Must Pass

1. Scope labels/prefixes are consistent across variable-change and resource-transfer messages for `global`, `perPlayer`, and `zone`.
2. Existing message behavior is preserved where semantics are unchanged (for example fallback names).
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Scope display semantics are defined in one translation boundary, not duplicated across call sites.
2. Runner translation remains generic and does not introduce game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` — add cross-kind scope-consistency matrix assertions (var change + trigger varChanged + resource transfer).
2. `packages/runner/test/model/model-utils.test.ts` — if shared utility is moved to `model-utils`, add direct unit tests for scope label/prefix resolution and fallbacks.

### Commands

1. `pnpm -F @ludoforge/runner test -- translate-effect-trace model-utils`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
