# 79COMEFFPATRED-001: Add `tracker` field to `CompiledEffectContext`

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel type definition
**Deps**: Spec 78 (completed), Spec 79

## Problem

The compiled effect path cannot participate in Spec 78's DraftTracker
optimization because `CompiledEffectContext` has no `tracker` field. All
downstream tickets depend on this type being extended first.

## Assumption Reassessment (2026-03-24)

1. `CompiledEffectContext` is defined in `effect-compiler-types.ts` — **confirmed** (lines ~30-70).
2. `DraftTracker` is exported from `state-draft.ts` — **confirmed**.
3. No existing `tracker` field on `CompiledEffectContext` — **confirmed**; the compiled path currently threads tracker only through `effectBudget` in codegen, not through the context type.
4. Adding an optional field is purely additive and breaks no consumers — **confirmed**; all existing call sites either ignore unknown fields or spread the context.

## Architecture Check

1. Adding an optional field to an existing interface is the minimal change. No alternative is simpler.
2. `DraftTracker` is an engine-internal type (kernel-only), so this preserves agnosticism.
3. No backwards-compatibility shim — the field is optional, so old callers work unchanged.

## What to Change

### 1. Add optional `tracker` field to `CompiledEffectContext`

In `effect-compiler-types.ts`, add:

```typescript
tracker?: DraftTracker;
```

alongside the existing fields. Import `DraftTracker` from `./state-draft.js`.

### 2. Update type-level test if it exists

If `effect-compiler-types.test.ts` has snapshot or structural assertions on
`CompiledEffectContext`, update them to include the new optional field.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-types.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-types.test.ts` (modify, if assertions exist)

## Out of Scope

- Any runtime behavior changes — this ticket is types only.
- `effect-compiler.ts`, `effect-compiler-codegen.ts`, `effect-compiler-runtime.ts` — no changes.
- `state-draft.ts` — read only (import type).
- `phase-lifecycle.ts` — no changes.
- GameDef schema, GameSpecDoc YAML.
- Simulator, runner, agents.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test` — full engine test suite passes.
2. `pnpm turbo typecheck` — no type errors introduced.
3. `pnpm turbo lint` — no lint violations.
4. If `effect-compiler-types.test.ts` has structural assertions, they are updated and pass.

### Invariants

1. `CompiledEffectContext` remains a plain interface (no class, no runtime overhead).
2. The `tracker` field is **optional** (`tracker?: DraftTracker`) — existing call sites must not break.
3. No runtime behavior changes — compiled effects execute identically before and after this ticket.
4. `DraftTracker` import is type-only if possible (`import type`), unless the runtime import is needed downstream.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-types.test.ts` — verify `tracker` field is accepted by the type (if structural tests exist).

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-24
- **What changed**: Added `import type { DraftTracker } from './state-draft.js'` and `readonly tracker?: DraftTracker` to `CompiledEffectContext` in `packages/engine/src/kernel/effect-compiler-types.ts`.
- **Deviations**: None. No test file updates were needed — existing assertions are type-level null checks unaffected by the new optional field.
- **Verification**: 4670/4670 engine tests pass, typecheck clean (3/3), lint clean (2/2).
