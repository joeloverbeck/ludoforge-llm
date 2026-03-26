# 81WHOSEQEFFCOM-009: Compile lifecycle-only choice effects (chooseOne, chooseN)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md, archive/tickets/81WHOSEQEFFCOM-002-variable-binding-leaf-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-005-token-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-006-iteration-reduction-effects.md

## Problem

Two choice effects (tags 15, 16) still fall back to the interpreter. They are the final remaining non-`grantFreeOperation` lifecycle tags before ticket 010 can delete the fallback path.

The current compiler architecture already supports delegate-backed compiled leaves through `executeCompiledDelegate` in `effect-compiler-codegen.ts`. `chooseOne` and `chooseN` are the right place to use that architecture rather than duplicating the large runtime semantics in `effects-choice.ts`.

## Assumption Reassessment (2026-03-25)

1. `chooseOne` (tag 15) and `chooseN` (tag 16) are implemented in `effects-choice.ts` (~1535 lines) — the largest effect handler file.
2. The current lifecycle execution path (`dispatchLifecycleEvent` in `phase-lifecycle.ts`) invokes compiled/interpreted effects in execution mode with `moveParams: {}`. There is no separate lifecycle auto-resolution pipeline at this boundary today. Any compiled choice implementation must therefore preserve the current runtime contract instead of inventing new bot-resolution semantics.
3. The canonical runtime semantics for both tags already live in `applyChooseOne` and `applyChooseN` in `effects-choice.ts`, including:
   - decision-scope advancement
   - `pendingChoice` propagation in discovery mode
   - ownership validation in execution mode
   - prioritized query / qualifier handling for `chooseN`
   - chooseN template callback creation during discovery
4. `chooseOne` / `chooseN` do not own nested option-effect bodies in the effect compiler. The important runtime complexity is query-domain resolution and pending-choice construction, not compiling some separate option-template effect AST.
5. `classifyEffect` is already `switch(effect._k)`-based. This ticket only needs to add descriptors for tags 15 and 16; it does not own dispatcher redesign.
6. The compiler test surface already includes:
   - pattern-classification coverage in `effect-compiler-patterns.test.ts`
   - per-effect parity tests in `effect-compiler-codegen.test.ts`
   - sequence coverage/fallback assertions in `effect-compiler.test.ts`
7. Ticket 011 remains the explicit follow-on consolidation pass for delegate-backed wrappers. This ticket should reuse the existing helper, not introduce another one-off bridge shape.

## Architecture Check

1. The key question: should compiled `chooseOne`/`chooseN` replicate all the logic from `effects-choice.ts` (1535 lines), or delegate to the existing handlers wrapped in the compiled fragment contract?
2. **Recommended approach**: add payload-based pattern descriptors and compile both tags as thin delegate-backed fragments that call the canonical runtime handlers. This removes interpreter fallback from lifecycle compilation without splitting choice semantics across two implementations.
3. This architecture is more robust than writing bespoke compiled choice engines:
   - one source of truth for choice semantics
   - smaller diff and lower regression risk
   - no compatibility shim or alias path
   - easy follow-on cleanup in ticket 011
4. `pendingChoice`, bindings, and decision-scope propagation should remain whatever the canonical runtime handlers return after normalization through the compiled delegate wrapper. `composeFragments` already short-circuits correctly on pending choices.
5. This ticket should not add lifecycle-only decision resolution, alternate chooser behavior, or compiler-owned query semantics. If the architecture around choice execution ever changes, that should happen in the runtime handlers first and the compiled delegate wrappers should continue to reuse it.

## What to Change

### 1. Add pattern descriptors

In `effect-compiler-patterns.ts`:
- `ChooseOnePattern`: payload-backed descriptor for `chooseOne`
- `ChooseNPattern`: payload-backed descriptor for `chooseN`
- Add `matchChooseOne`, `matchChooseN`
- Wire into `classifyEffect` switch for tags 15, 16

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- `compileChooseOne(desc)` — thin delegate-backed compiled leaf that calls `applyChooseOne`
- `compileChooseN(desc)` — thin delegate-backed compiled leaf that calls `applyChooseN`
- Reuse the existing shared delegate-wrapper helper for the common bridge mechanics
- Wire into `compilePatternDescriptor` dispatcher

