# TOKFILAST-027: Centralize Empty-Args Arity Enforcement in Token-Filter Traversal with Path-Fidelity

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — token-filter traversal contracts + runtime/canonicalization callsite simplification
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-014-token-filter-traversal-error-boundary-decoupling.md, archive/tickets/TOKFILAST/TOKFILAST-019-token-filter-predicate-shape-and-fold-path-contract-hardening.md

## Problem

Token-filter empty-args arity checks are still duplicated in runtime/canonicalization callsites, and those callsites currently raise `empty_args` errors without nested traversal paths. This weakens deterministic error-context contracts and leaves invariant ownership split across modules.

## Assumption Reassessment (2026-03-06)

1. `foldTokenFilterExpr` already tracks nested traversal path context and is the canonical recursion boundary (`packages/engine/src/kernel/token-filter-expr-utils.ts`).
2. `matchesTokenFilterExpr` and `canonicalizeTokenFilterExpr` still perform local `entry.args.length === 0` checks and call `tokenFilterBooleanArityError(expr, ...)` with root context (`packages/engine/src/kernel/token-filter.ts`, `packages/engine/src/kernel/hidden-info-grants.ts`).
3. Mismatch: nested malformed payloads (for example `not(and([]))`) currently surface `empty_args` with root path instead of nested path context in those callsites.
4. Existing active tickets (`TOKFILAST-020`, `TOKFILAST-021`) focus on boundary mapping and effect-surface assertions, not traversal-owned empty-args path fidelity for runtime + canonicalization callers.

## Architecture Check

1. Arity invariant ownership belongs in traversal utilities, not distributed callsites; this is cleaner and reduces drift.
2. Path-aware failures from a single traversal boundary improve determinism and debuggability without introducing game-specific behavior.
3. This preserves game-agnostic `GameDef`/runtime semantics and introduces no backwards-compatibility aliases or shims.

## What to Change

### 1. Move empty-args arity failure to traversal utility layer

Update token-filter traversal helpers so `and/or` empty `args` fail at traversal point with deterministic `reason/op/path` context for nested nodes.

### 2. Remove duplicated callsite arity checks

Simplify token-filter runtime and hidden-info canonicalization callsites to rely on traversal-enforced arity checks.

### 3. Keep boundary contracts stable

Ensure existing boundary translation (`TOKEN_FILTER_TRAVERSAL_ERROR` -> runtime errors/diagnostics) remains deterministic while preserving nested path metadata.

## Files to Touch

- `packages/engine/src/kernel/token-filter-expr-utils.ts` (modify)
- `packages/engine/src/kernel/token-filter.ts` (modify)
- `packages/engine/src/kernel/hidden-info-grants.ts` (modify)
- `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` (modify)
- `packages/engine/test/unit/token-filter.test.ts` (modify)
- `packages/engine/test/unit/hidden-info-grants.test.ts` (modify)

## Out of Scope

- Traversal boundary mapper centralization between runtime/effects (`archive/tickets/TOKFILAST/TOKFILAST-020-token-filter-traversal-boundary-mapper-centralization.md`).
- Effect-surface reveal/conceal context coverage (`archive/tickets/TOKFILAST/TOKFILAST-021-effects-reveal-token-filter-error-context-contract-coverage.md`).
- Predicate operator allow-list policy changes (`archive/tickets/TOKFILAST/TOKFILAST-018-token-filter-predicate-operator-fail-closed-hardening.md`).

## Acceptance Criteria

### Tests That Must Pass

1. Nested empty-args token-filter payloads produce deterministic `empty_args` context with nested traversal path in runtime callers.
2. Hidden-info canonicalization surfaces the same nested `empty_args` path context contract.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Token-filter boolean-arity invariant is enforced once at traversal boundary.
2. Runtime/canonicalization error-context semantics remain deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/token-filter.test.ts` — assert nested `empty_args` path fidelity for runtime `TYPE_MISMATCH` context.
2. `packages/engine/test/unit/hidden-info-grants.test.ts` — assert nested `empty_args` path fidelity for canonicalization traversal failures.
3. `packages/engine/test/unit/kernel/token-filter-expr-utils.test.ts` — assert traversal-level nested `empty_args` path emission.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
