# ENGINEARCH-083: Generic Token Distribution Primitive for Multi-Zone Placement Events

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — AST/effect runtime/compiler for a new generic primitive
**Deps**: specs/25a-kernel-operation-primitives.md, specs/50-event-interactive-choice-protocol.md

## Problem

Complex card/event placements that split selected tokens across multiple selected zones currently require verbose combinations of `chooseN`/`forEach`/conditional loops. This is hard to audit, easy to mis-specify, and increases bug surface.

## Assumption Reassessment (2026-02-27)

1. Existing effect set can represent distribution behavior but only via multi-step imperative patterns.
2. Current event data includes repeated manual distribution patterns with high cognitive overhead.
3. Mismatch: architecture lacks a single declarative primitive for token-to-zone allocation; corrected scope is a generic distribution effect.

## Architecture Check

1. A declarative distribution primitive is cleaner than ad hoc procedural choose/loop chains and is easier to test.
2. Boundaries are preserved: GameSpecDoc encodes per-game distribution parameters; runtime primitive remains generic.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Add `distributeTokens` effect primitive

Define a generic effect that takes token set, destination set, cardinality/range constraints, and per-destination constraints.

### 2. Lower + validate

Add CNL lowering and validation diagnostics to reject ambiguous/unsatisfiable distributions.

### 3. Runtime execution + decision integration

Integrate with choice protocol and legality discovery so interactive and deterministic resolution are consistent.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/effect-dispatch.ts` (modify)
- `packages/engine/src/kernel/effects-*.ts` (add/modify)
- `packages/engine/test/unit/` (modify/add)
- `packages/engine/test/integration/` (modify/add)

## Out of Scope

- Rewriting all existing cards in one ticket.
- UI-specific rendering behavior.

## Acceptance Criteria

### Tests That Must Pass

1. Primitive can express exact and bounded distributions across selected zones.
2. Legality/discovery and apply phases agree on distribution constraints.
3. Existing suite: `npm run test`

### Invariants

1. Primitive remains fully game-agnostic.
2. Distribution semantics are deterministic and reproducible with seeded RNG where applicable.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — lowering/validation.
2. `packages/engine/test/unit/kernel/effects-runtime.test.ts` — runtime distribution behavior.
3. `packages/engine/test/integration/fitl-events-*.test.ts` — representative event migration coverage.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test "packages/engine/dist/test/unit/**/*.test.js"`
2. `npm run test`
