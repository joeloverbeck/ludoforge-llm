# 89SCOMUTEXECON-001: Fix EffectCursor conditional spread polymorphism

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/effect-context.ts
**Deps**: Spec 89 (Phase 0). No ticket dependencies.

## Problem

`toEffectCursor`, `toTraceProvenanceContext`, and `toTraceEmissionContext` use conditional spreads (`...(x === undefined ? {} : { x })`) to optionally include `effectPath` and `traceContext` fields. This creates two possible V8 hidden classes per call site — a prerequisite blocker for the monomorphism invariant that the rest of Spec 89 depends on.

## Assumption Reassessment (2026-03-28)

1. `toEffectCursor` (effect-context.ts:240-246) uses `...(ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath })` — **confirmed** from exploration.
2. `toTraceProvenanceContext` (effect-context.ts:251-258) uses conditional spread for both `traceContext` and `effectPath` — **confirmed**.
3. `toTraceEmissionContext` currently inherits the same polymorphism because it spreads the result of `toTraceProvenanceContext` — **confirmed**.
4. The existing unit contract in `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` currently asserts the opposite shape invariant: it expects `traceContext` / `effectPath` to be absent when undefined — **confirmed discrepancy**.
5. Similar optional-field conditional spreads still exist elsewhere in compiled-effect helpers (`effect-compiler-codegen.ts`, `effect-compiler-runtime.ts`), but they are separate call sites and are not touched by this Phase 0 ticket — **confirmed and intentionally out of scope**.
6. `exactOptionalPropertyTypes` means the current optional-property type aliases cannot directly model "always present, possibly undefined" object literals without assertions — **confirmed discrepancy**.

## Architecture Reassessment

1. This Phase 0 change is beneficial relative to the current architecture. These three helpers are narrow bridge constructors, and giving them a single stable property layout is cleaner than emitting shape-polymorphic objects from the same call sites.
2. No game-specific logic involved — purely engine-internal context construction.
3. No backwards-compatibility shims. The property is always present; consumers that check `if (ctx.effectPath)` still behave correctly because `undefined` is falsy.
4. This ticket does **not** justify the broader `MutableReadScope` rollout by itself. That larger architecture may still be worthwhile, but it introduces lifecycle complexity across many handlers and should remain in later tickets where the hot-path measurements and mutation-safety audit are the primary subject.
5. For these internal bridge objects, explicit `| undefined` types are cleaner than optional markers. They align the static type contract with the runtime monomorphism contract and avoid assertion-based construction.

## What to Change

### 1. Fix `toEffectCursor` — always set `effectPath`

Replace the conditional spread with a direct property assignment:

```typescript
// Before
...(ctx.effectPath === undefined ? {} : { effectPath: ctx.effectPath })

// After
effectPath: ctx.effectPath,   // undefined is fine — property always exists
```

### 2. Fix `toTraceProvenanceContext` — always set `traceContext` and `effectPath`

Same pattern: replace conditional spreads with direct assignments.

### 3. Fix `toTraceEmissionContext` — always set `traceContext` and `effectPath`

Same pattern.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify) — fix 3 functions
- `packages/engine/src/kernel/trace-provenance.ts` (modify if needed) — keep provenance helper signatures aligned with the new bridge types
- `packages/engine/src/kernel/var-change-trace.ts` (modify if needed) — keep trace-emission helper signatures aligned with the new bridge types
- `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` (modify) — update the shape contract to require always-present own properties

## Out of Scope

- MutableReadScope type or factory functions (ticket 002).
- Changes to effect-dispatch.ts or any effects-*.ts handler files.
- Changes to `mergeToEvalContext` or `mergeToReadContext`.
- Aligning compiled-effect helper factories that still use similar conditional spreads.
- Performance benchmarking (Phase 0 has near-zero runtime impact per spec).

## Acceptance Criteria

### Tests That Must Pass

1. `effect-context-construction-contract.test.ts` — update and pass the contract test so it asserts own-property presence with `undefined` values instead of key omission.
2. Full engine test suite: `pnpm -F @ludoforge/engine test`
3. Typecheck: `pnpm -F @ludoforge/engine run typecheck` (or `pnpm turbo typecheck`)
4. Lint: `pnpm turbo lint`

### Invariants

1. `toEffectCursor` always returns an object with `effectPath` as an own property (whether defined or `undefined`).
2. `toTraceProvenanceContext` always returns an object with `traceContext` and `effectPath` as own properties.
3. `toTraceEmissionContext` always returns an object with `traceContext` and `effectPath` as own properties.
4. No conditional spreads (`...(x ? {} : { y })`) remain in these three functions.
5. Determinism: same seed + same actions = identical Zobrist hash (existing determinism tests).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` — replace the existing "do not invent optional fields" assertions with assertions that `effectPath` / `traceContext` are always own properties, even when their values are `undefined`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js` (targeted)
3. `pnpm -F @ludoforge/engine test` (full engine suite)
4. `pnpm turbo typecheck` (type safety)
5. `pnpm turbo lint` (lint)

## Outcome

- Completion date: 2026-03-28
- Actual changes:
  - Replaced the conditional-spread construction in `toEffectCursor`, `toTraceProvenanceContext`, and `toTraceEmissionContext` with always-present fields.
  - Updated the internal bridge typing to use explicit `| undefined` where needed so the runtime monomorphic shape is represented honestly under `exactOptionalPropertyTypes`.
  - Updated the effect-context construction contract test to assert own-property presence for `effectPath` and `traceContext` even when undefined.
- Deviations from original plan:
  - The ticket originally assumed the existing optional-property types could stay unchanged. In practice, that would have required assertions, so the implementation also updated the affected internal bridge/provenance typing.
  - A compiled-effect cursor/provenance bridge in `effect-compiler-codegen.ts` was updated as a direct consequence of the stricter internal typing alignment.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
