# 89SCOMUTEXECON-006: Audit and convert remaining createEvalContext hot-path sites (Phase 3)

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: Yes — multiple kernel files (scope determined by audit)
**Deps**: archive/tickets/89SCOMUTEXECON/89SCOMUTEXECON-004-finish-scope-convergence-in-complex-handlers.md, archive/tickets/89SCOMUTEXECON/89SCOMUTEXECON-005.md

## Problem

After Phases 1-2, `createEvalContext` still has **21 live callers** in
`packages/engine/src/` on top of its own constructor definition:

- `19` kernel callers
- `2` agent-surface callers (`agents/evaluate-state.ts`, `agents/policy-surface.ts`)

The remaining kernel callers are not uniformly good candidates for
`MutableReadScope`. Some sit inside true hot loops and rebuild eval contexts
repeatedly. Others construct one eval context per top-level operation and are
already clean enough that further convergence would add indirection without
meaningful architectural gain.

This ticket therefore audits the remaining callers and converts only the sites
where reuse is both:

1. architecturally cleaner than the current shape, and
2. materially beneficial on a loop-heavy path.

## Assumption Reassessment (2026-03-28)

1. The live `createEvalContext` callers are:
   `terminal.ts`, `trigger-dispatch.ts`, `effect-compiler-codegen.ts`,
   `turn-flow-eligibility.ts` (2), `free-operation-grant-authorization.ts` (2),
   `event-execution.ts` (2), `apply-move.ts` (2), `action-executor.ts`,
   `condition-annotator.ts`, `space-marker-rules.ts`,
   `action-applicability-preflight.ts`, `action-actor.ts`,
   `validate-gamedef-structure.ts`, `effects-turn-flow.ts`, `map-model.ts`,
   plus `agents/evaluate-state.ts` and `agents/policy-surface.ts`.
   This differs from the older candidate list and from the original “kernel
   only” assumption.
2. `createExecutionEffectContext` callers are not audit targets here. They build
   full execution/effect-dispatch context and are governed by the already-landed
   Phase 1-2 architecture.
3. Ticket `003` did not eliminate all handler-local eval context rebuilding:
   `effects-turn-flow.ts` still reconstructs a `ReadContext` inside an effect
   handler even though a `MutableReadScope` is already threaded through the
   registry. That is a valid cleanup target for this ticket.
4. The compiled path is partially aligned with the scoped model, but
   `effect-compiler-codegen.ts` still uses `createEvalContext` in
   `createCompiledEvalContext`. Changing that path now would require wider
   compiled-runtime signature work than this ticket originally described, so it
   should be treated as audited-but-deferred unless a clearly local fix emerges.
5. The current test surface already includes Spec 89 architecture guards:
   `effect-context-construction-contract.test.ts` covers `MutableReadScope`
   layout/update invariants, and `legal-moves.test.ts` already enforces the
   earlier local mutable-scope migration. The previous “no new tests expected”
   assumption is inaccurate.
6. “Hot path” must be justified by control-flow shape, not filename. The main
   high-value candidates are:
   - repeated per-trigger eval context construction in `trigger-dispatch.ts`
   - repeated per-zone/probe eval context construction in
     `free-operation-grant-authorization.ts`
   - redundant handler-local reconstruction in `effects-turn-flow.ts`

## Architecture Check

1. Each candidate site must be audited for: (a) call frequency (hot vs cold), (b) whether the context escapes the synchronous call, (c) whether a mutable scope is safe.
2. Cold-path sites (called once per move or less) have negligible optimization
   value — the spec explicitly says to leave them unchanged.
3. Game-agnostic: all candidate sites are in generic kernel code.
4. No backwards-compatibility: converted sites stop calling
   `createEvalContext`; if all callers are gone, delete `createEvalContext`
   (Foundation 9).
5. Architectural caution from ticket `002`: do not assume every hot site should
   grow a shared mutable-scope abstraction. Some sites may be better served by a
   tiny local fixed-shape helper, and that can be the cleaner end state.
