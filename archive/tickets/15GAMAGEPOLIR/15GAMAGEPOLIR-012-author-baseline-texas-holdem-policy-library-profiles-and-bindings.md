# 15GAMAGEPOLIR-012: Author Baseline Texas Hold'em Policy Library, Profiles, and Bindings

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — authored Texas Hold'em data plus engine integration tests
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-008-integrate-policyagent-with-traces-and-diagnostics.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-017-add-explicit-policy-visibility-ownership-for-preview-safe-runtime-surfaces.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-014-make-policy-metric-refs-executable-through-generic-runtime-contracts.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-015-align-candidate-param-refs-with-concrete-move-contracts.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-016-extend-candidate-param-contract-with-static-choice-binding-shape-support.md

## Problem

Spec 15 explicitly uses Texas Hold'em to prove the same policy runtime works under imperfect information. Until Hold'em authors a baseline policy pack without hidden-info leakage, the visibility contract is not really validated.

## Assumption Reassessment (2026-03-19)

1. Texas Hold'em already has the canonical authored game spec and supporting markdown assets under `data/games/texas-holdem*`.
2. Texas Hold'em does not yet author any `agents` section or imported policy fragment. The clean production-spec boundary is therefore the same pattern used for FITL: add a dedicated imported Texas policy fragment instead of burying bot semantics in `40-content-data-assets.md`.
3. The old preview-runtime blocker language is stale. Archived tickets 014, 015, 016, and 017 already landed the generic `metric.*`, `candidate.param.*`, and compiled visibility/preview ownership contracts this ticket can build on.
4. The current hidden-information invariant is already covered generically in `packages/engine/test/unit/property/policy-visibility.test.ts`; there is still no production Texas policy integration test.
5. Corrected scope: author a minimal Texas baseline policy pack that proves the generic runtime works on an imperfect-information production spec, without pretending this ticket should also solve poker-strength modeling.
6. The Texas production `GameDef` currently resolves only the canonical seat id `neutral`, while `PolicyAgent` still resolves authored bindings via `def.seats[playerId]`. That means a symmetric production game cannot currently apply one authored baseline binding to every runtime player. This is a generic engine boundary bug exposed by Texas, and the clean fix belongs in scope.
7. The proposed heuristic list in the old ticket is too ambitious for the current architecture. Adding ad hoc hand-strength or position-pressure proxies would expand game-specific authored surface area without first proving they are the right durable contract. This ticket should start from already-owned generic/public surfaces and only add new authored policy-visible inputs when they are clearly justified.

## Architecture Check

1. A dedicated `data/games/texas-holdem/92-agents.md` import is cleaner than modifying `40-content-data-assets.md` or the root entrypoint file with large inline policy payloads.
2. A minimal baseline that uses existing generic/public surfaces is architecturally better than inventing poker-specific proxies prematurely. The first job here is to prove the authored-policy boundary on a real imperfect-information production game, not to encode sophisticated poker evaluation heuristics.
3. The runtime seat-binding boundary should support symmetric games cleanly. A generic canonical-seat resolver that can apply a single `neutral` binding across runtime players is better architecture than profile overrides in tests or Texas-specific branching.
4. If future poker quality work needs better signals, the clean path is to add generic authored/compiled policy-visible surfaces deliberately in a separate ticket, not to smuggle hidden-card logic or one-off aliases into the runtime.
5. No special-case runtime path should expose opponent hole cards, undealt board cards, or deck order.

## What to Change

### 1. Add a dedicated Texas authored policy fragment

Create a Texas-specific imported `agents` fragment and wire it into the production entrypoint.

### 2. Author a minimal baseline profile over existing generic/public surfaces

Add a small baseline library and seat bindings that choose among fold/check/call/raise/all-in using the generic policy runtime. The binding should target the canonical symmetric seat contract cleanly rather than relying on per-test profile overrides. Prefer surfaces already owned by the generic contract, such as:

- `candidate.actionId`
- `candidate.isPass` when relevant
- public `var.global.*` / `var.seat.self.*`
- public `victory.currentMargin.*` / `preview.victory.currentMargin.*` only if they improve the baseline without introducing speculative poker-specific semantics

Do not add hand-strength, pot-odds, or board-texture proxies in this ticket unless the implementation proves they are necessary and cleanly expressible through existing generic contracts.

### 3. Add production Texas policy integration coverage

Prove the authored Texas policy pack compiles, binds seats, selects only legal moves, and remains invariant when acting-seat-invisible hidden cards change while the visible decision surface stays fixed.

