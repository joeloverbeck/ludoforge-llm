# 81WHOSEQEFFCOM-014: Make compiled execution context requirements explicit

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — compiled effect context/types, composeFragments/codegen/runtime plumbing, compiled context/runtime tests
**Deps**: archive/specs/81-whole-sequence-effect-compilation.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-013-normalized-effect-result-contract.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-012-decision-scope-contract-alignment.md

## Problem

The compiled lifecycle path still encodes core execution invariants as optional context fields.

- `CompiledEffectContext` makes `decisionScope`, `effectBudget`, `tracker`, `mode`, and `decisionAuthority` optional.
- `composeFragments` and codegen repeatedly repair that optionality with `?? emptyScope()` and ad hoc context spreading.
- That leaves the compiled execution path structurally looser than the interpreted path, even though compiled lifecycle execution now depends on the same deterministic invariants.

This is functional today, but it is not the clean long-term architecture. Per Foundations 5, 9, and 10, compiled execution should consume a context whose required execution invariants are explicit rather than inferred.

## Assumption Reassessment (2026-03-25)

1. Ticket 013 has already landed, so compiled sequence outputs now return the normalized result contract directly. This ticket is follow-on contract cleanup, not a prerequisite reshaping of result typing.
2. `composeFragments` already creates the mutable-state scope, constructs `effectBudget` when absent, and normalizes `decisionScope` once at sequence entry before iterating fragments.
3. The remaining architectural looseness is lower in the stack:
   - `CompiledEffectContext` still models execution invariants such as `decisionScope`, `effectBudget`, `tracker`, `mode`, and `decisionAuthority` as optional
   - `effect-compiler-codegen.ts` and `effect-compiler-runtime.ts` still repair those fields locally when bridging into delegate handlers or nested fragment execution
4. Lifecycle compiled execution is still the only supported compiled path today, and it already has enough information to produce a required internal execution context once execution begins.
5. The right fix is not to push more defaults down into helpers. The right fix is to promote to a required internal compiled execution context for fragment/delegate execution and to keep boundary context requirements honest where architecture guards already demand them.

## Architecture Check

1. The clean architecture is a two-tier compiled context model:
   - a boundary context that already carries explicit mode/decision authority
   - a required internal compiled execution context used after `composeFragments` crosses into actual execution
2. This is more robust than the current architecture because it centralizes invariant construction once, respects existing mode-threading architecture guards, and removes repeated local repairs inside compiled fragment/delegate helpers.
3. This preserves engine agnosticism. It changes only generic kernel/compiler plumbing, not any game-specific logic or spec contract.
4. This is preferable to the current architecture. It strengthens the existing adapter seam in `effect-compiler-runtime.ts` instead of introducing more fallback helpers or parallel alias contracts.
5. No backwards-compatibility aliasing is needed. Existing compiled execution internals should migrate directly to the stricter internal context in one pass.

## What to Change

### 1. Introduce a required internal compiled execution context

In `effect-compiler-types.ts` and related execution entry points:

- Keep the sequence-entry context as the boundary/input shape.
- Keep `mode` and `decisionAuthority` explicit at the boundary where existing kernel architecture already requires them.
- Define a required internal compiled execution context with `decisionScope`, `effectBudget`, and `tracker` guaranteed once execution begins.
- Update compiled fragment typing and runtime helpers to consume the required internal context rather than the loose boundary shape.

### 2. Remove local fallback repair logic from internal compiled execution

In `effect-compiler.ts`, `effect-compiler-codegen.ts`, and `effect-compiler-runtime.ts`:

- Update `composeFragments` to promote the boundary/input context into the required internal execution context once at sequence entry.
- Remove repeated `?? emptyScope()`, `ctx.mode === undefined ? 'execution' : ctx.mode`, default decision-authority construction, and equivalent repairs inside compiled fragment/delegate execution where the stricter type makes them impossible.
- Keep deterministic behavior identical.

