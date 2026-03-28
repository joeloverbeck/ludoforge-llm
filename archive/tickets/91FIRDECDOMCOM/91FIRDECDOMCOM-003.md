# 91FIRDECDOMCOM-003: Runtime-cached first-decision domains verification and gap closure

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — tighten tests and only make targeted code changes if a verified gap remains
**Deps**: archive/tickets/91FIRDECDOMCOM/91FIRDECDOMCOM-002.md

## Problem

Ticket 002's compiler work is already present in the codebase, but this ticket's
original implementation plan no longer matches reality. The current code already:
1. Compiles first-decision domains via `compileGameDefFirstDecisionDomains`.
2. Stores the result on `GameDefRuntime.firstDecisionDomains`.
3. Uses those compiled results in `legal-moves.ts` for plain-action feasibility
   probing and pipeline admission filtering.
4. Leaves event-card admission on the canonical interpreter path.

The remaining problem is not missing infrastructure; it is verifying that the
current architecture is the right one, aligning the ticket with the code, and
closing any remaining test/documentation gaps without reintroducing an inferior
cache design.

## Assumption Reassessment (2026-03-28)

1. The codebase does NOT use a new module-level `WeakMap<GameDef, ...>` cache
   for first-decision domains. Instead, `createGameDefRuntime` eagerly stores
   `firstDecisionDomains` on `GameDefRuntime`.
2. `legal-moves.ts` still calls
   `isMoveDecisionSequenceAdmittedForLegalMove` at the relevant plain-action,
   event-card, pipeline, and free-operation admission sites. Compiled
   first-decision checks are additive guards, not replacements.
3. Event-card admission checks still fall through to the interpreter, which is
   correct for the current architecture because event effects are resolved from
   runtime card state.
4. `GameDefRuntime` HAS already been modified in the existing implementation.
   Reversing that to a hidden WeakMap would be a regression in clarity.
5. `runtime` and `firstDecisionDomains` are already threaded through the
   relevant legal-move enumeration paths.

## Architecture Check

1. The current architecture is better than the original WeakMap proposal.
   `GameDefRuntime` is the repository's explicit home for immutable,
   definition-derived runtime accelerators. Keeping `firstDecisionDomains`
   there makes dataflow visible, testable, and consistent with the existing
   adjacency graph, runtime table index, zobrist table, and compiled lifecycle
   effects. A hidden module cache would add global state with less explicit
   ownership.
2. Integration remains a GUARD pattern: compiled results may cheaply reject
   obviously empty first decisions, but canonical admission still flows through
   `isMoveDecisionSequenceAdmittedForLegalMove` when needed.
3. The current design aligns with Foundations:
   `GameDefRuntime` contains immutable definition-derived artifacts, no hot-path
   move/state objects are extended, and unsupported cases continue through the
   normal interpreter path without compatibility shims.

## What to Change

### 1. Preserve the runtime-owned compilation path

Do not introduce `first-decision-cache.ts` or move this data into a hidden
module-level `WeakMap`. The existing `first-decision-compiler.ts` plus
`GameDefRuntime.firstDecisionDomains` is the intended architecture unless a
concrete flaw is proven.

### 2. Reassess `legal-moves.ts` against the actual integration points

Confirm and keep the current architecture:
- Plain-action feasibility probes may reject moves early via
  `firstDecisionDomains.byActionId`.
- Pipeline template admission may reject actions early via
  `firstDecisionDomains.byPipelineProfileId`.
- Event-card admission remains interpreter-backed.
- Free-operation derived-state probing remains interpreter-backed unless a
  future design proves a safe compiled-domain path for derived states.

Only edit `legal-moves.ts` if the audit reveals a real gap, such as a missing
comment, missing runtime threading, or an incorrect guard site.

### 3. Strengthen tests around the chosen architecture

Add or tighten tests so they prove the current design rather than the obsolete
WeakMap plan. Focus on:
- runtime compilation ownership,
- early rejection behavior for plain actions and pipelines,
- interpreter fallback for unsupported/event paths,
- any invariant exposed during the audit.

## Files to Touch

- `packages/engine/src/kernel/gamedef-runtime.ts` (only if audit finds a real gap)
- `packages/engine/src/kernel/legal-moves.ts` (only if audit finds a real gap)
- `packages/engine/test/unit/kernel/first-decision-compiler.test.ts` (likely)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (likely)

## Out of Scope

- Replacing the current runtime-owned architecture with a module-level cache.
- Event-card first-decision compilation or per-card caching.
- Reworking `isMoveDecisionSequenceAdmittedForLegalMove`; it remains the
  canonical fallback.
- Broad refactors of unrelated kernel modules.
- Inventing single-decision bypass behavior that the current implementation
  does not need unless a measured, tested win justifies it in a separate ticket.

## Acceptance Criteria

### Tests That Must Pass

1. Ticket assumptions are corrected to match the current codebase before any
   implementation work proceeds.
2. The ticket explicitly records that `GameDefRuntime.firstDecisionDomains` is
   the current cache owner and that this is preferable to the original WeakMap
   proposal.
3. Tests prove that `createGameDefRuntime(def)` precomputes
   `firstDecisionDomains` and that `legalMoves(..., runtime)` uses those
   compiled results for plain-action and pipeline rejection.
4. Tests prove that unsupported or runtime-resolved cases still fall through to
   the canonical interpreter path without regression.
5. Event-card admission remains interpreter-backed and covered by tests or
   code-level assertions.
6. Relevant engine tests, type checks, and lint pass.

### Invariants

1. No new fields are added to hot-path state or move objects.
2. The guard pattern remains additive — if compiled evaluation is absent,
   unsupported, or throws, the canonical interpreter path still governs.
3. `GameDefRuntime` remains the explicit owner of first-decision runtime
   compilation unless a future spec intentionally redesigns runtime ownership.
4. This ticket does not introduce backwards-compatibility aliases or duplicate
   cache paths.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/first-decision-compiler.test.ts` —
   runtime-compilation behavior and unsupported-pattern coverage as needed.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` —
   targeted early-rejection and interpreter-fallback tests for the actual
   runtime-owned architecture.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - Reassessed the ticket against the live codebase and corrected its
    assumptions and scope.
  - Kept the existing runtime-owned architecture:
    `GameDefRuntime.firstDecisionDomains` remains the cache owner instead of
    introducing a new module-level WeakMap cache.
  - Added a clarifying comment in `legal-moves.ts` documenting why event-card
    admission remains interpreter-backed.
  - Added tests covering runtime precomputation ownership and guarding that the
    event path does not start using compiled first-decision rejection.
- Deviations from original plan:
  - Did NOT create `first-decision-cache.ts`.
  - Did NOT remove `firstDecisionDomains` from `GameDefRuntime`.
  - Did NOT re-implement plain/pipeline integration, because it already existed
    and the existing architecture is cleaner and more explicit than the
    original ticket proposal.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
