# 94AGEEVADIA-002: Export preview outcome summary and cache accessor

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — agents/policy-preview.ts
**Deps**: 94AGEEVADIA-001

## Problem

The preview runtime caches `PreviewOutcome` per candidate in a private `Map<string, PreviewOutcome>`, but provides no way for external code (the eval layer) to read the cache for diagnostic summarization. A standalone `summarizePreviewOutcomes` function is also needed to aggregate outcome counts.

## Assumption Reassessment (2026-03-29)

1. `createPolicyPreviewRuntime` returns a `PolicyPreviewRuntime` object with `resolveSurface` and `resolveAllSurfaces` methods — **confirmed** (line ~99).
2. The internal `cache` is `Map<string, PreviewOutcome>` at line ~104 — **confirmed**.
3. `PreviewOutcome` is a local type with `kind: 'ready'` or `kind: 'unknown'` with `reason: 'random' | 'hidden' | 'unresolved' | 'failed'` — **confirmed** (line ~79).
4. No existing `summarizePreviewOutcomes` function or cache accessor — **confirmed**.
5. The `PolicyPreviewRuntime` interface is the public contract; the concrete return type is internal — **confirmed**.

## Architecture Check

1. `summarizePreviewOutcomes` is a standalone pure function, not a method on the runtime — this keeps the runtime interface clean and the summary function independently testable.
2. The cache accessor (`getOutcomeCache`) is added to the concrete return type (not the `PolicyPreviewRuntime` interface), used only by the agent layer internally. This preserves encapsulation.
3. No game-specific logic — outcome categories are generic agent pipeline concepts.

## What to Change

### 1. Export `PolicyPreviewOutcomeBreakdown` type

Define in `policy-preview.ts` (the runtime-side shape, distinct from the trace-serialized shape in `types-core.ts`):

```typescript
export interface PolicyPreviewOutcomeBreakdown {
  readonly ready: number;
  readonly unknownRandom: number;
  readonly unknownHidden: number;
  readonly unknownUnresolved: number;
  readonly unknownFailed: number;
}
```

### 2. Export `summarizePreviewOutcomes` function

A standalone pure function that reads a `ReadonlyMap<string, PreviewOutcome>` and returns counts by category:

```typescript
export function summarizePreviewOutcomes(
  cache: ReadonlyMap<string, PreviewOutcome>,
): PolicyPreviewOutcomeBreakdown { ... }
```

### 3. Add `getOutcomeCache()` to the concrete return type

Extend the return of `createPolicyPreviewRuntime` to include:

```typescript
getOutcomeCache(): ReadonlyMap<string, PreviewOutcome>;
```

This is NOT added to the `PolicyPreviewRuntime` interface — it is on the concrete return type used internally by the eval layer.

### 4. Export `PreviewOutcome` type (if not already exported)

The eval layer needs to reference `PreviewOutcome` to look up per-candidate outcomes. If currently unexported, add the export.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify)

## Out of Scope

- Modifying `PolicyPreviewRuntime` interface (the public contract stays unchanged)
- Changing preview resolution behavior
- Wiring into `policy-eval.ts` or `policy-diagnostics.ts` (that is 94AGEEVADIA-004)
- Trace-serialized types (that is 94AGEEVADIA-001)

## Acceptance Criteria

### Tests That Must Pass

1. **New**: `summarizePreviewOutcomes` correctly counts an empty cache → all zeros.
2. **New**: `summarizePreviewOutcomes` correctly counts a mixed cache with all 5 outcome categories.
3. **New**: `summarizePreviewOutcomes` correctly counts a cache with only `ready` outcomes.
4. **New**: `getOutcomeCache()` returns a `ReadonlyMap` matching the internal cache state.
5. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass unchanged.

### Invariants

1. `summarizePreviewOutcomes` is a pure function — no side effects, no mutation of the cache.
2. `PolicyPreviewRuntime` interface is unchanged — no public API break.
3. `getOutcomeCache()` returns the same Map instance (read-only view), not a copy.
4. Sum of all breakdown fields equals `cache.size` for any valid cache.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/policy-preview-summary.test.ts` — new file, tests `summarizePreviewOutcomes` with empty/mixed/uniform caches and validates `getOutcomeCache()` accessor.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="policy-preview-summary"`
2. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
