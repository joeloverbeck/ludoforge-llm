# 89SCOMUTEXECON-004: Finish scope convergence in complex handlers and delete merge functions

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel effect handlers + effect-context.ts cleanup
**Deps**: archive/tickets/89SCOMUTEXECON/89SCOMUTEXECON-003-dispatch-owned-mutable-read-scope.md

## Problem

After ticket 003, the remaining interpreted handler callers of
`mergeToEvalContext` / `mergeToReadContext` are:

- `effects-choice.ts`
- `effects-control.ts`
- `effects-subset.ts`
- `effects-token.ts`

The dispatch-owned `MutableReadScope` architecture already exists and already
has contract coverage. The remaining gap is convergence: these complex handlers
still rebuild `ReadContext`-shaped objects at local evaluation sites instead of
reusing the dispatch-owned scope or a tiny local scope mutation helper. Once
these last callers are removed, the merge helpers are dead code and must be
deleted (Foundation 9).

## Assumption Reassessment (2026-03-28)

1. `effects-choice.ts` still has one live `mergeToReadContext` caller in its
   custom `mergeChoiceToReadContext` path and still uses
   `toTraceProvenanceContext` for trace provenance — **confirmed discrepancy
   with the original ticket text, which did not keep choice explicitly in the
   main problem statement**.
2. `effects-control.ts` still uses `mergeToEvalContext` at multiple direct
   evaluation sites (`if`, `let`, `forEach`, `reduce`, `removeByPriority`) and
   also dispatches recursively via `applyEffectsWithBudgetState` —
   **confirmed**.
3. `effects-subset.ts` still uses both merge helpers plus
   `resolveEffectBindings` for its score evaluation path — **confirmed**.
4. `effects-token.ts` still contains the heaviest remaining `mergeToReadContext`
   usage cluster, including custom binding/state sites for token movement,
   draw/shuffle, and filtered `moveAll` behavior — **confirmed**.
5. Ticket `003` already widened the interpreted handler contract and compiled
   delegate plumbing to pass a dispatch-owned `MutableReadScope` explicitly.
   This ticket no longer needs to revisit handler-boundary architecture —
   **confirmed**.
6. `effect-context.ts` already exports `createMutableReadScope`,
   `updateReadScope`, and `updateReadScopeRaw`, with focused contract tests in
   `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts`
   — **confirmed missing test-surface acknowledgment in the original ticket**.
7. Nested scope isolation already exists at the dispatch layer:
   `applyEffectsWithBudgetState` creates a fresh `MutableReadScope` per
   invocation, while local nested evaluation inside a handler may need a
   temporary state/binding override without changing that ownership model —
   **confirmed refined scope**.

## Architecture Reassessment

1. The dispatch-owned `MutableReadScope` model from ticket `003` is more
   beneficial than the current partially migrated architecture. It keeps scope
   lifecycle explicit, avoids per-site `ReadContext` reconstruction, and
   preserves the immutable external contract.
2. Introducing a second eval-context abstraction now would be worse
   architecture. The clean design is one owning runtime model:
   dispatch creates scopes, handlers consume them, and local helper mutation is
   only an implementation detail for temporary state/binding overrides.
3. Complex handlers should not do blind search-and-replace. The ideal shape is:
   - reuse the incoming `scope` whenever its `state` and `bindings` already
     match the required semantics
   - use a tiny local helper only where a handler truly needs alternate
     bindings or alternate state for a single evaluation site
   - keep trace provenance derived from `env + cursor`, not from ad hoc
     synthetic contexts
4. Nested `applyEffectsWithBudgetState` calls must continue to own their own
   scopes. Local temporary scope mutation inside a handler must not become a
   hidden cross-dispatch channel.
5. After convergence, `mergeToEvalContext` and `mergeToReadContext` should have
   zero production callers and be deleted outright (Foundation 9).

## Architectural Note

Default recommendation: finish convergence on the dispatch-owned scope model and
keep any per-handler helper purely local, synchronous, and non-escaping. No new
alias layer, no parallel handler API, no backwards-compatibility bridge.

## What to Change

### 1. Reassess only the local state/binding update shape before replacing merge calls

The handler boundary decision is already settled by ticket `003`. For each
remaining caller, decide only whether direct `scope` reuse or a tiny local
helper is cleaner at each nested/custom-binding evaluation site.

Any local helper should mutate only:

- `scope.state`
- `scope.bindings`

and only for the shortest synchronous region that needs the override.

### 2. Migrate `effects-choice.ts`

Replace the remaining `mergeChoiceToReadContext` / `mergeToReadContext` usage
with scope-backed evaluation. Preserve choice-specific binding-template
resolution semantics; do not collapse them to plain `resolveEffectBindings`
if that would change dynamic binding names.

### 3. Migrate `effects-control.ts`

This handler primarily dispatches to `applyEffectsWithBudgetState` for body effects. Update any direct `mergeToEvalContext`/`mergeToReadContext` calls to use scope. Recursive dispatch already gets its own scope from ticket 003's changes.

### 4. Migrate `effects-subset.ts`

Replace `mergeToEvalContext` and `mergeToReadContext` calls with `scope`. Where `resolveEffectBindings` is called to construct custom bindings for subset evaluation, this may remain as a standalone call if the bindings differ from scope.bindings.

### 5. Migrate `effects-token.ts`

Replace `mergeToReadContext` calls with `scope`. Where `resolveEffectBindings` is called for custom binding resolution in token placement/movement, evaluate whether scope.bindings suffices or a separate resolve call is needed.

