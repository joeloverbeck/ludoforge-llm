# 81WHOSEQEFFCOM-011: Consolidate compiled delegate-backed leaf wrappers

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — effect-compiler-codegen.ts, new kernel-internal helper module, effect-compiler tests
**Deps**: archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-004-turn-flow-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-005-token-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-007-information-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-008-complex-control-flow-effects.md, tickets/81WHOSEQEFFCOM-009-lifecycle-choice-effects.md

## Problem

The compiled effect pipeline now has many leaf handlers implemented through the same delegate-backed pattern: consume compiled-effect budget, bridge compiled context into `EffectEnv`/`EffectCursor`, call an existing runtime handler, and normalize the `EffectResult` back into the compiled fragment contract. That architecture is sound, but the callsites are repetitive and increasingly noisy inside `effect-compiler-codegen.ts`.

If left as repeated bespoke wrappers, tickets 008 and 009 will add even more near-identical adapter code. That would violate Foundations 9 and 10 by keeping dead-simple duplication in the core compiler path instead of consolidating it behind a single kernel-internal abstraction.

## Assumption Reassessment (2026-03-25)

1. `packages/engine/src/kernel/effect-compiler-codegen.ts` already contains a shared low-level bridge function, `executeCompiledDelegate`, but each delegate-backed compiled effect still repeats its own one-off wrapper around builder + handler wiring.
2. Delegate-backed compiled leaves already exist across turn-flow, marker, token, and information effects, and tickets 008 and 009 are expected to add more.
3. The existing delegate-backed approach is architecturally correct because it preserves one source of truth for runtime semantics while removing interpreter fallback from compiled lifecycle execution.
4. The remaining cleanup gap is not semantic; it is structural duplication inside compiler codegen ownership areas.
5. No active ticket currently owns this consolidation as an explicit deliverable. Tickets 008, 009, and 010 only reference it as a recommendation or precondition.
6. Sequencing clarification: the deps on tickets 008 and 009 are intentional. This ticket is the post-implementation consolidation pass that absorbs any additional delegate-backed wrappers introduced while compiling those effects.

## Architecture Check

1. The clean architecture is a kernel-internal delegate-wrapper helper or factory that owns the repeated bridge mechanics for compiled leaf effects. Individual compiled leaf functions should only declare effect-specific payload/build/handler wiring.
2. This stays fully game-agnostic: it is compiler/runtime infrastructure, not game logic, so it aligns with Foundation 1.
3. This is not a compatibility shim. It replaces repeated code with a single current-truth abstraction and updates all callsites in one pass, aligning with Foundations 9 and 10.
4. The abstraction boundary must remain narrow: do not hide effect-specific semantics, only the repeated compiled-to-runtime delegate plumbing.

## What to Change

### 1. Introduce a kernel-internal helper for delegate-backed compiled leaves

Create a small helper module or helper API that encapsulates:
- budget consumption through the compiled path
- compiled-context to runtime `EffectEnv` / `EffectCursor` bridging
- invocation of the runtime handler
- normalization of the runtime `EffectResult` back into the compiled fragment contract

The helper should support both:
- pure leaf delegates with no nested body compilation
- outer compiled wrappers that still delegate core runtime behavior to existing handlers

### 2. Convert existing delegate-backed compiled leaves to the helper

Refactor existing delegate-backed compiled leaves in `effect-compiler-codegen.ts` to use the shared abstraction instead of one-off wrappers.

Expected coverage includes current delegate-backed leaves such as:
- turn-flow leaves
- marker leaves
- token leaves
- information leaves

If tickets 008 and 009 have already landed when this work is done, include their delegate-backed leaves as part of the same consolidation.

### 3. Keep control-flow compilation separate

Do not merge this with the shared control-flow helper work tracked in ticket 008. The delegate-wrapper helper is for compiled leaf-to-runtime bridging, not loop/continuation semantics.

### 4. Tighten tests around the shared delegate abstraction

Add or update tests so the abstraction is proven safe:
- delegate-backed compiled leaves still match interpreted behavior
- dispatch coverage still includes all delegate-backed descriptors
- no effect-specific trace/binding/state semantics regress during the refactor

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/src/kernel/<new helper module>.ts` (new)
- `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify if needed for coverage / dispatch assertions)

## Out of Scope

- Rewriting runtime effect handler internals
- Replacing direct compilation for non-delegate control-flow effects
- Removing the lifecycle fallback path (ticket 010)
- Choice/action CPS model changes
- Game-specific behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Existing delegate-backed compiled leaves still match interpreted behavior on current parity tests.
2. A unit test proves delegate-backed descriptor dispatch still succeeds for all supported delegate-backed leaf effects after consolidation.
3. No bespoke repeated delegate wrapper pattern remains at converted callsites in `effect-compiler-codegen.ts`.
4. Existing suite: `pnpm turbo test`
5. Existing suite: `pnpm turbo typecheck`
6. Existing suite: `pnpm turbo lint`

### Invariants

1. Delegate-backed compiled leaf effects continue to share runtime semantics with their existing handler implementations.
2. The abstraction remains kernel-internal and game-agnostic.
3. No compatibility aliases or duplicate bridge paths are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — strengthen dispatch/parity coverage for delegate-backed compiled leaves after consolidation.
2. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — keep sequence-level parity coverage intact across refactored delegate-backed fragments.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js packages/engine/dist/test/unit/kernel/effect-compiler.test.js`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `pnpm turbo test`
