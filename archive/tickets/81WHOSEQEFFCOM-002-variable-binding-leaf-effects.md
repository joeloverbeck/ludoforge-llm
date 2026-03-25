# 81WHOSEQEFFCOM-002: Compile variable/binding leaf effects (bindValue, transferVar, let)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts
**Deps**: 81WHOSEQEFFCOM-001 (switch dispatch)

## Problem

Three variable/binding effects still fall back to the interpreter: `bindValue` (tag 14), `transferVar` (tag 3), and `let` (tag 32). These are high-frequency effects — `let` appears in nearly every non-trivial lifecycle sequence, and `bindValue` is ubiquitous. Each interpreter fallback incurs kind extraction, registry lookup, handler invocation, and result normalization overhead.

## Assumption Reassessment (2026-03-25)

1. `bindValue` is implemented in `packages/engine/src/kernel/effects-binding.ts`. It evaluates a full `ValueExpr`, writes a binding, does not mutate state, and returns `emittedEvents: []`.
2. `transferVar` is implemented in `packages/engine/src/kernel/effects-resource.ts`, not `effects-var.ts`. It is a resource effect with richer semantics than a two-write leaf: global/pvar/zone endpoints, `amount` plus optional `min`/`max`, optional `actualBind`, same-cell/no-op fast paths, `resourceTransfer` trace emission, var-change event emission, malformed-endpoint support, and mutable-path incremental hash updates for both endpoints.
3. `let` is implemented in `packages/engine/src/kernel/effects-control.ts`. Its core semantics are: evaluate a full `ValueExpr`, extend bindings for the nested body, preserve pending-choice behavior by restoring outer bindings on suspension, and export only `$`-prefixed nested bindings except the local `let.bind`. `let` itself does not emit a dedicated trace entry.
4. `compileValueAccessor` only compiles a narrow subset of value expressions today (literals plus simple binding/gvar/pvar refs). `bindValue` and `let` accept general `ValueExpr`, so a ticket that assumes simple-accessor coverage is incomplete.
5. The existing test surface is broader than the original ticket assumed: there are dedicated runtime tests for `bindValue`, `transferVar`, resource-transfer tracing, incremental variable hashing, compiler pattern/codegen tests, and compiler verification tests. This ticket should extend those existing suites rather than add a parallel one-off harness.

## Architecture Check

1. Compiling these effects is still architecturally beneficial because they are frequent lifecycle nodes and every compiled closure removes one interpreter dispatch hop from hot paths.
2. A "simple-pattern-only" implementation would be the wrong architecture for this ticket. `bindValue`, `let`, and especially `transferVar` must preserve the full current runtime contract, not a narrowed subset.
3. The cleanest implementation is to keep the existing `CompiledEffectFragment` contract and add descriptors/closures that close over the real payload shape needed at runtime. For `bindValue`/`let`, this means evaluating the captured `ValueExpr` in the compiled path instead of forcing everything through `compileValueAccessor`. For `transferVar`, this means mirroring `effects-resource.ts` semantics, including `actualBind`, trace behavior, same-cell/no-op handling, zone endpoints, and mutable-path hash updates.
4. No fallback aliases or compatibility shims should be introduced. If richer semantics expose missing compiler helpers, add the helper once and use it consistently.

## What to Change

### 1. Add pattern descriptors for bindValue, transferVar, let

In `effect-compiler-patterns.ts`:
- `BindValuePattern`: captures `bind` and the raw `ValueExpr`
- `TransferVarPattern`: captures the raw transfer payload (`from`, `to`, `amount`, optional `min`, optional `max`, optional `actualBind`)
- `LetPattern`: captures `bind`, the raw `ValueExpr`, and nested `in` effects
- Add `matchBindValue`, `matchTransferVar`, `matchLet` functions
- Wire into `classifyEffect` switch cases for tags 14, 3, 32

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- `compileBindValue(desc)` — evaluates the captured `ValueExpr`, extends bindings, leaves state unchanged
- `compileTransferVar(desc)` — mirrors `applyTransferVar` semantics from `effects-resource.ts`, including optional `min`/`max`, optional `actualBind`, same-cell/no-op behavior, resource-transfer tracing, var-change events, zone/pvar/global endpoint support, and mutable-path incremental hash updates
- `compileLet(desc, bodyCompiler)` — evaluates the captured `ValueExpr`, recursively executes the nested body, preserves pending-choice behavior, and exports only `$`-prefixed nested bindings except the local `bind`
- Wire into `compilePatternDescriptor` dispatcher

