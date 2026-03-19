# 15GAMAGEPOLIR-012: Author Baseline Texas Hold'em Policy Library, Profiles, and Bindings

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — authored Texas Hold'em data plus engine integration tests
**Deps**: specs/15-gamespec-agent-policy-ir.md, tickets/15GAMAGEPOLIR-008-integrate-policyagent-with-traces-and-diagnostics.md

## Problem

Spec 15 explicitly uses Texas Hold'em to prove the same policy runtime works under imperfect information. Until Hold'em authors a baseline policy pack without hidden-info leakage, the visibility contract is not really validated.

## Assumption Reassessment (2026-03-19)

1. Texas Hold'em already has the canonical authored game spec and supporting markdown assets under `data/games/texas-holdem*`.
2. Hold'em policy authoring must rely on seat-visible proxies and mostly avoid preview where future outcomes depend on hidden cards.
3. Corrected scope: this ticket should author a minimal Hold'em policy pack that exercises the same generic runtime, not optimize poker strength or add game-specific runtime branches.

## Architecture Check

1. Authoring Hold'em heuristics as visible metrics/proxies is cleaner than allowing policy access to hidden cards or deck state.
2. This directly tests the generic visibility/preview contract in an imperfect-information game.
3. No special-case runtime path should expose opponent hole cards, undealt board cards, or deck order.

## What to Change

### 1. Author the Hold'em policy-visible metrics and features

Add baseline proxies such as:

- own hand-strength proxy
- pot-odds proxy
- stack pressure
- street phase
- position pressure

### 2. Author baseline Hold'em policy profiles and bindings

Add a minimal authored library and bindings that choose among fold/check/call/raise using the generic policy runtime.

### 3. Add integration coverage for hidden-info-safe policy execution

Prove the authored Hold'em policy pack compiles and runs without hidden-info leakage.

## File List

- `data/games/texas-holdem.game-spec.md` (modify)
- `data/games/texas-holdem/40-content-data-assets.md` (modify if authored metrics/data assets are needed)
- `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` (new)
- `packages/engine/test/fixtures/trace/texas-policy-baseline.golden.json` (new if needed)

## Out of Scope

- poker-strength tuning beyond a minimal baseline
- any access to hidden cards, deck order, or undealt public cards through policy refs
- runner/CLI UI work
- FITL authored policy work
- benchmark threshold gating

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` proves Texas Hold'em compiles authored policy data and chooses only legal moves through the generic `PolicyAgent`.
2. `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` proves states that differ only in acting-seat-invisible hidden data do not change the selected move for the same visible decision surface and seed.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Hold'em policies rely only on seat-visible proxies and generic policy refs.
2. `data/games/texas-holdem/visual-config.yaml` remains presentation-only and untouched for policy semantics.
3. The same generic policy runtime serves both perfect-information and imperfect-information authored games.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` — authored Hold'em policy compile/run and visibility invariance coverage.
2. `packages/engine/test/fixtures/trace/texas-policy-baseline.golden.json` — fixed-seed trace baseline if needed for reasoning assertions.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:e2e`
4. `pnpm run check:ticket-deps`
