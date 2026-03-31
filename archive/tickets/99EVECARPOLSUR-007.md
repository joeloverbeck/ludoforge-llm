# 99EVECARPOLSUR-007: Integration and golden tests

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: 99EVECARPOLSUR-005, 99EVECARPOLSUR-006

## Problem

The full card policy surface pipeline (compile index → parse refs → resolve at runtime) needs end-to-end integration tests to prove correctness across the stack. Golden fixtures must be updated to include the `cardMetadataIndex` and updated `surfaceVisibility`. Cross-game graceful degradation (Texas Hold'em) must be verified.

## Assumption Reassessment (2026-03-31)

1. FITL production spec is compiled via `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts` — confirmed per CLAUDE.md testing requirements.
2. Texas Hold'em production spec exists at `data/games/texas-holdem/` — confirmed per CLAUDE.md.
3. Golden test fixtures for agent policy exist — need to locate the exact fixture files to update.
4. `resolveCurrentEventCardState` requires a token in the discard zone with a `cardId` prop — confirmed at `event-execution.ts:209-229`.

## Architecture Check

1. Integration tests use the production FITL spec (not synthetic fixtures) to prove the full pipeline works with real game data.
2. Cross-game test with Texas Hold'em proves engine agnosticism — no event decks means graceful no-op.
3. Golden fixtures capture the compiled shape for regression detection.

## What to Change

### 1. FITL card metadata index integration test

Compile the FITL production spec and assert:
- `gameDef.cardMetadataIndex` is defined
- It contains entries for all FITL event cards (verify count matches `eventDecks[0].cards.length`)
- A known card (e.g., card 1 "Gulf of Tonkin") has expected `deckId`, `tags`, and `metadata`

### 2. FITL active card surface resolution integration test

Set up a game state with a specific card token in the FITL event discard zone. Then:
- Resolve `activeCard.id` and assert it matches the card ID
- Resolve `activeCard.deckId` and assert it matches the deck ID
- Resolve `activeCard.hasTag.pivotal` for a pivotal card and assert `true`; for a non-pivotal card assert `false`
- Resolve `activeCard.metadata.period` and assert the correct period string

### 3. Visibility hidden test

Compile an agent profile where `activeCardIdentity` visibility is `hidden`. Assert that resolving `activeCard.id` returns `undefined` even when a card is in the discard zone.

### 4. Preview test

Resolve `preview.activeCard.id` through the preview surface path. Assert it resolves the active card from the preview state (which may differ from the current state if the preview simulates a move that changes the event deck).

### 5. Texas Hold'em no-deck graceful degradation test

Compile the Texas Hold'em production spec and assert:
- `gameDef.cardMetadataIndex` is `undefined` or has empty entries
- Resolving any `activeCard.*` ref returns `undefined`
- No errors thrown

### 6. Golden fixture updates

Update any existing golden test fixtures that snapshot the compiled `GameDef` or `AgentPolicyCatalog` to include:
- `cardMetadataIndex` on GameDef
- `activeCardIdentity`, `activeCardTag`, `activeCardMetadata` on `surfaceVisibility`

### 7. Evolution integration test (if harness exists)

If a tournament harness test exists, verify that a policy profile with event tag scoring compiles and runs without error. This may be a simple smoke test — compile a profile with `activeCard.hasTag.pivotal` in a stateFeature, run a short simulation.

## Files to Touch

- `packages/engine/test/integration/agents/` (new or modify — card surface integration tests)
- `packages/engine/test/fixtures/` (modify — golden fixture updates)
- `packages/engine/test/integration/` (modify — cross-game test with Texas Hold'em)

## Out of Scope

- FITL card tag enrichment (optional game data work)
- Event effect evaluation (Spec 100)
- Event precondition evaluation (Spec 101)
- Performance benchmarks for card resolution

## Acceptance Criteria

### Tests That Must Pass

1. FITL `cardMetadataIndex` contains entries matching all event cards.
2. `activeCard.id` resolves to correct card ID in a controlled state.
3. `activeCard.hasTag.pivotal` returns `true` for pivotal cards, `false` for non-pivotal.
4. `activeCard.metadata.period` returns the correct string value.
5. Hidden visibility suppresses all card refs to `undefined`.
6. Preview path resolves from preview state.
7. Texas Hold'em returns `undefined` for all card refs without errors.
8. Golden fixtures match expected compiled shapes.
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All integration tests use `compileProductionSpec()` — no synthetic FITL fixtures for card data.
2. Tests are deterministic — same seed, same card in discard zone, same assertions.
3. No FITL-specific logic in engine code is required for these tests to pass.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/agents/card-surface-resolution.test.ts` — FITL card resolution integration tests (identity, tags, metadata, visibility, preview)
2. `packages/engine/test/integration/agents/card-surface-cross-game.test.ts` — Texas Hold'em no-deck graceful degradation
3. `packages/engine/test/fixtures/` — updated golden fixtures

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "card-surface"` (targeted)
2. `pnpm -F @ludoforge/engine test` (full suite)
3. `pnpm turbo test` (workspace-wide)

## Outcome

- **Completion date**: 2026-03-31
- **What changed**:
  - Created `packages/engine/test/integration/card-surface-resolution.test.ts` — 11 integration tests using FITL production spec (identity, deckId, tag true/false, metadata, hidden visibility suppression, no-active-card, preview path)
  - Created `packages/engine/test/integration/card-surface-cross-game.test.ts` — 2 tests for Texas Hold'em graceful degradation (no cardMetadataIndex, all refs → undefined)
  - Fixed `packages/engine/src/cnl/validate-agents.ts` — added `activeCardIdentity`, `activeCardTag`, `activeCardMetadata` to `AGENT_VISIBILITY_SECTION_KEYS` and added validation calls (pre-existing gap from 005/006)
  - Regenerated `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` with updated catalog fingerprint
- **Deviations from plan**:
  - Test files placed in `packages/engine/test/integration/` (flat), not in an `agents/` subdirectory — matches existing integration test organization
  - Validator fix was needed (not listed in ticket) because 005/006 added visibility keys without updating the validator's known-key list
  - Evolution integration test (item 7) skipped — no tournament harness exists yet (ticket conditional: "if harness exists")
- **Verification**: 5213 engine tests pass, lint clean, typecheck clean
