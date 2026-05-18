# 181STRSTRPOL-017: Phase 1 prerequisite — selector-aware preview-inner validation

**Status**: DONE
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — generic validator dependency expansion
**Deps**: `archive/tickets/181STRSTRPOL-016.md`

## Problem

After the ARVN microturn preview ref moved behind a selector quality component, the runtime could request and trace the ref correctly, but the static `preview.inner` validator still warned that no microturn consideration referenced `preview.option.*`. The validator only scanned direct consideration bodies and did not expand selector dependencies.

## What Changed

1. Added a compiler test proving `preview.inner` opt-in warnings are suppressed when preview refs are reached through selector quality.
2. Updated `validateAgents` preview-inner warning detection to follow authored `selector.*` references into `agents.library.selectors`.

## Acceptance Criteria

1. `preview.inner.chooseOne` and `preview.inner.chooseNStep` warnings recognize selector-backed microturn preview-option signals.
2. The production FITL GameSpecDoc validates without spurious preview-inner warnings after `181STRSTRPOL-012`.

## Verification

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine test -- compile-preview-inner.test.ts fitl-production-data-compilation.test.ts`

