# 81WHOSEQEFFCOM-011: Consolidate compiled delegate-backed leaf wrappers

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — effect-compiler-codegen.ts, effect-compiler tests
**Deps**: archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-004-turn-flow-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-005-token-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-007-information-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-008-complex-control-flow-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-009-lifecycle-choice-effects.md

## Problem

The compiled lifecycle path already uses a sound delegate-backed architecture for many leaf effects: it bridges compiled execution into runtime handlers so compiled and interpreted semantics stay aligned. The remaining issue is not missing architecture; it is repeated wrapper boilerplate inside `effect-compiler-codegen.ts`.

Today, many compiled leaves still repeat the same shape:
- call `executeCompiledDelegate(...)`
- build a fresh effect AST node
- create the same fixed temporary budget object
- provide the same compiled-only `applyBatch` rejection closure
- invoke the runtime handler

That duplication is now the real cleanup target. Keeping it duplicated in the compiler core violates Foundations 9 and 10 because there is already one clear architectural pattern, but not yet one clear implementation primitive for it.

## Assumption Reassessment (2026-03-25)

1. `packages/engine/src/kernel/effect-compiler-codegen.ts` already contains the critical shared bridge, `executeCompiledDelegate(...)`. The missing abstraction is narrower: a factory/helper for the repeated fragment-level builder + handler wiring that sits on top of that bridge.
2. Delegate-backed compiled leaves already exist across turn-flow, marker, token, information, resource, and choice effects. Ticket 010 also introduced delegate-mode lifecycle `setVar` / `addVar` compilation for descriptor cases that cannot use the optimized direct-write path.
3. Existing unit tests already provide broad interpreted-vs-compiled parity coverage for most delegate-backed leaves. The main remaining test gap is explicit coverage for delegate-mode `setVar` / `addVar` plus a dispatch inventory that proves the delegate-backed descriptor set still compiles after consolidation.
4. The existing delegate-backed approach is architecturally correct because runtime semantics still live in one place: the runtime handlers. This ticket should preserve that property, not replace it with new semantics in codegen.
5. A new helper module is not currently justified by the code shape. The duplication lives entirely inside `effect-compiler-codegen.ts`, and the cleanest change is likely a local helper/factory in that file unless implementation proves otherwise.
6. No active ticket other than this one owns the wrapper-level consolidation as an explicit deliverable. Tickets 008, 009, and 010 established coverage and fallback removal, but not the final boilerplate collapse.
7. The public `decisionScope` contract asymmetry between interpreted and compiled execution remains a separate runtime-contract issue tracked in `tickets/81WHOSEQEFFCOM-012-decision-scope-contract-alignment.md`.

## Architecture Check

1. The clean architecture is a narrow local helper/factory that owns the repeated delegate-fragment mechanics on top of `executeCompiledDelegate(...)`. Individual compiled leaf functions should only declare effect-specific payload/build/handler wiring.
2. This stays fully game-agnostic: it is compiler/runtime infrastructure, not game logic, so it aligns with Foundation 1.
3. This is not a compatibility shim. It replaces repeated code with one current-truth abstraction and updates all callsites in one pass, aligning with Foundations 9 and 10.
4. The abstraction boundary must remain narrow: do not hide effect-specific semantics or invent a second dispatch layer. Only centralize the repeated compiled-to-runtime delegate plumbing.
5. Because the bridge already exists, introducing an additional helper module or more indirection than needed would be architectural regression, not improvement.

## What to Change

### 1. Introduce a local delegate fragment factory on top of the existing bridge

In `effect-compiler-codegen.ts`, add a small helper/factory that encapsulates the repeated fragment-level delegate wrapper work:
- create `nodeCount: 1` fragments for delegate-backed leaves
- reuse `executeCompiledDelegate(...)`
- construct the runtime effect node
- allocate the temporary delegate budget
- provide the compiled-only `applyBatch` rejection callback

This helper should stay local unless implementation proves a second file is necessary.

### 2. Convert existing delegate-backed compiled leaves to the helper

Refactor the current delegate-backed compiled leaves in `effect-compiler-codegen.ts` to use the shared local abstraction instead of repeating bespoke wrappers.

Expected coverage includes the existing delegate-backed leaves in:
- turn-flow compilation
- marker compilation
- token compilation
- information compilation
- resource compilation
- choice compilation
- delegate-mode lifecycle `setVar` / `addVar`

### 3. Keep control-flow compilation separate

Do not merge this with the shared control-flow helper work tracked in ticket 008. The delegate-wrapper helper is for compiled leaf-to-runtime bridging, not loop/continuation semantics.

### 4. Tighten tests around the shared delegate abstraction

Add or update tests so the abstraction is proven safe:
- delegate-backed compiled leaves still match interpreted behavior
- delegate-mode `setVar` / `addVar` explicitly exercise the delegate path, not only the optimized path
- dispatch coverage still includes all delegate-backed descriptors after consolidation
- no effect-specific trace/binding/state semantics regress during the refactor

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify if needed for coverage / dispatch assertions)

## Out of Scope

- Rewriting runtime effect handler internals
- Replacing direct compilation for non-delegate control-flow effects
- Removing the lifecycle fallback path (already completed in ticket 010)
- Choice/action CPS model changes
- Game-specific behavior changes
- Normalizing the public `decisionScope` return contract across interpreted and compiled execution (ticket 012)
- Creating a new helper module unless the implementation reveals a concrete need for one

## Acceptance Criteria

### Tests That Must Pass

1. Existing delegate-backed compiled leaves still match interpreted behavior on current parity tests.
2. A unit test proves delegate-backed descriptor dispatch still succeeds for all supported delegate-backed leaf effects after consolidation.
3. A unit test explicitly proves delegate-mode `setVar` and `addVar` still match interpreter behavior.
4. The repeated inline delegate wrapper pattern is removed from converted callsites in `effect-compiler-codegen.ts`.
5. Existing suite: `pnpm turbo test`
6. Existing suite: `pnpm turbo typecheck`
7. Existing suite: `pnpm turbo lint`

### Invariants

1. Delegate-backed compiled leaf effects continue to share runtime semantics with their existing handler implementations.
2. The abstraction remains kernel-internal and game-agnostic.
3. No compatibility aliases or duplicate bridge paths are introduced.
4. `executeCompiledDelegate(...)` remains the single compiled-to-runtime bridge for these leaves; the new helper must build on it rather than bypass it.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — add explicit delegate-mode `setVar` / `addVar` parity tests and strengthen delegate-backed descriptor dispatch coverage.
2. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — keep sequence-level parity coverage intact across refactored delegate-backed fragments if changes are needed there.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js packages/engine/dist/test/unit/kernel/effect-compiler.test.js`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `pnpm turbo test`

## Outcome

Completed: 2026-03-25

What actually changed:
- Added one local delegate-fragment factory in `effect-compiler-codegen.ts` on top of the existing `executeCompiledDelegate(...)` bridge, instead of creating a new helper module.
- Converted the delegate-backed leaf compilers to that factory, removing the repeated inline budget / `applyBatch`-rejection / handler-wrapper boilerplate.
- Strengthened unit coverage with explicit delegate-mode parity tests for lifecycle `setVar` / `addVar` and a dispatch inventory for the delegate-backed descriptor set.

Deviation from the original ticket:
- The ticket originally proposed a new helper module. After reassessment, that would have added unnecessary indirection because the bridge already existed and all duplication lived in one file.

Verification:
- `pnpm turbo build`
- `node --test packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js packages/engine/dist/test/unit/kernel/effect-compiler.test.js`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
- `pnpm turbo test`