6. `effect-compiler-codegen.ts` is now partly aligned with the dispatch-owned
   scope model after ticket `003`, but it still contains `createEvalContext`
   usage for compiled eval helpers. This ticket should treat that as an audit
   candidate rather than assuming all compiled-path work is out of scope.
7. The cleanest end state is not “eliminate `createEvalContext` everywhere”.
   The cleanest end state is:
   - shared mutable scope where a scope already exists and stays synchronous
   - tiny local fixed-shape eval objects where loops need reuse outside effect dispatch
   - plain `createEvalContext` where the site is single-shot and already clear

## Architectural Note

The audit must explicitly compare:

1. Replacing a site with `MutableReadScope`.
2. Replacing a site with a smaller local fixed-shape eval helper.
3. Leaving the site on `createEvalContext`.

Recommendation: prefer the smallest clean abstraction per site, not blanket convergence on `MutableReadScope`.

## What to Change

### 1. Audit all `createEvalContext` call sites

For each call site, document:
- File and line number
- Call frequency (per-game, per-turn, per-move, per-effect)
- Whether context escapes (stored, returned, passed to callback)
- Recommendation: convert to MutableReadScope or leave as-is
- Alternative, when cleaner: convert to a local fixed-shape helper rather than `MutableReadScope`

### 2. Convert only the hot-path sites that become cleaner

Primary implementation targets from the audit:

- `packages/engine/src/kernel/effects-turn-flow.ts`
  - stop rebuilding a handler-local eval context
  - reuse the registry-threaded mutable read scope already supplied to the handler
- `packages/engine/src/kernel/trigger-dispatch.ts`
  - replace per-trigger `createEvalContext` construction with a local fixed-shape
    eval object reused across the trigger loop
- `packages/engine/src/kernel/free-operation-grant-authorization.ts`
  - replace repeated per-zone/per-probe `createEvalContext` construction with a
    local fixed-shape eval object reused across probe callbacks

Secondary audit outcomes:

- `turn-flow-eligibility.ts` already creates one eval context per top-level
  helper call and reuses it across the relevant grant loop. Keep the current
  architecture unless a very small fixed-shape helper improves clarity.
- `apply-move.ts`, `action-applicability-preflight.ts`, `action-executor.ts`,
  `action-actor.ts`, `event-execution.ts`, `terminal.ts`,
  `condition-annotator.ts`, `validate-gamedef-structure.ts`, `map-model.ts`,
  and the agent callers are single-shot or cold enough that forced convergence
  would not improve the architecture.

### 3. Leave cold-path sites unchanged

Leave single-shot or cold-path sites on `createEvalContext` when reuse would add
ceremony without reducing a meaningful loop allocation pattern.

### 4. Clean up `createEvalContext` if zero callers remain

If all callers have been converted or are covered by MutableReadScope, delete `createEvalContext` from `eval-context.ts`.

## Files to Touch

Expected implementation files:

- `packages/engine/src/kernel/effects-turn-flow.ts`
- `packages/engine/src/kernel/trigger-dispatch.ts`
- `packages/engine/src/kernel/free-operation-grant-authorization.ts`
- `packages/engine/test/unit/kernel/...` source-guard tests to lock the architecture

Audited and expected to remain unchanged for this ticket:

- `packages/engine/src/kernel/apply-move.ts`
- `packages/engine/src/kernel/action-applicability-preflight.ts`
- `packages/engine/src/kernel/action-executor.ts`
- `packages/engine/src/kernel/action-actor.ts`
- `packages/engine/src/kernel/turn-flow-eligibility.ts`
- `packages/engine/src/kernel/event-execution.ts`
- `packages/engine/src/kernel/terminal.ts`
- `packages/engine/src/kernel/condition-annotator.ts`
- `packages/engine/src/kernel/space-marker-rules.ts`
- `packages/engine/src/kernel/validate-gamedef-structure.ts`
- `packages/engine/src/kernel/map-model.ts`
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (audited, deferred)
- `packages/engine/src/kernel/eval-context.ts` (no deletion expected this phase)
- `packages/engine/src/agents/evaluate-state.ts`
- `packages/engine/src/agents/policy-surface.ts`

