# FITLSEC2SCEDEC-001: Generic Runtime Setup Materialization for Scenario Deck Composition

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium  
**Engine Changes**: Compiler + kernel + tests  
**Dependencies**: `specs/44-fitl-section2-scenario-deck-and-pivotal-tracking.md`, `reports/fire-in-the-lake-rules-section-2.md`

## Original Assumption and Discrepancy

This ticket originally assumed a data-only fix (`excludedCardIds` in FITL Short scenario) was sufficient.

That assumption was incomplete once we validated behavior against runtime and tests:

1. `deckComposition` existed in data/schema, but runtime setup did not generically materialize deck pools/piles from that structure.
2. A data-only exclusion list cannot guarantee generic behavior for future games/scenarios.
3. Existing legal-move probing for event branches could raise missing-binding runtime errors before option-matrix filtering, which surfaced during hard integration testing.

Because the program goal is game-agnostic `GameDef` + simulator with game-specific data confined to `GameSpecDoc`, this ticket scope was expanded to implement a generic runtime materialization path rather than FITL-only patches.

## Updated Scope

1. Keep the FITL Short data fix (`excludedCardIds`) in `GameSpecDoc`.
2. Implement generic compiler-side setup materialization for scenario `deckComposition`:
   1. Resolve selected scenario + event deck.
   2. Validate include/exclude filters and counts.
   3. Resolve a declared materialization strategy and execute strategy-specific setup synthesis.
   4. Synthesize/setup card tokens and per-pile composition at setup time.
   4. Avoid hardcoded FITL rules in kernel/runtime.
3. Harden legal move enumeration to avoid false runtime failures when probing matrix-disallowed event branches.
4. Add/strengthen tests for the new invariants.

## Architecture Decision

Implemented approach is more robust and extensible than the prior architecture:

1. Moves scenario deck construction into generic compiler/setup effects driven by `GameSpecDoc`.
2. Removes reliance on external/manual deck preparation assumptions.
3. Preserves game-agnostic runtime: no FITL-specific branches in kernel/compiler logic.
4. Enables other board/card games to describe scenario deck construction declaratively and execute immediately in simulator.

## Implemented Changes

1. Data
   1. `data/games/fire-in-the-lake/40-content-data-assets.md`
   2. Added Short scenario `deckComposition.excludedCardIds` = `['card-121', 'card-122', 'card-123', 'card-124', 'card-129']`.
   3. Added explicit `deckComposition.materializationStrategy: pile-coup-mix-v1` for Full/Short/Medium scenarios.
2. Schema + type contract hardening
   1. `packages/engine/src/kernel/schemas-gamespec.ts`
   2. `packages/engine/src/kernel/types-events.ts`
   3. Made `deckComposition.materializationStrategy` required (no implicit alias/default contract in schema).
2. Compiler data derivation
   1. `packages/engine/src/cnl/compile-data-assets.ts`
   2. Exposes selected scenario `deckComposition` metadata to compiler core.
3. Compiler core materialization
   1. `packages/engine/src/cnl/compiler-core.ts`
   2. Ensures a card token type exists for scenario deck materialization (reuses existing compatible type or synthesizes `__eventCard*`).
   3. Builds generic setup effects to:
      1. filter include/exclude card sets,
      2. partition event vs coup cards,
      3. shuffle pools,
      4. build pile-constrained mixed piles,
      5. move piles into configured draw zone.
   4. Creates synthetic hidden aux zones for pool/work staging.
   5. Adds diagnostics for unknown cards, duplicate ids, conflicting include/exclude ids, ambiguous/missing event deck selection, unknown strategy ids, and insufficient event/coup counts.
4. Legal move stability hardening
   1. `packages/engine/src/kernel/legal-moves.ts`
   2. Applies option-matrix filtering before event decision-sequence probing.
   3. Defers missing-binding errors in event decision-sequence probing for matrix-disallowed branches.
   4. `packages/engine/src/kernel/missing-binding-policy.ts`
   5. Adds `'legalMoves.eventDecisionSequence'` defer policy context.
5. Test helper determinism update
   1. `packages/engine/test/helpers/isolated-state-helpers.ts`
   2. Resets isolated-state RNG to seed baseline after initial-state setup so tests remain deterministic despite setup-time deck shuffling.

## Verification

1. `pnpm -F @ludoforge/engine test` ✅
2. `pnpm turbo build` ✅
3. `pnpm turbo test` ✅
4. `pnpm turbo lint` ✅

## Outcome

- Completion date: 2026-02-23
- Actually changed vs originally planned:
  - Originally planned: data-only Short scenario exclusion list.
  - Actually delivered: data fix plus fully generic compiler/runtime setup materialization for scenario deck composition, explicit strategy contract (`materializationStrategy`), generic diagnostics, legal-move probing hardening, and deterministic test helper update.
- Why deviation was necessary:
  - Data-only changes did not satisfy long-term architecture goals for generic `GameSpecDoc`-driven setup materialization.
  - Hard integration tests exposed missing generic runtime behavior and a legal-move probing robustness gap.
- Result:
  - Scenario deck setup is now represented and executed via game-agnostic compiler/runtime behavior, driven by declarative `GameSpecDoc` data, with stronger validation and test coverage.