### 6. Delete `mergeToEvalContext` and `mergeToReadContext` from `effect-context.ts`

Remove function definitions and exports. Remove from `index.ts`/`runtime.ts` re-exports if present.

### 7. Strengthen regression coverage where scope reuse can miss updated bindings/state

If migration reveals subtle state/binding sequencing risks, add focused tests in
the existing handler test files rather than relying only on broad integration
coverage.

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify) — migrate to scope
- `packages/engine/src/kernel/effects-choice.ts` (modify) — migrate to scope-backed choice binding evaluation
- `packages/engine/src/kernel/effects-control.ts` (modify) — migrate to scope
- `packages/engine/src/kernel/effects-subset.ts` (modify) — migrate to scope
- `packages/engine/src/kernel/effects-token.ts` (modify) — migrate to scope
- `packages/engine/src/kernel/effect-context.ts` (modify) — delete `mergeToEvalContext`, `mergeToReadContext`
- `packages/engine/src/kernel/index.ts` (modify, if re-exports merge functions)
- targeted existing handler/effect-context test files, if scope migration exposes missing invariants

## Out of Scope

- Changes to `effect-dispatch.ts` scope ownership model (already wired in ticket 003).
- Changes to effects-binding.ts, effects-var.ts, effects-resource.ts, effects-reveal.ts (already migrated in ticket 003).
- Changes to `legal-moves.ts` / `enumerateParams` (ticket 005).
- Changes to `createEvalContext` (used by other subsystems, not by effect handlers — ticket 006).
- `toTraceProvenanceContext` and `toTraceEmissionContext` — these remain (they serve trace emission, not ReadContext construction).
- `resolveEffectBindings` — remains as a utility for custom binding construction.
- Performance benchmarking (measure after this ticket to validate Phase 1 impact).

## Acceptance Criteria

### Tests That Must Pass

1. Targeted handler and effect-context contract tests pass without weakening
   assertions, including any tests added for local scope mutation sites.
2. Full engine suite: `pnpm -F @ludoforge/engine test`
3. E2E tests: `pnpm -F @ludoforge/engine test:e2e`
4. Typecheck: `pnpm turbo typecheck`
5. Lint: `pnpm turbo lint`

### Invariants

1. `mergeToEvalContext` and `mergeToReadContext` do not exist in the codebase (zero grep matches across `packages/engine/src/`).
2. The final handler/eval architecture converges on the existing dispatch-owned
   scope model from ticket `003`; any local helper is only a temporary
   state/binding update aid, not a replacement architectural layer.
3. Nested scope isolation remains intact: each `applyEffectsWithBudgetState`
   invocation creates its own `MutableReadScope`.
4. Choice-specific binding-template semantics remain intact; this ticket does
   not simplify them away for convenience.
5. External contract unchanged: `applyMove(state) -> newState` remains
   immutable.
6. `resolveEffectBindings` remains available for custom binding construction
   where needed.
7. No scope references stored in closures, return values, or result objects.

## Test Plan

### New/Modified Tests

1. Use existing handler and effect-context test files, but add focused
   assertions if migration exposes uncovered state/binding sequencing
   invariants.
2. Prefer focused unit coverage for:
   - temporary scope state replacement during sequential control-flow
   - temporary scope binding replacement for reduce/subset/token filter paths
   - choice binding-template evaluation parity
3. Verify via grep that merge functions are fully removed.

### Commands

1. `pnpm -F @ludoforge/engine test` (full engine suite)
2. `pnpm -F @ludoforge/engine test:e2e` (end-to-end)
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `grep -r "mergeToEvalContext\|mergeToReadContext" packages/engine/src/` — must return zero matches.
6. `grep -r "mergeToEvalContext\|mergeToReadContext" packages/engine/test/` — must return zero matches (or only in historical comments if any).

## Outcome

- Completion date: 2026-03-28
- Actual changes:
  - Finished scope convergence in the remaining interpreted handler callers:
    `effects-choice.ts`, `effects-control.ts`, `effects-subset.ts`, and
    `effects-token.ts` now use the dispatch-owned `MutableReadScope` directly.
  - Preserved the existing architecture from ticket `003` instead of adding a
    second eval-context layer. Where handlers needed alternate temporary
    bindings or state, they now mutate `scope.state` / `scope.bindings` locally
    for the narrow synchronous evaluation site only.
  - Deleted `mergeToEvalContext` and `mergeToReadContext` from
    `packages/engine/src/kernel/effect-context.ts`. There are now zero
    production or test references to those helpers.
  - Strengthened regression coverage in:
    - `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts`
    - `packages/engine/test/unit/effects-zone-ops.test.ts`
- Deviations from original plan:
  - No new architectural abstraction was introduced. The work stayed within the
    dispatch-owned scope model because that is cleaner and more extensible than
    adding a parallel handler-local context strategy.
  - `effects-choice.ts` remained explicitly in scope and was migrated as a
    first-class part of the work because it still had a live custom
    `mergeToReadContext` caller.
- Verification results:
  - `node --test packages/engine/dist/test/unit/effects-control-flow.test.js packages/engine/dist/test/unit/effects-choice.test.js packages/engine/dist/test/unit/effects-zone-ops.test.js packages/engine/dist/test/unit/kernel/evaluate-subset.test.js packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine test:e2e`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `rg "mergeToEvalContext|mergeToReadContext" packages/engine/src packages/engine/test` returned zero matches