## Out of Scope

- Changes to `MutableReadScope` type or factory functions (finalized in ticket 002).
- Changes to effect dispatch or effect handlers (finalized in tickets 003-004).
- Changes to `legal-moves.ts` / `enumerateParams` (finalized in ticket 005).
- Broad compiled-runtime signature changes just to remove
  `effect-compiler-codegen.ts`'s remaining helper-local `createEvalContext`.
- Changes to interpreted effect dispatch or handler signatures (finalized in
  tickets 003-004).

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests pass without weakening assertions.
2. FITL production spec full pipeline (compile → initial state → legal moves → apply moves → terminal check).
3. Texas Hold'em full pipeline.
4. Determinism tests: same seed + same actions = identical Zobrist hash.
5. Full engine test suite: `pnpm -F @ludoforge/engine test`
6. E2E tests: `pnpm -F @ludoforge/engine test:e2e`
7. Typecheck: `pnpm turbo typecheck`

### Invariants

1. `effects-turn-flow.ts` reuses the threaded mutable read scope instead of
   reconstructing a handler-local eval context.
2. `trigger-dispatch.ts` and `free-operation-grant-authorization.ts` stop
   rebuilding eval contexts inside their inner loops and instead use the
   smallest local fixed-shape reuse helper that keeps the code clear.
3. Single-shot and cold-path callers remain on `createEvalContext`, and the
   ticket documents why.
4. No mutable scope or local reusable eval object escapes its synchronous call
   boundary.
5. External API unchanged across all affected subsystems.
6. Determinism preserved: same inputs = same outputs.

## Test Plan

### New/Modified Tests

1. Add or strengthen source-guard tests for the converted hot-path files so the
   architecture does not regress.
2. Keep the existing `MutableReadScope` construction/update contract tests
   passing.
3. Keep the existing functional tests that exercise trigger dispatch, grant
   authorization, turn-flow, and apply-move behavior passing.

### Commands

1. `grep -rn "createEvalContext" packages/engine/src/` — baseline count before changes.
2. `pnpm -F @ludoforge/engine test` (full engine suite)
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
6. `grep -rn "createEvalContext" packages/engine/src/` — post-change count (expected to drop, but not to zero this phase).

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - corrected the ticket assumptions and narrowed the implementation scope to the three loop-heavy sites where reuse is clearly cleaner
  - `effects-turn-flow.ts` now reuses the threaded mutable read scope for `grantFreeOperation`, preserving raw cursor bindings via `updateReadScopeRaw`
  - `trigger-dispatch.ts` now reuses one local fixed-shape eval object across the trigger loop instead of rebuilding a `ReadContext` per trigger
  - `free-operation-grant-authorization.ts` now reuses one local fixed-shape eval object and one collector-backed runtime resource object across zone-filter probe evaluation
  - added a source-guard test to keep those hot paths off per-iteration `createEvalContext` rebuilding
- Deviations from original plan:
  - did not touch single-shot callers such as `apply-move.ts`, `action-applicability-preflight.ts`, `action-executor.ts`, `action-actor.ts`, `event-execution.ts`, `terminal.ts`, `condition-annotator.ts`, `validate-gamedef-structure.ts`, or `map-model.ts` because forced convergence there would add ceremony without improving the architecture
  - audited `effect-compiler-codegen.ts` and deferred it; removing its helper-local `createEvalContext` still wants a broader compiled-runtime redesign than this ticket justified
  - `createEvalContext` was not deleted this phase; live caller count dropped from 21 to 17 plus the constructor definition
- Verification results:
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine test:e2e` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
