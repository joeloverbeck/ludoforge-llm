# 105EXPPRECON-003: Update runtime preview pipeline for mode-based logic

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy-preview, policy-runtime
**Deps**: `tickets/105EXPPRECON-001.md`, `specs/105-explicit-preview-contracts.md`

## Problem

`tryApplyPreview()` in `policy-preview.ts` currently uses a boolean `tolerateRngDivergence` to decide whether RNG divergence returns `unknown` or `stochastic`. With the new `AgentPreviewMode` enum, this must become a mode-based switch that also supports the `disabled` fast-path (skip the entire preview pipeline).

## Assumption Reassessment (2026-04-01)

1. `tryApplyPreview()` at `policy-preview.ts:249` reads `input.tolerateRngDivergence` — confirmed.
2. `createPolicyPreviewRuntime()` at line 112 accepts `tolerateRngDivergence` via `input` — confirmed.
3. `policy-runtime.ts` passes `tolerateRngDivergence` from the compiled profile into the preview runtime input — confirmed (grep shows references).
4. Hidden-info filtering is handled per-ref in `resolveSurface()` at line 145 via `requiresHiddenSampling` — independent of mode. Confirmed.
5. Unresolved-decision detection is handled in `classifyPreviewOutcome()` at line 241 — independent of mode. Confirmed.

## Architecture Check

1. Mode governs only RNG divergence handling in `tryApplyPreview` — hidden-info and unresolved-decision handling remain at their correct architectural layers (`resolveSurface` and `classifyPreviewOutcome`).
2. The `disabled` mode is a performance optimization: skip the entire preview pipeline, return `unknown` immediately. All `preview.*` refs evaluate to `unknown` and `coalesce` fallbacks provide defaults.
3. No game-specific logic — the mode switch is generic.

## What to Change

### 1. Update `CreatePolicyPreviewRuntimeInput` in `policy-preview.ts`

Replace `tolerateRngDivergence?: boolean` with the compiled preview config:

```typescript
readonly previewMode: AgentPreviewMode;  // from CompiledAgentPreviewConfig.mode
```

### 2. Rewrite `tryApplyPreview()` with mode-based switch

```
switch (previewMode) {
  case 'disabled':
    → return { kind: 'unknown', reason: 'failed' } immediately (or a new 'disabled' reason)

  case 'exactWorld':
    → apply move, check RNG divergence
    → if rngDiverged → return { kind: 'unknown', reason: 'random' }
    → return { kind: 'ready', ... }

  case 'tolerateStochastic':
    → apply move, check RNG divergence
    → if rngDiverged → return { kind: 'stochastic', ... }
    → return { kind: 'ready', ... }
}
```

### 3. Add `disabled` fast-path in `getPreviewOutcome` or `createPolicyPreviewRuntime`

When mode is `disabled`, the entire preview pipeline should be skipped — no move application, no observation derivation. The `resolveSurface` function should return `unknown` immediately for all refs.

### 4. Update `policy-runtime.ts`

Change the call site that constructs the preview runtime input to pass `previewMode` from the compiled profile's `preview.mode` instead of `tolerateRngDivergence`.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-runtime.ts` (modify)

## Out of Scope

- Compiler changes (ticket 002)
- Trace type additions (ticket 004)
- YAML data migration (ticket 005)
- Changes to `resolveSurface` hidden-info logic (stays as-is)
- Changes to `classifyPreviewOutcome` unresolved-decision logic (stays as-is)

## Acceptance Criteria

### Tests That Must Pass

1. `disabled` mode: all `preview.*` refs return unknown, preview pipeline not invoked (no `applyMove` call)
2. `exactWorld` mode: RNG divergence returns `unknown/random`; deterministic preview returns `ready` with value
3. `tolerateStochastic` mode: RNG divergence returns `stochastic` with value; deterministic preview returns `ready`
4. Behavioral equivalence: `tolerateStochastic` produces same outcomes as old `tolerateRngDivergence: true`
5. Hidden-info filtering still works independently of mode (existing `requiresHiddenSampling` tests pass)
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Preview never consumes the authoritative game RNG stream (uses derived seed) — preserved
2. Same profile + same state + same seed = same preview outcomes (Foundation 8)
3. `disabled` mode must not call `applyMove` — it is an optimization, not just a filter

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview.test.ts` — replace `tolerateRngDivergence` tests with mode-based tests (disabled, exactWorld, tolerateStochastic)
2. `packages/engine/test/unit/agents/policy-runtime.test.ts` — update preview config passing tests

### Commands

1. `node --test packages/engine/dist/test/unit/agents/policy-preview.test.js`
2. `node --test packages/engine/dist/test/unit/agents/policy-runtime.test.js`
3. `pnpm turbo build && pnpm turbo test`