### 3. Extend value expression compilation (if needed)

- Do not make this ticket depend on broadening `compileValueAccessor` just to handle general `ValueExpr`.
- Reuse existing runtime `evalValue` semantics in the compiled closures where necessary so compiler coverage increases without losing expression support.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify if coverage expectations change)
- Additional existing kernel tests may be strengthened if the compiled path exposes an uncovered invariant

## Out of Scope

- Token effects (ticket 005)
- Marker effects (ticket 003)
- Turn flow effects (ticket 004)
- forEach-general, reduce, removeByPriority (ticket 006)
- Deleting `createFallbackFragment` (ticket 010)
- Broad value-expression compilation beyond what this ticket directly needs
- Extending condition compilation (covered by condition expressions within `if`, already compiled)
- Action-context effects (`grantFreeOperation`)

## Acceptance Criteria

### Tests That Must Pass

1. Pattern tests prove `classifyEffect` now returns non-null descriptors for `_k` tags 3, 14, and 32.
2. Codegen parity tests prove compiled `bindValue`, `transferVar`, and `let` match interpreted execution for state, bindings, emitted events, decision scope, and full hash.
3. `transferVar` parity covers at least one case using `actualBind`, one case using optional `min`/`max`, and one case that exercises no-op or same-cell behavior.
4. `let` parity covers nested binding export semantics and pending-choice-safe binding restoration semantics if applicable through existing compiled-body behavior.
5. Coverage/accounting tests are updated so sequences using these effects report the expected higher coverage ratio.
6. Existing suite: relevant engine tests for the compiler path, plus the broader `@ludoforge/engine` test suite, typecheck, and lint all pass.

### Invariants

1. `CompiledEffectFragment` contract unchanged — no new fields or type changes
2. Compiled `let` binding export filtering is identical to `applyLet`
3. Compiled `transferVar` semantics are identical to `applyTransferVar`, including trace/event behavior and mutable-path hash updates
4. Coverage ratio increases for sequences containing these effects
5. Verification mode remains valid for lifecycle sequences that now compile these effects

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — Add compiled/interpreted parity tests for `bindValue`, `transferVar`, and `let`
2. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Add matcher/classification coverage for `bindValue`, `transferVar`, and `let`
3. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — Update coverage assertions for mixed and fully compilable sequences where needed

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-25
- Actual changes:
  - Added compiled descriptors for `bindValue`, `transferVar`, and `let` in `effect-compiler-patterns.ts`
  - Added compiled codegen support for `bindValue`, `transferVar`, and `let` in `effect-compiler-codegen.ts`
  - Increased lifecycle coverage so sequences containing these effects can compile without fragment fallback for those nodes
  - Strengthened compiler pattern/codegen/orchestrator tests to cover classification, full parity, coverage accounting, `actualBind`, `min`/`max`, same-cell no-op behavior, nested `let` export semantics, and tracker parity
  - Cleared unrelated pre-existing engine lint drift so repo-wide lint now passes
- Deviations from original plan:
  - `transferVar` was implemented against its real runtime architecture in `effects-resource.ts`, not the narrower `effects-var.ts` assumption in the original ticket
  - `bindValue` and `let` preserve full `ValueExpr` support instead of depending on `compileValueAccessor` expansion
  - `transferVar` reuses the existing runtime handler semantics from the compiled path rather than duplicating a parallel partial implementation
- Verification:
  - `node --test packages/engine/dist/test/unit/kernel/effect-compiler-patterns.test.js packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js packages/engine/dist/test/unit/kernel/effect-compiler.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
