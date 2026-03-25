# 81WHOSEQEFFCOM-002: Compile variable/binding leaf effects (bindValue, transferVar, let)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts
**Deps**: 81WHOSEQEFFCOM-001 (switch dispatch)

## Problem

Three variable/binding effects still fall back to the interpreter: `bindValue` (tag 14), `transferVar` (tag 3), and `let` (tag 32). These are high-frequency effects — `let` appears in nearly every non-trivial lifecycle sequence, and `bindValue` is ubiquitous. Each interpreter fallback incurs kind extraction, registry lookup, handler invocation, and result normalization overhead.

## Assumption Reassessment (2026-03-25)

1. `bindValue` is implemented in `effects-binding.ts` (~28 lines) — adds a key-value pair to bindings, no state mutation. Simplest possible effect.
2. `transferVar` is implemented in `effects-var.ts` — reads two var endpoints, computes transfer amount, writes both. Requires Zobrist hash updates for both endpoints.
3. `let` is implemented in `effects-control.ts` (lines ~95-128) — binds a value, executes an inner effect body, then exports only `$`-prefixed bindings excluding its own bind name. Medium-high complexity due to binding export filtering and trace emission.
4. `compileValueAccessor` in `effect-compiler-codegen.ts` already handles simple value expressions (literals, binding refs, gvar/pvar reads). `let` needs this for its value expression.
5. `emitVarChangeArtifacts` in `effect-compiler-codegen.ts` is already available for trace emission on var changes.

## Architecture Check

1. `bindValue` is the simplest possible compiled closure — just extends bindings map, returns unchanged state. Good warm-up pattern.
2. `transferVar` follows `setVar`/`addVar` patterns but touches two targets. Zobrist hash update needed for both.
3. `let` is the most complex of the three: requires recursive body compilation, binding export filtering (`$`-prefix only, exclude own bind), and trace emission. The spec provides exact pseudocode (Section 1, `compileLet` example).
4. All three maintain the existing `CompiledEffectFragment` contract — no structural changes needed.

## What to Change

### 1. Add pattern descriptors for bindValue, transferVar, let

In `effect-compiler-patterns.ts`:
- `BindValuePattern`: captures bind name and value expression
- `TransferVarPattern`: captures source/target scope, amount expression, optional clamp
- `LetPattern`: captures bind name, value expression, and inner effect body (`in` effects)
- Add `matchBindValue`, `matchTransferVar`, `matchLet` functions
- Wire into `classifyEffect` switch cases for tags 14, 3, 32

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- `compileBindValue(desc)` — extends bindings, returns state unchanged
- `compileTransferVar(desc)` — reads two vars, computes transfer, writes both with clamping, Zobrist hash updates
- `compileLet(desc, bodyCompiler)` — compiles value accessor, recursively compiles body, implements `$`-prefix binding export filtering (mirrors `applyLet` lines 122-128 in `effects-control.ts`)
- Wire into `compilePatternDescriptor` dispatcher

### 3. Extend value expression compilation (if needed)

If `let` value expressions use patterns not yet handled by `compileValueAccessor` (arithmetic ops, conditionals), add those cases. Fallback to runtime `evalValue` for complex expressions.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)

## Out of Scope

- Token effects (ticket 005)
- Marker effects (ticket 003)
- Turn flow effects (ticket 004)
- forEach-general, reduce, removeByPriority (ticket 006)
- Deleting `createFallbackFragment` (ticket 010)
- Extending condition compilation (covered by condition expressions within `if`, already compiled)
- Action-context effects (`grantFreeOperation`)

## Acceptance Criteria

### Tests That Must Pass

1. Per-effect-type unit test: `compileBindValue` produces fragment that adds binding and returns state unchanged
2. Per-effect-type unit test: `compileTransferVar` produces fragment that reads/writes two var endpoints with correct clamping and Zobrist hash updates
3. Per-effect-type unit test: `compileLet` produces fragment with correct binding scoping — inner bind is visible in body, only `$`-prefixed bindings (excluding own bind) are exported
4. Parity test: `let` compiled output matches interpreted output for a representative nested let-in-let chain
5. Parity test: `bindValue` compiled output matches interpreted output
6. Parity test: `transferVar` compiled output matches interpreted output including Zobrist hash
7. Binding export test: `let` with nested `$`-prefixed bindings exports them correctly; non-`$` bindings are filtered
8. Trace parity test: `let` compiled closure emits identical trace entries to interpreted path
9. Existing suite: `pnpm turbo test`
10. Existing suite: `pnpm turbo typecheck`

### Invariants

1. `CompiledEffectFragment` contract unchanged — no new fields or type changes
2. Compiled `let` binding export filtering is identical to `applyLet` (effects-control.ts lines 122-128)
3. `transferVar` Zobrist hash updates match interpreted path exactly
4. Coverage ratio increases for sequences containing these effects
5. Verification mode (7-dimension parity check) passes for all lifecycle sequences

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — Add tests for `compileBindValue`, `compileTransferVar`, `compileLet`
2. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Add tests for `matchBindValue`, `matchTransferVar`, `matchLet`

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
