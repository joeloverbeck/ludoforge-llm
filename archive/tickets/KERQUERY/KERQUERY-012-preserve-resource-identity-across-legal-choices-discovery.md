# KERQUERY-012: Preserve resource identity across legal-choices discovery

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — legal-choices discovery context resource propagation
**Deps**: archive/tickets/KERQUERY/KERQUERY-008-operation-scoped-eval-resources-and-query-cache-threading.md, packages/engine/src/kernel/legal-choices.ts, packages/engine/src/kernel/eval-context.ts, packages/engine/src/kernel/effect-context.ts

## Problem

`legal-choices` discovery currently reconstructs runtime resources from eval-context collector/cache each time instead of propagating one stable resource identity through discovery effect evaluations. Behavior is currently correct, but identity continuity is implicit and avoidably lossy for future diagnostics/ownership invariants.

## Assumption Reassessment (2026-03-04)

1. Eval/effect contexts now use operation resources as canonical ownership containers.
2. `legal-choices` discovery still wraps collector/cache into a new `EvalRuntimeResources` object per discovery context build instead of threading one canonical identity from preflight.
3. Unit tests live under `packages/engine/test/unit/kernel/` (not `packages/engine/test/unit/`), and there is currently no identity-focused contract test for this discovery resources path.
4. No active ticket currently addresses identity continuity in this path.

## Architecture Check

1. Propagating one resources identity through discovery is cleaner than repeatedly reconstructing wrappers.
2. This improves ownership clarity without introducing any game-specific data paths.
3. No compatibility aliases/shims: move directly to canonical propagation.

## What to Change

### 1. Thread stable resources identity through legal-choices discovery

1. Extend eval-context surface to carry explicit runtime resources identity.
2. Update `legal-choices` discovery context builder to reuse that identity rather than recreating wrappers.

### 2. Keep context construction deterministic

1. Ensure strict/probe discovery branches share the same resources object within one discovery operation.
2. Avoid creating new collector/cache wrappers in hot discovery paths.

### 3. Add identity-focused contract tests

1. Add tests locking resource identity continuity in legal-choices discovery.
2. Preserve current legality/probe behavior and outputs.

## Files to Touch

- `packages/engine/src/kernel/eval-context.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add)

## Out of Scope

- Query cache API encapsulation (`KERQUERY-009`)
- Trigger-dispatch API shape changes (`KERQUERY-010`)
- Bootstrap lifecycle threading (`KERQUERY-011`)
- Any game-specific rule logic

## Acceptance Criteria

### Tests That Must Pass

1. Legal-choices discovery reuses one resources identity through strict/probe discovery evaluations.
2. Existing legal-choices behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Resource identity continuity is explicit in discovery flows.
2. Runtime remains generic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — verify resources identity continuity and behavioral parity.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-03-05
- **What actually changed**:
  - `EvalContext` now carries required `resources` identity (threaded by `createEvalContext`) so downstream consumers must reuse the canonical runtime resources container.
  - `legal-choices` discovery now consumes `evalCtx.resources` directly when building strict/probe effect contexts.
  - `EffectContext` constructors now require and carry runtime `resources` explicitly across execution/discovery modes.
  - Added legal-choices source-contract guard coverage to lock this resource-threading behavior.
  - Updated this ticket's assumptions and test-path references to match the current repository layout.
- **Deviations from original plan**:
  - Scope expanded from legal-choices-only threading to canonicalization at context boundaries: eval/effect context constructors now require explicit resources.
  - Identity continuity validation is enforced via a source-contract test guard in the legal-choices suite, plus fixture-wide test updates to construct `EvalContext`/`EffectContext` with canonical resources.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (379/379).
  - `pnpm -F @ludoforge/engine lint` passed.
