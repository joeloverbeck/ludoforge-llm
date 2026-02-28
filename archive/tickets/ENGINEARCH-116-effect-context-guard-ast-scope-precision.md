# ENGINEARCH-116: Effect-Context Guard AST Scope Precision

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard test precision hardening
**Deps**: None

## Problem

Current architecture guard checks use broad source-pattern bans for inline `mode` and `decisionAuthority` literals across entire boundary modules. This can cause false-positive failures for unrelated code while not explicitly tying the invariant check to `applyEffects` context arguments.

## Assumption Reassessment (2026-02-28)

1. Boundary guard currently validates constructor usage by comparing total file-level counts of constructor calls vs `applyEffects` calls, and also bans regex patterns (`mode: ...`, `decisionAuthority:`) across whole files.
2. Intended invariant is narrower and structural: each boundary `applyEffects` invocation must receive a context produced by the canonical constructor for that boundary.
3. Mismatch: current guard is not argument-scoped. It can over-fail on unrelated literals and under-specify per-call wiring guarantees.
4. Corrected scope: use AST-scoped assertions tied directly to each `applyEffects(..., ctx)` second argument (constructor call, identifier initialized from constructor, or accepted typed indirection where explicitly resolved).

## Architecture Check

1. AST-scoped call-argument assertions are cleaner and less brittle than global text bans and whole-file constructor counting.
2. This is game-agnostic test hardening and does not introduce any GameSpecDoc or visual-config coupling.
3. No compatibility aliases/shims; we tighten the canonical guard semantics in place.

## What to Change

### 1. Replace broad text bans with AST-scoped invariants

Assert that each boundary `applyEffects` call receives a context produced by the expected canonical constructor, based on analysis of the concrete second argument expression.

### 2. Preserve intentional architecture diagnostics

Keep explicit failure messages for boundary-module drift and constructor-mismatch drift.

### 3. Remove obsolete regex-only checks

Eliminate broad module-level pattern bans and file-wide constructor-count coupling once equivalent AST-scoped checks are in place.

## Files to Touch

- `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` (modify)
- `packages/engine/test/helpers/kernel-source-ast-guard.ts` (modify only if helper support is needed)

## Out of Scope

- Runtime kernel behavior changes.
- DecisionAuthority type model refactors.
- Ticket process/dependency tooling.

## Acceptance Criteria

### Tests That Must Pass

1. Guard fails when a boundary `applyEffects` call bypasses canonical constructor usage.
2. Guard no longer fails due to unrelated in-module literals or unrelated constructor usage outside `applyEffects` boundary contexts.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Boundary constructor policy remains strictly enforced.
2. Guard precision matches invariant scope (no over-broad file-level bans).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` — replace regex/file-count assertions with per-`applyEffects` AST argument assertions.
2. `packages/engine/test/helpers/kernel-source-ast-guard.ts` — add helper(s) to resolve whether an expression is backed by a specific constructor.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-mode-threading-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-28
- **What actually changed**:
  - Updated `effect-mode-threading-guard` to enforce constructor policy per `applyEffects` call argument using AST resolution, instead of file-wide constructor counts and regex literal bans.
  - Added AST helper support to resolve constructor call identifiers through identifier initializers.
  - Added a focused regression test that demonstrates unrelated in-module literals no longer trigger false failures.
- **Deviations from original plan**:
  - Kept changes limited to test/helper files exactly as planned; no runtime/kernel code changes were needed.
  - Added one explicit fixture-style regression assertion in the guard test to lock in scoped behavior.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (`# tests 315`, `# pass 315`, `# fail 0`)
  - `pnpm -F @ludoforge/engine lint` ✅
