# 81WHOSEQEFFCOM-009: Compile lifecycle-only choice effects (chooseOne, chooseN)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md, archive/tickets/81WHOSEQEFFCOM-002-variable-binding-leaf-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-005-token-effects.md, tickets/81WHOSEQEFFCOM-006-iteration-reduction-effects.md

## Problem

Two choice effects (tags 15, 16) fall back to the interpreter. In lifecycle effect contexts, `chooseOne` and `chooseN` are always bot-resolved (no human player) — they invoke the decision-resolution pipeline directly. These are the final two effect types needed before the fallback path can be deleted. They are also the most complex compiled closures due to option template resolution, prioritized tier queries, and the `pendingChoice` propagation contract.

## Assumption Reassessment (2026-03-25)

1. `chooseOne` (tag 15) and `chooseN` (tag 16) are implemented in `effects-choice.ts` (~1535 lines) — the largest effect handler file.
2. In lifecycle contexts, these effects are bot-resolved: the decision pipeline selects an option immediately. However, the compiled closure must still handle the `pendingChoice` return path — if a choice cannot be resolved immediately (e.g., decision override in tests), the fragment propagates `pendingChoice` upward.
3. Option template resolution: `chooseOne` has `options` with `template` effects that may need compilation. `chooseN` has similar but with multi-choice cardinality and qualifier mapping.
4. Prioritized tier queries: options may be grouped into priority tiers with different query evaluations per tier.
5. The `chooseOne`/`chooseN` compiled closures are the most complex in the entire compilation pipeline. Consider delegating to the existing interpreter helper wrapped in compiled fragment contract if direct compilation is too error-prone.

## Architecture Check

1. The key question: should compiled `chooseOne`/`chooseN` replicate all the logic from `effects-choice.ts` (1535 lines), or delegate to the existing handlers wrapped in the compiled fragment contract?
2. **Recommended approach**: Compile the outer structure (check if lifecycle context, invoke decision resolution, handle `pendingChoice` propagation) but delegate the complex option resolution and tier query logic to existing helpers. This eliminates the interpreter dispatch overhead while keeping the diff manageable.
3. The `pendingChoice` propagation contract: if the inner decision resolution returns a pending choice, the fragment must propagate it with current bindings and decision scope. This is already handled by the existing `composeFragments` infrastructure.
4. Template effects within options: if option templates contain effects that need execution (e.g., to compute option viability), those effects should use the compiled path when available.
5. Because this ticket is likely to delegate to existing choice handlers, it SHOULD reuse the shared compiled delegate helper for the outer adapter layer and keep any choice-specific logic focused on lifecycle/bot-resolution behavior rather than repeating bridge mechanics.

## What to Change

### 1. Add pattern descriptors

In `effect-compiler-patterns.ts`:
- `ChooseOnePattern`: chooser, options, optional fallback, decision scope context
- `ChooseNPattern`: chooser, options, cardinality (min/max), qualifier mapping, decision scope context
- Add `matchChooseOne`, `matchChooseN`
- Wire into `classifyEffect` switch for tags 15, 16

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- `compileChooseOne(desc, bodyCompiler)` — compile outer decision structure, delegate option resolution to existing helpers, handle `pendingChoice` propagation, compile option template effects where possible
- `compileChooseN(desc, bodyCompiler)` — same pattern with multi-choice cardinality handling
- Reuse the shared delegate-wrapper helper for the common bridge mechanics if the implementation delegates to existing handler functions
- Wire into `compilePatternDescriptor` dispatcher

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)

## Out of Scope

- Action-context choice compilation (future spec — requires CPS/coroutine model for player-facing suspension)
- `grantFreeOperation` (tag 22) — deferred to action-effect compilation spec
- Refactoring `effects-choice.ts` internals
- Deleting `createFallbackFragment` (ticket 010)
- Human-player choice resolution (lifecycle choices are always bot-resolved)

## Acceptance Criteria

### Tests That Must Pass

1. Per-effect-type unit test: `compileChooseOne` resolves bot decision correctly in lifecycle context
2. Per-effect-type unit test: `compileChooseN` resolves bot multi-choice correctly with cardinality constraints
3. Parity test: chooseOne compiled output matches interpreted output (all 7 verification dimensions) for representative lifecycle choices
4. Parity test: chooseN compiled output matches interpreted output
5. `pendingChoice` propagation test: when decision resolution returns pending, the fragment correctly propagates it with current bindings and decision scope
6. Option template test: option template effects execute correctly within the compiled closure
7. Tier query test: prioritized tier options resolve in correct priority order
8. Edge case tests: chooseOne with single option (auto-select), chooseN with min:0 (optional selection), chooseOne with no valid options (fallback path)
9. Trace parity test: compiled choice effects emit identical trace entries to interpreted path
10. Existing suite: `pnpm turbo test`
11. Existing suite: `pnpm turbo typecheck`

### Invariants

1. Lifecycle choice effects are always bot-resolved (no human player suspension in compiled lifecycle path)
2. `pendingChoice` propagation contract preserved — compiled fragments propagate pending choices identically to interpreted path
3. Option template effect execution in compiled path produces identical results to interpreted path
4. Decision scope management in compiled choices matches interpreted path
5. Coverage ratio reaches 100% for all lifecycle sequences after this ticket (all 33 types compilable, excluding `grantFreeOperation`)
6. Verification mode passes for all lifecycle sequences

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — Add tests for `compileChooseOne`, `compileChooseN`
2. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Add tests for `matchChooseOne`, `matchChooseN`

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
