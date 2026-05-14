# 171VISSEQPROJ-003: New regression tests for visible-sequence projection

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/171VISSEQPROJ-001.md`

## Problem

The spec 170 integration test (`partial-visibility-fitl-coup-distance.test.ts`) used `withVisibleCards` to overwrite `played:none` with a single synthetic card token — it never exercised the production accumulating lifecycle, which is exactly why the 138/138 coverage gap shipped undetected. Spec 171 §8.2 mandates two new tests that close this gap by exercising the real execution path and the structural property that makes the trap impossible:

- `partial-visibility-fitl-production-flow.test.ts` — drives the real card lifecycle so `played:none` accumulates, then asserts the resolver still reaches `lookahead:none`. This is the linchpin regression test.
- `partial-visibility-source-take-cap.test.ts` — proves a source's `take` cap bounds its contribution regardless of zone length, so accumulated public history can never starve a later source.

These are additive (they break nothing), so they split cleanly from the `171VISSEQPROJ-001` atomic cut.

## Assumption Reassessment (2026-05-14)

1. `applyTurnFlowInitialReveal` and `applyTurnFlowCardBoundary` in `packages/engine/src/kernel/turn-flow-lifecycle.ts` accumulate cards on `played:none` when `discardZone === played` (the `else` branch at ~lines 439-441) — confirmed this session. This ticket does not modify the lifecycle.
2. `getFitlProductionFixture()` (used by `partial-visibility-fitl-coup-distance.test.ts` via `../helpers/production-spec-helpers.js`) returns the compiled FITL GameDef — after `171VISSEQPROJ-001` it carries the `sources` schema and migrated FITL data. Confirmed this session.
3. Neither `partial-visibility-fitl-production-flow.test.ts` nor `partial-visibility-source-take-cap.test.ts` exists yet — confirmed (glob of `packages/engine/test/integration/`).
4. Spec §8.2 labels the production-flow test `golden-trace` and the source-take-cap test `architectural-invariant`. The production-flow test asserts a *property* ("a coup in `lookahead:none` resolves `ready: 1` regardless of `played:none` accumulation depth") rather than a byte-exact trajectory — reconcile the `// @test-class:` marker during implementation per `.claude/rules/testing.md` (architectural-invariant is the likely correct class; the spec's label is a starting point, not binding).

## Architecture Check

1. The production-flow test exercises the real `applyTurnFlowInitialReveal` + `applyTurnFlowCardBoundary` path rather than an artificial `withVisibleCards` state — this is the Foundation #16 requirement that architectural properties be proven against the execution path, not a fixture that bypasses it. It is the direct regression guard for the spec 170 gap.
2. The source-take-cap test proves the structural invariant ("accumulated public history does not starve a later source") that makes the FITL trap impossible under the `sources` schema — a property over any trajectory, not a witness of one.
3. Test-only change; no engine or game-data surface. No game-specific logic enters the engine — the FITL-flavored test lives in the test corpus, consuming the generic resolver.

## What to Change

### 1. `partial-visibility-fitl-production-flow.test.ts` (new)

Construct a FITL initial state from `getFitlProductionFixture()`; drive the real `applyTurnFlowInitialReveal` + `applyTurnFlowCardBoundary` lifecycle until `played:none` holds ≥2 cards and `lookahead:none` holds a Coup card (seed/select the deck so a coup lands in lookahead with accumulated discards beneath the played top — do NOT use `withVisibleCards`). Assert `schedule.distance.toBoundary.coupEntry.cards` resolves `ready: 1` (NOT `partial.lowerBound: 2`). Add a second case: drive to a state with no Coup in `[played top, lookahead top]` and assert `partial.lowerBound: 2`, confirming the partial path still fires when it should.

### 2. `partial-visibility-source-take-cap.test.ts` (new)

For `sources: [{ id, take: 1 }, …]` against a source zone holding N > 1 cards, assert exactly 1 card contributes to `distance` and `visibleSequenceSources[0]` records `{ availablePublic: N, taken: 1 }`. Cover the case `played:none = [nonCoupA, nonCoupB, nonCoupC]`, `lookahead:none = [coup]`, both `take: 1` → `ready: 1` — the accumulated non-coup history does not starve the later source.

### 3. Test-class markers

Each new file declares exactly one `// @test-class:` marker. Use `architectural-invariant` for `partial-visibility-source-take-cap.test.ts`; reconcile `partial-visibility-fitl-production-flow.test.ts` per Assumption 4 (`architectural-invariant` if it asserts the property over any legitimate trajectory; `convergence-witness` with a `171VISSEQPROJ` witness id only if it is inherently seed-specific).

## Files to Touch

- `packages/engine/test/integration/partial-visibility-fitl-production-flow.test.ts` (new)
- `packages/engine/test/integration/partial-visibility-source-take-cap.test.ts` (new)

## Out of Scope

- Any engine, schema, compiler, or game-data change — all covered by `archive/tickets/171VISSEQPROJ-001.md`.
- Migrating the 8 existing `partial-visibility-*` test files — covered by `archive/tickets/171VISSEQPROJ-001.md`.
- Convergence-witness tests for campaign `compositeScore` outcomes — spec §8.3 mandates none; the `fitl-arvn-agent-evolution` campaign owns any profile-quality witness.

