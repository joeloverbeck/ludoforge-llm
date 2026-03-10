# ENGINE-002: Restore full denial context for unresolved free-operation overlap

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — free-operation discovery analysis and kernel denial-contract tests
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/src/kernel/free-operation-denial-contract.ts`, `packages/engine/src/kernel/free-operation-viability.ts`, `packages/engine/test/unit/kernel/legality-surface-parity.test.ts`, `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts`, `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`

## Problem

The current unresolved exact-zone overlap fix preserves the denial cause, but it can drop `matchingGrantIds` from the free-operation denial payload when ambiguity is inferred from unresolved zone-filter grants rather than fully matched zone-filter grants. That weakens runtime diagnostics and breaks the intended contract that denial context should still identify the matched grant set.

## Assumption Reassessment (2026-03-10)

1. `packages/engine/src/kernel/free-operation-discovery-analysis.ts` now computes ambiguity from `unresolvedZoneFilterGrants` when zone filters cannot yet be evaluated because relevant bindings are unresolved.
2. In the `ambiguousOverlap` branch, `matchingGrantIds` is still populated from `zoneMatchedGrants`, which is empty on that unresolved path.
3. Existing tests assert `ambiguousGrantIds` and `cause`, but there is no focused regression test proving `matchingGrantIds` remains populated for unresolved-overlap denials.

## Architecture Check

1. The clean fix is to preserve one canonical denial payload shape regardless of whether overlap was detected from fully matched grants or unresolved-yet-competing grants.
2. This stays fully game-agnostic: the kernel only preserves generic free-operation authorization metadata and does not introduce any game-specific behavior into `GameDef`, simulation, or runtime.
3. No backwards-compatibility shims should be added. The denial contract should be corrected at the source, not patched by consumers.

## What to Change

### 1. Correct unresolved-overlap denial payload assembly

Ensure `ambiguousOverlap` returns a meaningful `matchingGrantIds` set even when ambiguity is computed from unresolved zone-filter grants.

### 2. Lock the denial payload contract with tests

Add focused test coverage that asserts unresolved exact-zone ambiguity preserves both `matchingGrantIds` and `ambiguousGrantIds`, and that downstream consumers continue to see the expected denial metadata.

## Files to Touch

- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify or add assertion coverage)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify only if an integration assertion adds signal)

## Out of Scope

- Changing free-operation overlap ranking rules.
- Any FITL event-data changes.
- Broad redesign of discovery-time ambiguity probing.

## Acceptance Criteria

### Tests That Must Pass

1. An unresolved exact-zone ambiguous-overlap denial retains non-empty `matchingGrantIds`.
2. `ambiguousGrantIds` and `matchingGrantIds` remain coherent for the unresolved-overlap path.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `FreeOperationBlockExplanation` stays consistent across discovery, legality, and runtime-error surfaces.
2. Free-operation denial payloads remain game-agnostic metadata derived only from move/grant structure.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — add a denial-context contract assertion for unresolved exact-zone ambiguity.
2. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — assert unresolved ambiguity preserves full denial context, not just the denial cause.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add or tighten an integration assertion only if it materially validates consumer-visible denial context.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/kernel/runtime-error-contracts.test.js dist/test/unit/kernel/legality-surface-parity.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
