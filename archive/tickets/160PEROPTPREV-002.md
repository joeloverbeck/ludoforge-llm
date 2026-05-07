# 160PEROPTPREV-002: Export `pickInnerDecision` from `policy-preview.ts`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `agents/policy-preview.ts`
**Deps**: `archive/specs/160-per-option-preview-inner-microturns.md`

## Problem

Spec 160's new `policy-preview-inner.ts` module (ticket 005) reuses Spec 159's `pickInnerDecision` to drive synthetic completions per option. Today `pickInnerDecision` is a module-private `const` at `packages/engine/src/agents/policy-preview.ts:520`, with one internal caller at line 1026. Without exporting it, ticket 005 would either reimplement the picker (DRY violation) or copy-paste it. Export is the smaller, cleaner change.

## Assumption Reassessment (2026-05-06)

1. `pickInnerDecision` is a module-private const at the cited location (verified via reassess-spec; spec §2 records this).
2. It has exactly one internal caller (`policy-preview.ts:1026`); no external module imports it today.
3. Its signature is `(state, def, microturn, policy, fallbackPolicy, input) => { decision, usedFallback }`.

## Architecture Check

1. **Minimal change**: a single keyword (`export`) preserves all existing call-site behavior. The function body is untouched.
2. **No abstraction churn**: `pickInnerDecision`'s shape is already correct for ticket 005's reuse — no wrapper or refactor needed.
3. **Engine-agnostic** (Foundation 1): the function operates on generic kernel types; export does not introduce game-specific surface.

## What to Change

### 1. Add `export` keyword

In `packages/engine/src/agents/policy-preview.ts:520`, change:

```ts
const pickInnerDecision = (
```

to:

```ts
export const pickInnerDecision = (
```

The signature, body, and all internal calls remain identical.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify — add `export` keyword at line 520)

## Out of Scope

- Refactoring `pickInnerDecision`'s signature — ticket 005 consumes the helper as-is.
- New tests — single-keyword addition; existing coverage exercises the function via its internal caller.

## Acceptance Criteria

### Tests That Must Pass

1. Existing `pnpm -F @ludoforge/engine test:unit`.
2. Existing engine suite: `pnpm -F @ludoforge/engine test`.
3. `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) `pickInnerDecision` is exported from `packages/engine/src/agents/policy-preview.ts`. A subsequent module (ticket 005) can `import { pickInnerDecision }` from this path.

## Test Plan

### New/Modified Tests

- None new — single-keyword addition.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test`

## Outcome

Completed on 2026-05-06.

Outcome amended: 2026-05-07 — updated archived Spec 160 dependency path after spec archival.

- Landed boundary: `pickInnerDecision` is exported from `packages/engine/src/agents/policy-preview.ts` with no signature or body changes.
- Touched-file scope: only `packages/engine/src/agents/policy-preview.ts` is expected to change for implementation.
- Post-ticket review: no must-fix cleanup or follow-up ticket was warranted; active tickets 003-010 retain the remaining Spec 160 work.
- Generated fallout: none; no schema, fixture, golden, or compiled JSON source changes.
- Deferred sibling/spec scope: tickets 003-010 retain the broader Spec 160 schema, ref-family, inner-driver, trace, warning, golden, and documentation work.
- Source file size ledger: `policy-preview.ts` was already over repository guidance at 1285 lines; this ticket adds no lines or logic, so extraction is not part of this boundary.
- Runtime surface breadth: policy/agent-only export surface; runtime behavior is unchanged.
- Final proof, serial order:
  1. `pnpm -F @ludoforge/engine build` — passed.
  2. `pnpm -F @ludoforge/engine test:unit` — passed, 5543 tests.
  3. `pnpm -F @ludoforge/engine test` — passed, including `schema:artifacts:check` and 64/64 default files.
  4. `pnpm turbo typecheck` — passed, 3/3 tasks.
  5. `node -e "import('./packages/engine/dist/src/agents/policy-preview.js').then((m)=>{ if (typeof m.pickInnerDecision !== 'function') { throw new Error('pickInnerDecision export missing'); } console.log('pickInnerDecision export ok'); })"` — passed after the final Turbo-triggered engine rebuild.
  6. `pnpm run check:ticket-deps` — passed for 9 active tickets and 2258 archived tickets.
- No-invalidation: terminal status/proof/dependency-check transcription only; no scope, acceptance, command, touched-file, follow-up, dependency, source, test, schema, or artifact change after the final import smoke and dependency check.
