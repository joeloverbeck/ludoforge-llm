# ENGINE-002: Restore full denial context for unresolved free-operation overlap

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — free-operation discovery analysis and kernel denial-contract tests
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/test/unit/kernel/apply-move.test.ts`, `packages/engine/test/unit/kernel/legality-surface-parity.test.ts`, `packages/engine/test/unit/kernel/legal-choices.test.ts`, `packages/engine/test/unit/kernel/legal-moves.test.ts`, `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts`

## Problem

The current unresolved exact-zone overlap fix preserves the denial cause, but it drops `matchingGrantIds` from the free-operation denial payload when ambiguity is inferred from unresolved zone-filter grants rather than fully matched zone-filter grants. That weakens runtime diagnostics and breaks the intended contract that denial context should still identify the competing grant set that caused the denial.

## Assumption Reassessment (2026-03-10)

1. `packages/engine/src/kernel/free-operation-discovery-analysis.ts` computes ambiguity from `unresolvedZoneFilterGrants` when zone-filter evaluation is deferred because required bindings are unresolved.
2. In the `ambiguousOverlap` branch, `matchingGrantIds` is still populated from `zoneMatchedGrants`, which is empty on that unresolved path even though ambiguity was established from competing unresolved grants.
3. Existing tests already cover discovery-time deferral behavior in `legal-choices.test.ts` and `legal-moves.test.ts`, and they cover generic ambiguous-overlap denial shape in `apply-move.test.ts` and `legality-surface-parity.test.ts`.
4. There is not yet a focused regression asserting that terminal unresolved-overlap denials preserve non-empty `matchingGrantIds` alongside `ambiguousGrantIds`.

## Architecture Check

1. The clean fix is to preserve one canonical denial payload shape regardless of whether overlap was detected from fully matched grants or unresolved-yet-competing grants.
2. The implementation should stay inside discovery analysis. This bug does not justify new denial aliases, consumer-side patching, or a broader redesign of viability/probing policy.
3. This remains fully game-agnostic: the kernel preserves generic authorization metadata derived from move and grant structure only.
4. No backwards-compatibility shims should be added. The denial contract should be corrected at the source, not patched by consumers.

## What to Change

### 1. Correct unresolved-overlap denial payload assembly

Ensure `ambiguousOverlap` returns a meaningful `matchingGrantIds` set even when ambiguity is computed from unresolved zone-filter grants. Prefer one canonical source for the competing grant ids so the denial payload does not depend on whether zone filters were fully resolved first.

### 2. Lock the denial payload contract with tests

Add focused test coverage that asserts unresolved exact-zone ambiguity preserves both `matchingGrantIds` and `ambiguousGrantIds`, and that downstream legality/runtime surfaces continue to see the same denial metadata.

## Files to Touch

- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify)
- `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)

## Out of Scope

- Changing free-operation overlap ranking rules.
- Any FITL event-data changes unless a later verification gap proves an integration test is necessary.
- Broad redesign of discovery-time ambiguity probing.

## Acceptance Criteria

### Tests That Must Pass

1. An unresolved exact-zone ambiguous-overlap denial retains non-empty `matchingGrantIds`.
2. `ambiguousGrantIds` and `matchingGrantIds` describe the same competing unresolved grant set for the unresolved-overlap path.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `FreeOperationBlockExplanation` stays consistent across discovery, legality, and runtime-error surfaces.
2. Free-operation denial payloads remain game-agnostic metadata derived only from move/grant structure.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — add a runtime regression asserting unresolved exact-zone ambiguity preserves both `matchingGrantIds` and `ambiguousGrantIds`.
2. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — assert unresolved ambiguity preserves full denial context, not just the denial cause.
3. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — keep the typed denial-contract fixture aligned with canonical ambiguous-overlap payload expectations if the helper coverage benefits from it.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/kernel/apply-move.test.js dist/test/unit/kernel/legality-surface-parity.test.js dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Outcome amended: 2026-03-10
- Completion date: 2026-03-10
- What actually changed: `free-operation-discovery-analysis.ts` now preserves `matchingGrantIds` from the same candidate grant set used to compute overlap ambiguity, so unresolved exact-zone ambiguous denials carry the same grant ids across runtime and legality surfaces. The overlap-related state inside discovery analysis was also consolidated into one structured overlap basis plus `applicableGrants`, removing parallel overlap arrays that could drift.
- Deviations from original plan: no integration test changes were needed because the missing coverage was fully addressed by targeted unit/runtime parity tests; `free-operation-viability.ts` and FITL event fixtures were left untouched. After archival, the discovery-analysis internals were further cleaned up without changing the external denial contract.
- Verification results: `pnpm -F @ludoforge/engine build`; `node --test dist/test/unit/kernel/apply-move.test.js dist/test/unit/kernel/legality-surface-parity.test.js dist/test/unit/kernel/runtime-error-contracts.test.js`; `pnpm -F @ludoforge/engine test`; `pnpm -F @ludoforge/engine lint`.
