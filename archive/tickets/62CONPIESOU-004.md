# 62CONPIESOU-004: Verify and harden `evalQuery` support for `prioritized`

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel tests, only if verification exposes a runtime regression
**Deps**: archive/tickets/KERQUERY/62CONPIESOU-001-prioritized-query-ast-and-recursive-infrastructure.md

## Problem

This ticket originally assumed that `evalQuery` still lacked a `prioritized` handler and that the runtime needed a tier-metadata mechanism. Those assumptions are no longer true. The handler already exists in the foundation ticket, so the remaining value here is to verify that the current implementation matches the architecture we actually want and to harden any missing edge-case coverage around that behavior.

## Assumption Reassessment (2026-03-14)

1. `evalQuery` in `packages/engine/src/kernel/eval-query.ts` already handles both `concat` and `prioritized` through the shared `evalHomogeneousRecursiveQuery(...)` helper. Confirmed.
2. The existing `prioritized` implementation currently concatenates tier results left-to-right, preserves duplicates, enforces homogeneous runtime item shape across tiers, and applies `assertWithinBounds(...)` to the combined result. Confirmed.
3. `packages/engine/test/unit/eval-query.test.ts` already contains baseline `prioritized` coverage for ordered concatenation and mixed-shape rejection. Confirmed.
4. There is no existing tier-index metadata on `QueryResult`, and no `computeTierMembership(...)` utility exists in the kernel. Confirmed.
5. `effects-choice.ts` and `legal-choices.ts` do not currently use `qualifierKey` or any tier-membership helper. Tier-aware legality remains a downstream concern for ticket 005. Confirmed.

## Architecture Check

1. The current `evalQuery` architecture is better than the original ticket proposal. Keeping `prioritized` as a pure recursive-query evaluation rule is cleaner than attaching hidden metadata to `QueryResult` items or introducing a side-channel map from this ticket.
2. `evalQuery` should stay focused on deterministic query evaluation: tier ordering, runtime-shape enforcement, and bounds enforcement. It should not start owning legality semantics that belong to `chooseN`/`legal-choices`.
3. The spec language about tagging each result with internal tier metadata is not a good fit for the current engine architecture. The better long-term design is for downstream legality to reason from the `prioritized` query AST directly, not from mutated query results or identity-based metadata.
4. Because the runtime handler already exists and matches the cleaner architecture, this ticket should not add new production code unless verification exposes an actual bug.

## Corrected Scope

### 1. Verify the existing runtime behavior

Confirm that the current `prioritized` handler:

- concatenates tier results left-to-right
- preserves duplicates
- tolerates empty-result tiers without changing overall ordering
- enforces runtime-shape homogeneity across tiers
- applies `maxQueryResults` to the combined result

### 2. Harden the missing test coverage

Add or strengthen targeted tests for the edge cases that are still under-covered:

- a `prioritized` query with an empty-result tier still returns the non-empty tiers in order
- a single-tier `prioritized` query behaves as a passthrough
- `qualifierKey` does not affect `evalQuery` output
- combined-result bounds enforcement is checked at the `prioritized` level

### 3. Do not introduce tier metadata utilities here

This ticket must not:

- add tier-index properties to `QueryResult`
- add a `computeTierMembership(...)` helper
- thread side-channel metadata through `evalQuery`

If ticket 005 needs tier-aware legality, it should derive that from the `prioritized` query structure at the legality layer.

## Files to Touch

- `tickets/62CONPIESOU-004.md` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify only if verification exposes a real defect)

## Out of Scope

- AST/type/schema work from ticket 001
- Compiler lowering from ticket 002
- Validation diagnostics from ticket 003
- Tier-aware `chooseN` legality from ticket 005
- Any `computeTierMembership` or comparable metadata utility
- Card 87 YAML changes

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` succeeds
2. `prioritized` evaluation preserves left-to-right ordering across multiple tiers
3. `prioritized` evaluation preserves duplicates
4. Empty-result tiers do not break ordering or introduce errors
5. Mixed runtime shapes across tiers still fail
6. Combined-result `maxQueryResults` enforcement still applies
7. Existing suite: `pnpm -F @ludoforge/engine test` (no regressions)

### Invariants

1. `evalQuery` return type remains `readonly QueryResult[]`
2. `prioritized` stays a pure evaluation concern in `evalQuery`, not a legality/metadata mechanism
3. `qualifierKey` remains authored query data that is ignored by `evalQuery` itself
4. No FITL-specific identifiers appear in any touched code or tests

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-query.test.ts` — add missing `prioritized` edge-case coverage for empty-result tiers, passthrough behavior, qualifier no-op behavior, and combined bounds enforcement

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint --filter=@ludoforge/engine`

## Outcome

- Outcome amended: 2026-03-14

- Completion date: 2026-03-14
- What actually changed:
  - Rewrote the ticket to match the current codebase instead of the stale implementation plan.
  - Confirmed that `prioritized` evaluation already exists in `evalQuery` through the shared recursive-query helper.
  - Added focused `evalQuery` coverage for empty-result tiers, single-tier passthrough behavior, qualifier no-op behavior, and combined-result bounds enforcement.
- Deviations from original plan:
  - Did not add a new `evalQuery` handler, because it already existed.
  - Did not add tier-index metadata or a `computeTierMembership(...)` utility, because that would push legality concerns into query evaluation and weaken the architecture.
  - Did not change production runtime code, because verification showed the current implementation is already the cleaner design for this layer.
- Verification results:
  - `pnpm turbo build --filter=@ludoforge/engine`
  - `pnpm turbo lint --filter=@ludoforge/engine`
  - `pnpm -F @ludoforge/engine test -- eval-query.test.ts`
  - `pnpm -F @ludoforge/engine test`
  - The earlier missing-module failure came from running build and test in parallel against the same `dist` tree, not from a persistent engine-suite defect.
