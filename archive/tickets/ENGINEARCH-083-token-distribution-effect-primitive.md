# ENGINEARCH-083: Generic Token Distribution Primitive for Multi-Zone Placement Events

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — compiler/CNL lowering only (no kernel AST/runtime changes in this ticket)
**Deps**: specs/51-cross-game-primitive-elevation.md, specs/29-fitl-event-card-encoding.md

## Problem

Complex card/event placements that split selected tokens across multiple selected zones currently require verbose combinations of `chooseN`/`forEach`/conditional loops. This is hard to audit, easy to mis-specify, and increases bug surface.

## Assumption Reassessment (2026-02-27)

1. Existing effect/runtime already composes distribution behavior (`chooseN` + `forEach` + `chooseOne` + `moveToken`) without kernel feature gaps.
2. Current FITL event content contains repeated manual distribution patterns with high authoring overhead.
3. Discrepancy: the ticket referenced non-existent specs (`specs/25a-*`, `specs/50-*`) and an outdated test command (`npm run test`).
4. Corrected scope: introduce a declarative compiler-level effect form that lowers into existing primitives; do not add new kernel AST/runtime effect semantics in this ticket.

## Architecture Check

1. Per Spec 51 layering guidance, this belongs at compiler level unless runtime semantics cannot be composed. Here they can be composed cleanly.
2. A compiler-level declarative form improves readability and consistency while preserving existing legality/discovery/runtime behavior.
3. This approach is more robust than adding a new runtime primitive now because it avoids duplicating choice semantics and reduces long-term maintenance surface.

## What to Change

### 1. Add `distributeTokens` CNL effect form (compiler lowering)

Define a declarative effect that accepts:
- token source query
- destination query
- cardinality (`n` or `min/max`)

Lower into existing AST effects (`chooseN`, `forEach`, `chooseOne`, `moveToken`) wrapped in existing control flow as needed.

### 2. Validate

Add compile diagnostics for malformed cardinality/shape, matching existing `chooseN` contract behavior.

### 3. Preserve runtime semantics

No new kernel effect dispatch or runtime handlers in this ticket. Discovery/apply parity is inherited from the lowered primitive sequence.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/cnl/effect-kind-registry.ts` (modify)
- `packages/engine/src/cnl/binder-surface-contract.ts` (modify)
- `packages/engine/test/unit/` (modify/add)

## Out of Scope

- Introducing a new runtime `EffectAST` variant and kernel dispatcher branch.
- Per-destination min/max capacity constraints in one primitive.
- Rewriting all existing cards in one ticket.
- UI-specific rendering behavior.

## Acceptance Criteria

### Tests That Must Pass

1. `distributeTokens` lowers deterministically into existing primitive sequence for exact and ranged token counts.
2. Invalid cardinality forms emit compiler diagnostics.
3. Relevant engine unit suite passes via Node test runner/pnpm scripts (no Jest flags).

### Invariants

1. Feature remains fully game-agnostic.
2. No runtime behavior regression for legality/discovery/apply semantics because lowering reuses existing runtime effects.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — lowering/validation for `distributeTokens`.
2. `packages/engine/test/unit/binder-surface-registry.test.ts` — supported effect-kind surface coverage remains complete.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- --coverage=false`

## Outcome

- **Completion Date**: 2026-02-27
- **What Actually Changed**:
  - Added compiler-level `distributeTokens` effect support in CNL lowering.
  - `distributeTokens` lowers deterministically into existing runtime primitives: `chooseN` -> `forEach` -> `chooseOne` -> `moveToken` (wrapped via existing `let` scope).
  - Added effect-kind/binder-surface registry entries for `distributeTokens`.
  - Added compile-time tests for deterministic lowering and cardinality diagnostics.
- **Deviations from Original Plan**:
  - Did **not** add new kernel `EffectAST` variants, runtime handlers, or dispatch branches.
  - Did **not** implement per-destination capacity constraints in this ticket.
  - This was intentionally narrowed to compiler-level architecture to avoid duplicating existing runtime choice semantics.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit -- --coverage=false` passed (`181/181`).