### 4. Fix generic policy seat resolution for symmetric games

Update the shared policy seat-resolution path so authored bindings can apply to production games whose canonical seat catalog is intentionally symmetric (for example a single `neutral` seat reused across runtime players).

## File List

- `data/games/texas-holdem.game-spec.md` (modify import list)
- `data/games/texas-holdem/92-agents.md` (new)
- `packages/engine/src/agents/policy-eval.ts` (modify generic seat-resolution path if required)
- `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` (new)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify for symmetric-seat binding coverage)
- `packages/engine/test/unit/property/policy-visibility.test.ts` (modify only if existing generic invariance coverage needs a stronger Texas-adjacent edge case)
- `packages/engine/test/fixtures/trace/texas-policy-baseline.golden.json` (only if fixed-seed trace assertions genuinely need a contract fixture)

## Out of Scope

- poker-strength tuning beyond a minimal baseline
- new poker-specific derived metrics/proxies unless they are clearly required and cleanly justified by the generic architecture
- any access to hidden cards, deck order, or undealt public cards through policy refs
- runner/CLI UI work
- FITL authored policy work
- benchmark threshold gating

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` proves Texas Hold'em compiles authored policy data and chooses only legal moves through the generic `PolicyAgent`.
2. `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` proves states that differ only in acting-seat-invisible hidden data do not change the selected move for the same visible decision surface and seed.
3. `packages/engine/test/unit/agents/policy-agent.test.ts` proves authored policy bindings can resolve correctly for symmetric games that expose only the canonical seat id `neutral`.
4. `packages/engine/test/integration/parse-validate-full-spec.test.ts` or equivalent Texas production-fixture coverage continues to pass with the new imported policy fragment.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Hold'em policies rely only on actor-safe generic policy refs and do not inspect hidden cards, deck order, or undealt board state.
2. Symmetric-game authored policy bindings must resolve through one generic seat-resolution rule, not through Texas-specific branching or profile overrides.
3. `data/games/texas-holdem/visual-config.yaml` remains presentation-only and untouched for policy semantics.
4. The same generic policy runtime serves both perfect-information and imperfect-information authored games.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` — authored Hold'em policy compile/run and visibility invariance coverage.
2. `packages/engine/test/unit/agents/policy-agent.test.ts` — symmetric-seat binding coverage for canonical `neutral` bindings.
3. `packages/engine/test/integration/parse-validate-full-spec.test.ts` or existing Texas production-spec integration coverage — updated only if the new `92-agents.md` import changes the expected production compile surface.
4. `packages/engine/test/fixtures/trace/texas-policy-baseline.golden.json` — fixed-seed trace baseline only if reasoning assertions truly need a durable artifact.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What actually changed:
  - added a dedicated Texas authored policy fragment at `data/games/texas-holdem/92-agents.md` and imported it from the production entrypoint
  - authored a minimal symmetric baseline profile bound to `neutral`, using only generic candidate refs (`candidate.actionId` and `candidate.param.raiseAmount`) rather than new poker-specific metrics or hidden-info-adjacent proxies
  - fixed the generic policy binding boundary in `packages/engine/src/agents/policy-eval.ts` so symmetric production games with a single canonical seat can reuse one authored binding across runtime players
  - added production Texas policy integration coverage for compilation, legality, hidden-info invariance, and fixed-seed self-play
  - strengthened `packages/engine/test/unit/agents/policy-agent.test.ts` with explicit symmetric-seat binding coverage
- Deviations from original plan:
  - did not modify `40-content-data-assets.md`; the cleaner architecture was a dedicated imported `92-agents.md` fragment
  - did not add hand-strength, pot-odds, stack-pressure, or position-pressure proxies, because the current durable architecture was better served by proving the authored policy boundary first with existing generic refs
  - did not add a trace golden fixture; the behavior is fully covered by compile, legality, invariance, and self-play assertions without introducing a low-signal snapshot artifact
  - the generic symmetric-seat fix covers binding resolution only; richer self-scoped policy surfaces for one-seat symmetric games still deserve a separate architectural ticket if we want policies to reason about per-player state beyond seat-agnostic refs
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `node --test packages/engine/dist/test/unit/agents/policy-agent.test.js packages/engine/dist/test/integration/texas-holdem-policy-agent.test.js packages/engine/dist/test/integration/parse-validate-full-spec.test.js` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm -F @ludoforge/engine lint` passed
  - `pnpm -F @ludoforge/engine test:e2e` passed
  - `pnpm run check:ticket-deps` passed