## Acceptance Criteria

### Tests That Must Pass

1. `partial-visibility-fitl-production-flow.test.ts` — with `played:none` accumulated to ≥2 cards via the real lifecycle and a Coup in `lookahead:none`, the resolver returns `ready: 1`.
2. `partial-visibility-fitl-production-flow.test.ts` — with no Coup in `[played top, lookahead top]`, the resolver returns `partial.lowerBound: 2`.
3. `partial-visibility-source-take-cap.test.ts` — a source with `take: 1` and N > 1 cards contributes exactly 1 to `distance`; `visibleSequenceSources` records `availablePublic: N, taken: 1`; the `[nonCoup×3]` + `[coup]` case resolves `ready: 1`.
4. Existing suite: `pnpm turbo test`.

### Invariants

1. The production-flow test drives the real `turn-flow-lifecycle.ts` path — it must not call `withVisibleCards` or otherwise hand-construct `played:none`/`lookahead:none`.
2. Each new test file declares exactly one `// @test-class:` marker per `.claude/rules/testing.md`.
3. The resolver never returns an exact distance for a card beyond the composed visible sequence (no hidden-tail leak; Foundation #4).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/partial-visibility-fitl-production-flow.test.ts` — new; the regression guard for the spec 170 coverage gap, driving the real card lifecycle.
2. `packages/engine/test/integration/partial-visibility-source-take-cap.test.ts` — new; the architectural invariant that per-source `take` bounds each source's contribution.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/partial-visibility-fitl-production-flow.test.js packages/engine/dist/test/integration/partial-visibility-source-take-cap.test.js`
2. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`

## Outcome

Completion date: 2026-05-14.

What landed:

- Added `packages/engine/test/integration/partial-visibility-fitl-production-flow.test.ts`. The test selects a deterministic FITL deck order, clears the lifecycle zones, then drives the real `applyTurnFlowInitialReveal` + `applyTurnFlowCardBoundary` path. It proves accumulated `played:none` history (`availablePublic: 2`, `taken: 1`) does not starve `lookahead:none`: a Coup in lookahead resolves `ready: 1`, while no Coup in the composed visible sequence resolves `partial.lowerBound: 2`.
- Added `packages/engine/test/integration/partial-visibility-source-take-cap.test.ts`. The test proves a `take: 1` source with three public cards contributes exactly one card and records `visibleSequenceSources[0]` as `{ zoneId: 'played:none', availablePublic: 3, taken: 1 }`; it also proves a Coup beyond the composed visible sequence remains `partial.lowerBound`, not an exact hidden-tail leak.

Boundary and marker corrections:

- `partial-visibility-fitl-production-flow.test.ts` uses `// @test-class: architectural-invariant`, not `golden-trace`, because the assertion is a lifecycle/resolver property rather than a byte-exact replay fixture. This follows `.claude/rules/testing.md` and the ticket reassessment note.
- No engine, schema, compiler, GameSpecDoc, generated schema, FITL data, or cookbook change was required. Those surfaces remain owned by `archive/tickets/171VISSEQPROJ-001.md` and `archive/tickets/171VISSEQPROJ-002.md`.

Generated fallout: none. The new TypeScript tests compile into `dist/` through the normal engine build; no schema or generated JSON artifact changed.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/partial-visibility-fitl-production-flow.test.js dist/test/integration/partial-visibility-source-take-cap.test.js` — passed after the broad lanes; 4 tests passed.
- `pnpm turbo build` — passed. Cache classification: `@ludoforge/engine` and `@ludoforge/runner` rebuilt; `@ludoforge/engine-wasm` was cache-hit supplemental.
- `pnpm turbo lint` — passed. Cache classification: `@ludoforge/engine` ran; `@ludoforge/runner` was cache-hit supplemental.
- `pnpm turbo typecheck` — passed. Cache classification: engine and runner typecheck ran; engine build replay was cache-hit supplemental from the final build input.
- `pnpm turbo test` — passed. The engine default lane reported `81/81 files passed` and included both new test files; runner tests passed. Cache classification: package build prerequisites replayed from the final build inputs, while engine and runner tests ran.
- `pnpm run check:ticket-deps` — passed for 1 active ticket and 2335 archived tickets.

Command ledger:

- Test Plan command 1 was split into `pnpm -F @ludoforge/engine build` plus the package-cwd focused `pnpm -F @ludoforge/engine exec node --test dist/test/integration/partial-visibility-fitl-production-flow.test.js dist/test/integration/partial-visibility-source-take-cap.test.js`; both passed.
- Test Plan command 2 was split into `pnpm turbo build`, `pnpm turbo lint`, `pnpm turbo typecheck`, and `pnpm turbo test`; all passed.

Source-size ledger: not triggered. New test file sizes are 135 lines and 128 lines, below the repo guidance band; no existing source file grew.

Late-edit proof validity: terminal status, proof transcription, and dependency-checker transcription only; no scope, acceptance criteria, command semantics, touched-file ownership, follow-up ownership, or dependency classification changed after the final proof lanes.
