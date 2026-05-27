# 200PLNPRPTRC-004: Phase 4 — Extend cross-game conformance corpus with new trace field coverage and observer-safety vocabulary

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — test-suite extension only (touches `packages/engine/test/conformance/` family and the observer-safety architectural-invariant)
**Deps**: `archive/tickets/200PLNPRPTRC-001.md`, `archive/tickets/200PLNPRPTRC-002.md`, `tickets/200PLNPRPTRC-003.md`

## Problem

Spec 198 established the cross-game conformance corpus across three game families (FITL, Texas Hold'em, and the perfect-info board game from Spec 198). Phases 1–3 of Spec 200 add new trace surfaces (`roleBindingStatuses`, `decisionSurfaceMatch`, `rejectedByConstraint`, the discriminated `fallbackReason`) that need at least one golden-trace test per game family to prove the new vocabulary works generically — not just on FITL.

Additionally, the observer-safety architectural invariant from Spec 198 needs extension to cover the new vocabulary (`hiddenScope` on `roleBindingStatuses`, `partialObserverScope` on `fallbackReason`) — these reasons MUST NOT leak hidden zone / token / card ids into the trace. Foundation #4 + Spec 198's observer-safety contract apply directly.

## Assumption Reassessment (2026-05-27)

1. Spec 198 conformance corpus is archived as completed. Verify the test layout for the conformance corpus at implementation time — likely under `packages/engine/test/conformance/` or `packages/engine/test/architecture/` (per Spec 198's deliverables). Confirm the actual path structure before authoring new tests.
2. Spec 198's observer-safety architectural-invariant test is most likely at `packages/engine/test/architecture/observer-safety-invariants.test.ts` (the same file ticket 001 modifies at line 349). Verify and extend in the same file or as a sibling architectural-invariant test depending on Spec 198's organization.
3. The three game families per Spec 198 are: FITL (`data/games/fire-in-the-lake/`), Texas Hold'em (`data/games/texas-holdem/`), and the perfect-info board game (verify the third game's name and data directory at implementation time — likely something like `data/games/generic-control/` or a Spec-198-authored game).
4. Texas Hold'em's current agent profile is a flat betting heuristic (per session-context observation); plan templates are minimal. The Texas conformance test for new trace fields may need a representative scenario from the existing profile that exercises at least one role binding and microturn fallback.
5. The perfect-info board game from Spec 198 was authored as a minimal conformance game — verify that it includes at least one plan template with multiple roles so the `roleBindingStatuses` coverage test has substance.

## Architecture Check

1. **Foundation #16 (Testing as Proof)**: Game-agnosticism of the new trace fields is proven by passing the same architectural invariants across three materially-different game families. Without the cross-game tests, the new vocabulary is only proven on FITL.
2. **Foundation #1 (Engine Agnosticism)**: The new trace vocabulary (`hiddenScope`, `noSelectorMatch`, `unreachable`, `postStateProbeExhausted`, `depthCapped`, etc.) MUST work across game families without FITL-specific assumptions. The conformance corpus is the architectural proof of this.
3. **Foundation #4 (Authoritative State and Observer Views)**: The observer-safety extension asserts that `hiddenScope` and `partialObserverScope` reasons do not leak hidden zone / token / card ids — the reason is a categorical label, not the hidden id itself. The architectural invariant from Spec 198 enforces this contract.
4. **Foundation #20 (Preview Signal Integrity)**: The conformance tests prove the canonical status-with-provenance shape (introduced by Spec 199's `CompoundAvailability` and extended by Spec 200) is applicable across game families.

## What to Change

### 1. Add per-family golden-trace tests for the new fields

For each of the three game families (FITL, Texas Hold'em, perfect-info), author at least one golden-trace test asserting the new fields populate correctly:

- **FITL** (`packages/engine/test/conformance/fitl-plan-trace-completeness-golden.test.ts` — path TBD against Spec 198 convention):
  - Asserts `roleBindingStatuses` populated with at least one `ready` and one `unavailable` entry across a representative ARVN/US/NVA/VC scenario.
  - Asserts `decisionSurfaceMatch` populated for alternatives.
  - Asserts `rejectedByConstraint` populated when an ARVN Transport `reachable` or `postState` constraint rejects a candidate.
  - Asserts `fallbackReason` is structured (not free-form string) when present.
  - Mark with `// @test-class: golden-trace`.

- **Texas Hold'em** (`packages/engine/test/conformance/texas-plan-trace-completeness-golden.test.ts` — path TBD):
  - Asserts `roleBindingStatuses` populated for the Texas Hold'em profile's plan templates (even if minimal — a single fold/raise/call template with one role suffices to prove the shape works).
  - Asserts `fallbackReason` structured.
  - Hidden-information assertion: if any Texas decision involves opponent hand state, assert `hiddenScope` or `partialObserverScope` fires with no leaked card ids.
  - Mark with `// @test-class: golden-trace`.

- **Perfect-info board game** (path matches Spec 198's convention):
  - Asserts `roleBindingStatuses` populated.
  - Asserts `decisionSurfaceMatch` populated.
  - Asserts the new vocabulary does NOT spuriously fire `hiddenScope` (since perfect-info games have no hidden state).
  - Mark with `// @test-class: golden-trace`.

### 2. Extend observer-safety architectural invariant

In `packages/engine/test/architecture/observer-safety-invariants.test.ts` (extended in ticket 001 at line 349 for `roleBindingStatuses`), add assertions covering:

- `hiddenScope` reason on `roleBindingStatuses[i].status.kind === 'unavailable'` does NOT include any hidden zone / token / card id in the trace's surrounding context.
- `partialObserverScope` and `depthCapped` reasons on `PlanMicroturnFallbackReason` do NOT leak hidden state into the trace.
- Cross-family: run the invariant against FITL, Texas Hold'em, and the perfect-info game's representative seeds.

Mark the new assertions with `// @test-class: architectural-invariant`.

### 3. Cross-game conformance test runner integration

Confirm that the new per-family tests are discoverable by the existing conformance runner (per Spec 198's harness). If Spec 198 set up a centralized conformance harness, register the new tests there; otherwise, run them as standard `node --test` files under `packages/engine/test/conformance/` (or wherever Spec 198 placed the corpus).

## Files to Touch

- `packages/engine/test/architecture/observer-safety-invariants.test.ts` (modify — extend with new vocabulary coverage)
- `packages/engine/test/conformance/fitl-plan-trace-completeness-golden.test.ts` (new — path may differ; verify Spec 198's convention)
- `packages/engine/test/conformance/texas-plan-trace-completeness-golden.test.ts` (new — same)
- `packages/engine/test/conformance/<perfect-info-game>-plan-trace-completeness-golden.test.ts` (new — same)

**Likely surface** (paths above are subject to refinement against Spec 198's actual test layout discovered at implementation time):
- The `conformance/` subdirectory name is the most likely placement per Spec 198's mandate. If Spec 198 placed conformance tests elsewhere (e.g., `architecture/` or `cross-game/`), match that convention.

## Out of Scope

- New trace fields beyond those introduced by tickets 001–003 (`roleBindingStatuses`, `decisionSurfaceMatch`, `rejectedByConstraint`, structured `fallbackReason`).
- New conformance game families beyond Spec 198's three (FITL, Texas Hold'em, perfect-info).
- Profile YAML changes — Spec 200 explicitly excludes.
- Performance benchmarks — this ticket adds tests, not optimizations.
- Texas Hold'em or perfect-info profile enhancements to make conformance tests more substantial — Spec 198's existing profiles are the substrate; if a test cannot be authored against the existing profile, document the limitation and defer profile changes to a follow-up.

## Acceptance Criteria

### Tests That Must Pass

1. `fitl-plan-trace-completeness-golden.test.ts` (new) — FITL golden trace asserts new fields populate.
2. `texas-plan-trace-completeness-golden.test.ts` (new) — Texas Hold'em golden trace asserts new fields populate; no hidden card-id leak.
3. `<perfect-info-game>-plan-trace-completeness-golden.test.ts` (new) — perfect-info golden trace asserts new fields populate.
4. `observer-safety-invariants.test.ts` (extended) — `hiddenScope` / `partialObserverScope` / `depthCapped` reasons do not leak hidden ids across all three game families.
5. Existing conformance corpus tests (from Spec 198) continue to pass.
6. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test` — full engine test suite green.

### Invariants

1. Every game family in the Spec 198 conformance corpus has at least one golden-trace test asserting the new trace fields populate correctly.
2. The observer-safety architectural invariant covers `hiddenScope`, `partialObserverScope`, and `depthCapped` reasons; no hidden id (zone, token, card) appears in trace output when these reasons fire.
3. The new vocabulary is engine-agnostic: identical assertions pass across FITL, Texas Hold'em, and the perfect-info game.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/conformance/fitl-plan-trace-completeness-golden.test.ts` (new) — FITL golden trace coverage.
2. `packages/engine/test/conformance/texas-plan-trace-completeness-golden.test.ts` (new) — Texas Hold'em golden trace coverage.
3. `packages/engine/test/conformance/<perfect-info-game>-plan-trace-completeness-golden.test.ts` (new) — perfect-info golden trace coverage.
4. `packages/engine/test/architecture/observer-safety-invariants.test.ts` (modify) — extend with new vocabulary observer-safety assertions.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/conformance/fitl-plan-trace-completeness-golden.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/conformance/texas-plan-trace-completeness-golden.test.js`
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/observer-safety-invariants.test.js`
4. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
