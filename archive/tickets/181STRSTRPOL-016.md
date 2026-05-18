# 181STRSTRPOL-016: Phase 1 prerequisite — selector component preview fallback trace

**Status**: DONE
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — generic selector evaluation trace plumbing
**Deps**: `archive/tickets/181STRSTRPOL-015.md`

## Problem

After `181STRSTRPOL-015` made selector quality preview refs visible to inner-preview planning, `181STRSTRPOL-012` still exposed a Foundation #20 trace gap: a selector quality component could apply `previewFallback.onUnavailable`, but the fallback event was not surfaced through the policy trace. The numeric contribution was correct, but the fallback path was silent.

## What Changed

1. Added a focused microturn-option evaluator regression test for selector component preview fallback visibility.
2. Added a generic selector-eval callback that records current-item selector component preview fallback through the existing preview fallback trace field.

## Acceptance Criteria

1. A selector component fallback applied to the current microturn option is visible in deterministic policy trace metadata.
2. The trace uses a generic selector/component term id and does not hardcode any game-specific identifier.
3. `181STRSTRPOL-012` can keep its YAML migration while satisfying Foundation #20.

## Verification

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine test -- microturn-option-evaluator.test.ts`

