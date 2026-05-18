# 181STRSTRPOL-015: Phase 1 prerequisite — selector preview-ref planning

**Status**: DONE
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — generic policy inner-preview ref discovery
**Deps**: `archive/tickets/181STRSTRPOL-014.md`

## Problem

`181STRSTRPOL-012` migrates an ARVN microturn consideration from a direct preview ref to a selector-backed `current.quality` ref. Live validation showed the selector quality component still referenced `preview.option.delta.victory.currentMargin.self`, but the inner-preview planning path only scanned microturn considerations directly. Preview refs hidden behind selector dependencies were not requested, so the migrated consideration lost its preview contribution.

That violates Foundation #20 (Preview Signal Integrity): selector authoring must not silently erase preview readiness, fallback, or trace semantics.

## What Changed

1. Added a focused regression test proving that microturn inner-preview discovery includes preview refs used inside selector quality components.
2. Updated generic inner-preview ref collection to expand selector dependencies referenced by microturn considerations.

## Acceptance Criteria

1. A microturn consideration that references `selector.<id>.current.quality` requests preview refs used by that selector's quality components.
2. The fix remains game-agnostic and does not hardcode Fire in the Lake or ARVN identifiers.
3. `181STRSTRPOL-012` can keep its YAML-only profile migration boundary after this prerequisite lands.

## Verification

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine test -- policy-agent-inner-preview.test.ts`