### 3. Update coverage/fallback tests

Because these are the final remaining lifecycle choice tags, sequence-level tests must be updated to reflect that mixed fallback cases using `chooseOne` / `chooseN` are no longer valid after this ticket. Ticket 010 will delete the fallback path; this ticket should leave the test suite already aligned with that direction where choice effects are concerned.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify)

## Out of Scope

- Refactoring `effects-choice.ts` internals beyond what is strictly needed for safe delegation
- Deleting `createFallbackFragment` (ticket 010)
- Action-context CPS/coroutine compilation work
- Inventing lifecycle-only choice auto-resolution semantics
- Replacing the canonical choice runtime with a second compiler-owned implementation
- `grantFreeOperation` (tag 22) — deferred to action-effect compilation spec

## Acceptance Criteria

### Tests That Must Pass

1. `matchChooseOne` / `matchChooseN` classify tags 15 and 16 as compiled descriptors.
2. `compileChooseOne` matches interpreted behavior for representative execution-mode and discovery-mode cases.
3. `compileChooseN` matches interpreted behavior for representative execution-mode and discovery-mode cases, including prioritized-tier / qualifier handling.
4. `pendingChoice` parity is preserved through the compiled delegate path.
5. Sequence-level compiler tests reflect that `chooseOne` / `chooseN` no longer contribute to fallback coverage gaps.
6. Coverage regression tests now treat tags 15 and 16 as compiled, bringing lifecycle coverage to 100% except for the separately deferred `grantFreeOperation` invariant enforced in ticket 010.
7. Existing suite: `pnpm -F @ludoforge/engine test`
8. Existing suite: `pnpm turbo typecheck`
9. Existing suite: `pnpm turbo lint`

### Invariants

1. `chooseOne` / `chooseN` compiled closures preserve canonical runtime semantics by delegating to `applyChooseOne` / `applyChooseN`.
2. `pendingChoice`, bindings, trace output, and decision-scope behavior match interpreted execution for the same context.
3. No lifecycle-only choice engine, alias path, or compatibility shim is introduced.
4. Tags 15 and 16 become compiled for lifecycle-sequence coverage accounting.
5. Verification mode remains parity-valid because compiled choice fragments share the same runtime semantics as the interpreted path.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — add `chooseOne` / `chooseN` parity tests for execution and discovery semantics
2. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — add matcher/classifier assertions for tags 15 and 16 and update coverage expectations
3. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — update fallback/coverage assertions now that choice tags compile

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-25
- What actually changed:
  - Added compiled pattern descriptors and matcher coverage for `chooseOne` / `chooseN`.
  - Compiled both tags as thin delegate-backed leaves that reuse `applyChooseOne` / `applyChooseN` instead of introducing a second choice engine.
  - Widened compiled-effect context threading so delegate-backed leaves can preserve execution and discovery semantics, including transient choice selections and `chooseN` template callbacks.
  - Updated compiler sequence tests so lifecycle choice tags no longer count toward fallback coverage gaps.
- Deviations from original plan:
  - The original ticket assumption about a lifecycle-specific auto-resolution path was incorrect and was removed before implementation.
  - No new choice-specific bridge helper was introduced; the existing delegate-wrapper path was extended just enough to carry canonical runtime context.
  - Sequence parity assertions were aligned to public observable behavior after confirming that `applyEffects` drops `decisionScope` on successful completion even though compiled composition still threads it internally.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node packages/engine/dist/test/unit/kernel/effect-compiler-patterns.test.js`
  - `node packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js`
  - `node packages/engine/dist/test/unit/kernel/effect-compiler.test.js`
  - `node packages/engine/dist/test/unit/kernel/effect-mode-threading-guard.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo test`
