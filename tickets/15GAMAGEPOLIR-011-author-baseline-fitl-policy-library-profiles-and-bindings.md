# 15GAMAGEPOLIR-011: Author Baseline FITL Policy Library, Profiles, and Bindings

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — authored FITL data plus engine integration tests
**Deps**: specs/15-gamespec-agent-policy-ir.md, docs/fitl-event-authoring-cookbook.md, tickets/15GAMAGEPOLIR-008-integrate-policyagent-with-traces-and-diagnostics.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-014-make-policy-metric-refs-executable-through-generic-runtime-contracts.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-015-align-candidate-param-refs-with-concrete-move-contracts.md, tickets/15GAMAGEPOLIR-016-add-shared-move-param-cardinality-contract-for-policy-candidate-refs.md

## Problem

Spec 15 is not complete until a real asymmetric game authors seat-bound policies through `GameSpecDoc` rather than engine branches. Fire in the Lake is the required proving ground for authored multi-seat policy asymmetry.

## Assumption Reassessment (2026-03-19)

1. FITL already has the canonical authored game spec and supporting markdown data files under `data/games/fire-in-the-lake*`.
2. Spec 15 requires shared library items, four seat-specific bindings, and game-specific heuristics expressed as authored metrics/vars instead of runtime branches.
3. Corrected scope: this ticket should author a minimal but complete baseline policy pack for FITL. It should not improve search depth, introduce FITL-specific runtime code, or tune for high play strength yet.
4. Any use of authored `metric.*` or `candidate.param.*` inside FITL policy logic depends on the generic prerequisite tickets that make those surfaces executable and correctly owned.
5. Archived ticket 015 completed scalar candidate-param ownership, but fixed id-list candidate-param support still depends on a stronger shared move-cardinality contract and is therefore tracked separately in ticket 016.

## Architecture Check

1. Encoding FITL heuristics as authored metrics and policy library items is cleaner than preserving specialized FITL agent code.
2. This keeps all FITL-specific behavior in authored game data and tests the generic runtime boundary directly.
3. No FITL-specific exceptions should be added to evaluator, preview, trace, or runner code.

## What to Change

### 1. Author the FITL policy-visible metrics and features

Add the minimum authored metrics/vars needed for baseline policy reasoning, such as:

- support/opposition pressure
- resource pressure
- coup timing pressure
- event/opportunity proxies

### 2. Author the FITL policy library and four seat-bound profiles

Add:

- shared parameters
- shared library items
- four faction profiles
- top-level seat bindings

### 3. Add integration coverage for FITL authored policy execution

Prove long-running authored FITL policy play does not hit runtime errors and stays inside the generic policy runtime.

## File List

- `data/games/fire-in-the-lake.game-spec.md` (modify)
- `data/games/fire-in-the-lake/40-content-data-assets.md` (modify if derived data assets are needed)
- `data/games/fire-in-the-lake/91-victory-standings.md` (modify if authored metrics need to surface here)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (new)
- `packages/engine/test/fixtures/trace/fitl-policy-baseline.golden.json` (new if needed)

## Out of Scope

- FITL-specific engine/runtime branches
- policy evolution/tuning loops
- visual-config changes
- Texas Hold'em authored policies
- benchmark regression thresholds

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` proves FITL compiles authored policy data, resolves all four seat bindings, and completes authored self-play runs without runtime errors.
2. `packages/engine/test/integration/fitl-policy-agent.test.ts` proves FITL policy execution stays on legal moves and emits policy-aware traces for a fixed seed.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. FITL-specific policy behavior is authored in game data, not hardcoded into engine logic.
2. `data/games/fire-in-the-lake/visual-config.yaml` remains presentation-only and untouched for policy semantics.
3. All four FITL seats bind through canonical authored seat ids.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` — authored FITL policy compile/run coverage.
2. `packages/engine/test/fixtures/trace/fitl-policy-baseline.golden.json` — fixed-seed reasoning/trace baseline if trace assertions need a golden.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm run check:ticket-deps`