### 3. Tighten compiled parity and contract tests

- Add or update tests that prove sequence entry promotes the loose boundary context into a required internal execution context once and still produces identical results to interpreted execution.
- Add focused unit tests around compiled runtime/context helpers so future compiled code cannot silently reintroduce missing execution invariants.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-types.ts` (modify)
- `packages/engine/src/kernel/effect-compiler.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-runtime.ts` (modify)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify only if the boundary call site needs cleanup)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-runtime.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` (modify if needed)
- `packages/engine/test/integration/compiled-effects-verification.test.ts` (modify only if lifecycle verification coverage needs extension)

## Out of Scope

- Broad runtime `EffectContext` redesign outside compiled execution
- New lifecycle compilation features or additional effect coverage work
- Any game-specific authoring/model changes

## Acceptance Criteria

### Tests That Must Pass

1. Compiled fragment/delegate execution consumes a required internal execution context whose runtime invariants are explicit in types.
2. `composeFragments` performs invariant promotion once at the boundary rather than repairing missing scope/authority/mode throughout execution.
3. Compiled-vs-interpreted parity still passes unchanged, including `decisionScope`.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm turbo typecheck`
6. Existing suite: `pnpm turbo lint`

### Invariants

1. Once fragment execution begins, compiled code cannot observe a missing `decisionScope`, `effectBudget`, or `tracker`.
2. Compiled boundary callers must provide explicit `mode` and `decisionAuthority`; no runtime fallback semantics remain in kernel compiled-context plumbing.
3. Sequence-entry promotion happens once at the boundary, not repeatedly inside compiled fragment or delegate bodies.
4. No compatibility shims or alias contracts remain after migration.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — prove sequence entry promotes a loose boundary context into the required internal execution context once and still matches interpreted parity.
2. `packages/engine/test/unit/kernel/effect-compiler-runtime.test.ts` — prove compiled runtime helpers consume the required internal context directly and stop repairing missing execution invariants locally.
3. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — extend only if needed to protect delegate/fragment paths against reintroducing local fallback repairs.
4. `packages/engine/test/integration/compiled-effects-verification.test.ts` — extend only if needed to protect the stricter compiled execution context through lifecycle verification.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-compiler.test.js packages/engine/dist/test/unit/kernel/effect-compiler-runtime.test.js packages/engine/dist/test/integration/compiled-effects-verification.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-25
- What actually changed:
  - introduced `CompiledExecutionContext` as the required internal compiled fragment/delegate context while keeping `CompiledEffectContext` as the boundary contract
  - centralized boundary-to-execution promotion in `effect-compiler-runtime.ts` and updated `composeFragments` to construct the stronger execution context once
  - removed local compiled fallback repairs for `decisionScope`, `effectBudget`, `tracker`, and delegate plumbing inside `effect-compiler-codegen.ts`
  - tightened the boundary contract so compiled callers provide explicit `mode` and `decisionAuthority`, matching the kernel mode-threading architecture guard instead of reintroducing fallback semantics
  - strengthened focused runtime/compiler tests to lock the new contracts in place, including guard-sensitive coverage
- Deviations from original plan:
  - `mode` and `decisionAuthority` were not left optional at the boundary because `effect-mode-threading-guard` correctly forbids execution-mode fallback semantics in kernel plumbing
  - `packages/engine/src/kernel/phase-lifecycle.ts` and `packages/engine/test/integration/compiled-lifecycle-runtime.test.ts` required updates once the stricter boundary contract became explicit
  - `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` needed helper changes so fragment-level tests execute through the same mutable compiled scope the runtime now guarantees
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/effect-compiler.test.js packages/engine/dist/test/unit/kernel/effect-compiler-runtime.test.js packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js packages/engine/dist/test/unit/kernel/effect-compiler-types.test.js packages/engine/dist/test/integration/compiled-effects-verification.test.js`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm -F @ludoforge/engine test`
