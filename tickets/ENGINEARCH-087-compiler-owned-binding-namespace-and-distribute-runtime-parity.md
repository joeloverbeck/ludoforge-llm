# ENGINEARCH-087: Compiler-Owned Binding Namespace Guardrails + `distributeTokens` Runtime Parity Coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL binding contract/validation and integration-level choice-flow coverage
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

Compiler-generated synthetic bindings currently use a reserved-looking namespace (for example `$__...`) without an explicit authored-input contract, which risks hidden collisions. In addition, `distributeTokens` currently has compile-level tests but lacks end-to-end runtime/discovery parity coverage for iterative decision flow.

## Assumption Reassessment (2026-02-27)

1. Synthetic lowering binds are generated in a `$__*` namespace but no explicit validator-level prohibition exists for authored bindings in that namespace.
2. New `distributeTokens` coverage is currently compile-only and does not explicitly verify `legalChoicesDiscover`/`applyMove` parity.
3. Mismatch: compiler-owned namespace and runtime-choice parity are implicit rather than contractually enforced; corrected scope adds explicit guardrails and end-to-end tests.

## Architecture Check

1. Explicit compiler-owned namespace contracts reduce accidental collisions and improve maintainability.
2. Runtime parity tests ensure compiler abstractions remain faithful to generic kernel choice/apply semantics.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Reserve compiler-owned binding namespace

Add validation that authored binder declarations cannot use compiler-owned prefixes (for example `$__`).

### 2. Add end-to-end `distributeTokens` decision-flow tests

Add tests that execute discovery -> decision binding -> apply flow and assert expected token movement and legality behavior.

### 3. Keep diagnostics explicit

When authored bindings violate reserved namespace policy, emit clear compiler diagnostics with remediation guidance.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/cnl/validate-actions.ts` (modify if needed)
- `packages/engine/src/cnl/cross-validate.ts` (modify if needed)
- `packages/engine/test/unit/compile-effects.test.ts` (modify/add)
- `packages/engine/test/unit/legal-moves.test.ts` (modify/add)
- `packages/engine/test/integration/effects-complex.test.ts` (modify/add)

## Out of Scope

- Changing runtime binding resolution semantics.
- Introducing game-specific reserved names.

## Acceptance Criteria

### Tests That Must Pass

1. Authored compiler-reserved binding identifiers are rejected with targeted diagnostics.
2. `distributeTokens` discovery/apply flow is covered end-to-end and deterministic.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compiler-owned metadata/binding namespaces are never user-authored.
2. GameDef/runtime remains game-agnostic and behaviorally unchanged aside from validated correctness.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — reserved namespace rejection for authored binders.
2. `packages/engine/test/unit/legal-moves.test.ts` — pending-choice and legality behavior for lowered `distributeTokens` sequence.
3. `packages/engine/test/integration/effects-complex.test.ts` — end-to-end apply behavior for token distribution across selected destinations.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- --coverage=false`
2. `pnpm -F @ludoforge/engine test`
