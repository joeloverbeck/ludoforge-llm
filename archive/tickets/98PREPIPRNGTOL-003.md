# 98PREPIPRNGTOL-003: Add `stochastic` preview outcome and RNG tolerance logic

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agent policy-preview module
**Deps**: 98PREPIPRNGTOL-001

## Problem

`tryApplyPreview` in `policy-preview.ts` returns `{ kind: 'unknown', reason: 'random' }` for ANY move whose effect chain changes PRNG state, even when the move is fully completed and deterministic for that specific candidate. This makes the entire preview surface inert for complex games like FITL. When the profile opts in via `tolerateRngDivergence: true`, the preview should return a `'stochastic'` outcome instead of `'unknown'`, allowing surface resolution to proceed.

## Assumption Reassessment (2026-03-31)

1. `policy-preview.ts:65-66` defines `PolicyPreviewUnavailabilityReason` and `PolicyPreviewTraceOutcome` — confirmed, need to add `'stochastic'` to trace outcome.
2. `PreviewOutcome` union (line 81-92) has two variants: `'ready'` and `'unknown'`. Need a third `'stochastic'` variant with the same shape as `'ready'`.
3. `tryApplyPreview` (line 201-228) is the single function with the RNG check.
4. `resolveSurface` (line 110-172) currently checks `preview.kind !== 'ready'` — must also accept `'stochastic'`.
5. `toPreviewTraceOutcome` (line 231-233) maps outcome kind to trace string — must handle `'stochastic'`.
6. `getVictorySurface` (line 263-273) uses `Extract<PreviewOutcome, { readonly kind: 'ready' }>` — must also accept `'stochastic'`.
7. `CreatePolicyPreviewRuntimeInput` (line 47-55) needs a `tolerateRngDivergence?: boolean` field.

## Architecture Check

1. **Minimal change surface**: Only `policy-preview.ts` behavioral changes. The `'stochastic'` variant uses the same object shape as `'ready'` (state, requiresHiddenSampling, metricCache, victorySurface), avoiding V8 hidden class deoptimization.
2. **Agnostic**: No game-specific logic. The tolerance flag is a generic boolean from the profile.
3. **No shims**: Default behavior (`tolerateRngDivergence: false` or absent) is identical to current — `{ kind: 'unknown', reason: 'random' }`.

## What to Change

### 1. Extend `PolicyPreviewTraceOutcome` type

```typescript
export type PolicyPreviewTraceOutcome = 'ready' | 'stochastic' | PolicyPreviewUnavailabilityReason;
```

### 2. Add `'stochastic'` variant to `PreviewOutcome` union

Add a third variant with identical shape to `'ready'` but `kind: 'stochastic'`:

```typescript
type PreviewOutcome =
  | { readonly kind: 'ready'; readonly state: GameState; readonly requiresHiddenSampling: boolean; readonly metricCache: Map<string, number>; victorySurface: PolicyVictorySurface | null; }
  | { readonly kind: 'stochastic'; readonly state: GameState; readonly requiresHiddenSampling: boolean; readonly metricCache: Map<string, number>; victorySurface: PolicyVictorySurface | null; }
  | { readonly kind: 'unknown'; readonly reason: PolicyPreviewUnavailabilityReason; };
```

### 3. Add `tolerateRngDivergence` to `CreatePolicyPreviewRuntimeInput`

```typescript
readonly tolerateRngDivergence?: boolean;
```

### 4. Change `tryApplyPreview` to use the flag

When RNG diverges:
- If `!tolerateRngDivergence` → return `{ kind: 'unknown', reason: 'random' }` (current behavior)
- If `tolerateRngDivergence` → return `{ kind: 'stochastic', state, requiresHiddenSampling, metricCache, victorySurface: null }`

### 5. Change `resolveSurface` to accept `'stochastic'`

```typescript
if (preview.kind !== 'ready' && preview.kind !== 'stochastic') {
  return preview;
}
```

### 6. Update `toPreviewTraceOutcome`

```typescript
function toPreviewTraceOutcome(outcome: PreviewOutcome): PolicyPreviewTraceOutcome {
  return outcome.kind === 'ready' ? 'ready' : outcome.kind === 'stochastic' ? 'stochastic' : outcome.reason;
}
```

### 7. Update `getVictorySurface` type constraint

Change `Extract<PreviewOutcome, { readonly kind: 'ready' }>` to accept both `'ready'` and `'stochastic'` outcomes.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify)

## Out of Scope

- Type/schema/contract definitions (done in 98PREPIPRNGTOL-001)
- Compiler/validator changes (done in 98PREPIPRNGTOL-002)
- Threading the flag from profile to preview runtime input (done in 98PREPIPRNGTOL-004)
- Any kernel effect execution or move enumeration changes
- Multi-state preview (comparing outcomes across multiple random completions)
- Per-surface RNG tolerance flags
- Removing the RNG check entirely

## Acceptance Criteria

### Tests That Must Pass

1. When `tolerateRngDivergence: false` (or absent) and RNG diverges → `{ kind: 'unknown', reason: 'random' }`
2. When `tolerateRngDivergence: true` and RNG diverges → outcome with `kind: 'stochastic'` and valid state
3. When `tolerateRngDivergence: true` and RNG does NOT diverge → outcome with `kind: 'ready'` (unchanged)
4. `resolveSurface` returns valid `{ kind: 'value', value }` for `'stochastic'` outcomes
5. `getOutcome` returns `'stochastic'` string for stochastic outcomes
6. `pnpm turbo typecheck` passes
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Default behavior (no flag or `false`) is bit-identical to current behavior
2. `'stochastic'` and `'ready'` outcomes have identical object shapes (only `kind` tag differs) — no V8 hidden class issues
3. Same state + same `tolerateRngDivergence` + same completed move = identical preview outcome (determinism)
4. `requiresHiddenSampling` / `allowWhenHiddenSampling` contract still honored for stochastic outcomes

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview.test.ts` — add test cases for:
   - RNG-divergent move with tolerance enabled → stochastic outcome
   - RNG-divergent move with tolerance disabled → unknown/random (existing behavior preserved)
   - RNG-non-divergent move with tolerance enabled → ready outcome
   - Surface resolution on stochastic outcome → value returned
   - Trace outcome mapping for stochastic

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern 'preview'`
2. `pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion date**: 2026-03-31
- **What changed**:
  - `packages/engine/src/agents/policy-preview.ts`: Added `'stochastic'` to `PolicyPreviewTraceOutcome` and `PreviewOutcome` union, added `tolerateRngDivergence` to input, updated `tryApplyPreview`, `resolveSurface`, `toPreviewTraceOutcome`, and `getVictorySurface` to handle stochastic outcomes.
  - `packages/engine/src/kernel/types-core.ts`: Added `'stochastic'` to `PolicyCandidateDecisionTrace.previewOutcome` literal union.
  - `packages/engine/src/kernel/schemas-core.ts`: Added `z.literal('stochastic')` to previewOutcome schema.
  - `packages/engine/schemas/Trace.schema.json`: Added `stochastic` const to previewOutcome enum.
  - `packages/engine/test/unit/agents/policy-preview.test.ts`: Added 4 new tests covering stochastic tolerance enabled/disabled, ready-when-no-divergence, and trusted indexed moves.
- **Deviations**: Ticket stated type/schema changes were out of scope (done in 001), but 001 only added `PreviewToleranceConfig` — the `'stochastic'` literal in the trace type and schema was missing. Fixed here to avoid build failure.
- **Verification**: Build pass, typecheck pass, 708/708 tests pass, schema artifacts in sync.
