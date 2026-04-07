# 118PROBOUCAT-002: Migrate `legal-choices.ts` 4 catch blocks to `probeWith`

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel legal-choices module
**Deps**: `archive/tickets/118PROBOUCAT-001.md`

## Problem

`legal-choices.ts` has 4 catch blocks (lines ~278, ~304, ~330, ~348) that follow the identical try-catch-classify pattern. Two use `classifyDiscoveryProbeError` and two use `classifyChoiceProbeError` — both are single-param classifiers matching the `probeWith` signature exactly. These are the simplest migration targets.

## Assumption Reassessment (2026-04-07)

1. `legal-choices.ts` exists at `packages/engine/src/kernel/legal-choices.ts` — confirmed.
2. 4 catch blocks verified at lines ~278, ~304, ~330, ~348 — all follow the `try { return legal(innerFn()) } catch { classify-or-rethrow }` pattern.
3. `classifyDiscoveryProbeError` defined locally at line ~315, signature `(error: unknown): ProbeResult<never> | null` — single-param, direct `probeWith` compatibility.
4. `classifyChoiceProbeError` defined locally at line ~318, signature `(error: unknown): ProbeResult<never> | null` — single-param, direct `probeWith` compatibility.
5. Both classifiers are local to `legal-choices.ts` — no import changes needed for them.

## Architecture Check

1. Mechanical replacement — each catch block becomes a `probeWith(fn, classifier)` one-liner. Behavior is identical.
2. No game-specific logic introduced. The classifiers and their error codes are already game-agnostic.
3. No backwards-compatibility shims — the catch blocks are fully replaced, not wrapped.

## What to Change

### 1. Import `probeWith` from `probe-result.ts`

Add `probeWith` to the existing import from `./probe-result.js`.

### 2. Replace 4 catch blocks with `probeWith`

Each of the 4 sites follows the same pattern. Replace each with:

```typescript
// Sites at ~278, ~304 (classifyDiscoveryProbeError):
return probeWith(
  () => /* existing inner function call */,
  classifyDiscoveryProbeError,
);

// Sites at ~330, ~348 (classifyChoiceProbeError):
return probeWith(
  () => /* existing inner function call */,
  classifyChoiceProbeError,
);
```

Preserve the exact inner function call from each site — only the try-catch wrapper changes.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify)

## Out of Scope

- Changing `classifyDiscoveryProbeError` or `classifyChoiceProbeError` signatures
- Migrating catch blocks in other files (that is 118PROBOUCAT-003)
- Group B, C, or D migration work

## Acceptance Criteria

### Tests That Must Pass

1. All existing `legal-choices` tests pass unchanged — behavior is preserved
2. `classifyDiscoveryProbeError` is still invoked for discovery probe errors (now through `probeWith`)
3. `classifyChoiceProbeError` is still invoked for choice probe errors (now through `probeWith`)
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No behavioral change — same errors produce the same `ProbeResult` outcomes
2. Unclassified errors still propagate (re-thrown by `probeWith`)
3. No catch blocks remain for the 4 migrated sites

## Test Plan

### New/Modified Tests

1. No new tests needed — existing tests cover the behavior. Verify they pass unchanged.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test --force`

## Outcome

- **Completion date**: 2026-04-07
- **What changed**:
  - `packages/engine/src/kernel/legal-choices.ts` — replaced 4 try-catch-classify blocks with `probeWith` one-liners; added `probeWith` to import
  - `packages/engine/test/unit/kernel/probe-result-export-surface-guard.test.ts` — added `probeWith` to allowed export surface list (guard failed because 001 added the export)
- **Deviations**: Export surface guard update not listed in ticket but required by the architecture guard test suite.
- **Verification**: Build clean, 5618/5618 engine tests pass (0 fail)
