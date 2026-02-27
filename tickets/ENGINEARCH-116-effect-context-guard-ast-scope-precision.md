# ENGINEARCH-116: Effect-Context Guard AST Scope Precision

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard test precision hardening
**Deps**: None

## Problem

Current architecture guard checks use broad source-pattern bans for inline `mode` and `decisionAuthority` literals across entire boundary modules. This can cause false-positive failures for unrelated code while not explicitly tying the invariant check to `applyEffects` context arguments.

## Assumption Reassessment (2026-02-27)

1. Boundary guard currently validates constructor usage and also bans regex patterns (`mode: ...`, `decisionAuthority:`) across whole files.
2. The intended invariant is specific: `applyEffects` context construction at runtime boundaries must go through canonical constructors.
3. Mismatch: guard scope is broader than invariant intent. Corrected scope: replace broad regex bans with AST-scoped assertions tied to `applyEffects` context arguments/call structure.

## Architecture Check

1. AST-scoped guard assertions are cleaner and less brittle than global text bans.
2. This is game-agnostic test hardening and does not introduce any GameSpecDoc or visual-config coupling.
3. No compatibility aliases/shims; we tighten the canonical guard semantics in place.

## What to Change

### 1. Replace broad text bans with AST-scoped invariants

Assert that each boundary `applyEffects` call receives a context produced by the expected canonical constructor.

### 2. Preserve intentional architecture diagnostics

Keep explicit failure messages for boundary-module drift and constructor-mismatch drift.

### 3. Remove obsolete regex-only checks

Eliminate broad module-level pattern bans once equivalent AST-scoped checks are in place.

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
2. Guard no longer fails due to unrelated in-module literals outside `applyEffects` boundary contexts.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Boundary constructor policy remains strictly enforced.
2. Guard precision matches invariant scope (no over-broad file-level bans).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts` — migrates broad regex bans to AST-scoped boundary assertions.
2. `packages/engine/test/helpers/kernel-source-ast-guard.ts` — helper extensions for scoped analysis if required.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-mode-threading-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
