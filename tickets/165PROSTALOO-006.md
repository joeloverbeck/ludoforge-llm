# 165PROSTALOO-006: Cookbook recipe + end-to-end projected-lookup fixture

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — new fixture file under `packages/engine/test/architecture/lookup-refs-projected/`; docs change in `docs/agent-dsl-cookbook.md`
**Deps**: `archive/tickets/165PROSTALOO-003.md`, `tickets/165PROSTALOO-004.md`, `tickets/165PROSTALOO-005.md`

## Problem

Spec §7 Phase 5 calls for two Phase-5 deliverables:

1. **Cookbook recipe** in `docs/agent-dsl-cookbook.md` — a new "Projected-State Lookups at chooseN Frontiers" section with the decision tree distinguishing four authoring choices: current-state lookup (`lookup.surface: 'policyState'`), projected-state lookup (`lookup.surface: 'previewOptionState'`), scalar preview ref (`preview.option.*`), and composed delta (current minus projected via the `subtract` operator). The trichotomy is documented in `reports/projected-state-lookup-refs-2026-05-10.md` §6.4 and reaffirmed in Spec §4.5.

2. **End-to-end fixture profile** in `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-fixture.ts` — a synthetic two-zone game whose chooseN ADD frontier publishes per-option `ZoneId` values; each candidate's bounded inner-preview produces a distinct projected `variables.troopCount` per zone. The fixture exercises each of the four lookup collections (`zones`, `tokens`, `players`, `globals`) on the projected surface end-to-end. It is the canonical witness for the empirical motivation in Spec §2.4.

This fixture and cookbook section close out the spec's authoring-surface story: an author with the cookbook in hand can adopt projected lookups in their profile without reading the spec.

## Assumption Reassessment (2026-05-11)

1. `docs/agent-dsl-cookbook.md` exists — verified by `test -f`.
2. `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` is the Spec 163 fixture pattern — verified by `ls` in Step 2 of decomposition. The new `lookup-refs-projected/` directory will be created by ticket 003's earliest tests; this ticket adds the comprehensive end-to-end fixture there.
3. Spec §2.4's empirical witness is the FITL ARVN seed-1000 campaign showing that the scalar projected margin delta is uniform across Govern target options because the per-zone effect is summed away in the aggregate margin formula. The synthetic two-zone fixture replicates this property in a game-agnostic shell: two zones, a chooseN ADD frontier picking a target zone, an inner preview that grants different `variables.troopCount` per zone target. The fixture is **not** FITL — it is a generic game shell that proves the matrix cell is filled.
4. The decision tree from `reports/projected-state-lookup-refs-2026-05-10.md` §6.4 has four columns: current-state keyed lookup vs projected-state keyed lookup vs scalar `preview.option.*` vs composed `subtract(projected, current)`. Confirm by reading that report at fixture-authoring time; reproduce the table or its equivalent in the cookbook recipe.
5. The fixture must be exercised by at least one architectural-invariant test that walks each of the four collections at path-depth ≥ 2 on the projected surface. Spec §8.1 #8 (`projected-lookup-collection-coverage.test.ts`) already exists under ticket 004 — coordinate with ticket 004 so the fixture imported here is the same one the coverage test consumes, OR the coverage test inlines its own minimal fixture and this ticket's fixture is the comprehensive end-to-end witness used by additional smoke tests authored here.
6. `docs/agent-dsl-cookbook.md` follows a section-with-YAML-snippets convention. New sections typically include: motivation, decision tree (when to use which surface), YAML example, fallback contract reference, and a link to relevant spec(s). Mirror existing section structure.

## Architecture Check

1. **Generic fixture, not game-specific**: the synthetic two-zone game shell carries no FITL/Texas Hold'em semantics. Per Foundation #1 it cannot, because the fixture lives in `packages/engine/test/architecture/`, not under a per-game directory.
2. **Cookbook is documentation, not executable code**: the YAML snippets are illustrative; the canonical authoring contract is enforced by the compiler (ticket 003). No `eval`, no embedded scripts. Foundation #7 (Specs Are Data).
3. **The four-way decision tree is authoring guidance, not a rule**: authors retain full DSL flexibility; the cookbook recommends choices but the compiler validates contracts. Foundation #15 (Architectural Completeness): the fixture proves the full matrix cell is filled, not just a single happy path.
4. **End-to-end exercise integrates compiler + runtime + deepening**: the fixture is a smoke test that tickets 001-005's deliverables compose. If any of those tickets' deliverables regress, this fixture's smoke test fails.

## What to Change

### 1. Cookbook recipe: "Projected-State Lookups at chooseN Frontiers"

In `docs/agent-dsl-cookbook.md`, add a new section after the existing Spec 163 "State-Feature Lookups" section (or wherever the cookbook's lookup-related material lives — confirm at write time). Section structure:

- **Motivation**: the matrix-cell narrative (current-state keyed ✅, projected-state scalar ✅, projected-state keyed ❌ — now ✅). Brief pointer to Spec §1.
- **Decision tree** (the four-way trichotomy from `reports/projected-state-lookup-refs-2026-05-10.md` §6.4 + Spec §4.5): when does each surface apply?
  | Authoring goal | Choose |
  |---|---|
  | Score by a current-state per-object property | `lookup.surface: 'policyState'` |
  | Score by the projected per-object property at the synthetic-completion endpoint | `lookup.surface: 'previewOptionState'` |
  | Score by a scalar projected-state property (margin delta, victory rank) | `preview.option.*` |
  | Score by the *change* in a per-object property (projected minus current) | Composed: `subtract(lookup.previewOptionState.<path>, lookup.policyState.<path>)` |
- **YAML example for `surface: 'previewOptionState'`** (mirroring Spec §4.1's `preferProjectedTroopBuildup` snippet).
- **YAML example for the composed delta** (mirroring Spec §4.5's `preferProjectedTroopDelta` snippet).
- **Fallback contract reminder**: `previewFallback` required for projected lookups; `lookupFallback` required for current-state lookups; mixed compositions require both. Pointer to Spec §4.6.
- **`onMissing` and `onHidden` semantics**: identical to Spec 163; `onHidden: 'unavailable'` non-overridable.
- **Path-stability convention** (Spec §11 open question 3): recommend initializing zone/token/player variables to stable defaults when authors plan to use projected lookups; absent paths fall back per `onMissing`.
- **Links** to Spec 165 sections (§4.1, §4.5, §4.6, §4.8) and Spec 164 (deepening triggers).

### 2. End-to-end fixture: `projected-lookup-fixture.ts`

Create `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-fixture.ts`. Mirror the structure of `packages/engine/test/architecture/lookup-refs/lookup-refs-fixture.ts` (Spec 163's pattern).

The fixture defines:

- A synthetic two-zone game (`zoneA`, `zoneB`).
- An action with a chooseN ADD frontier publishing per-option `ZoneId` values (e.g., "add target zone").
- Per-zone `variables.troopCount` initialized to known values (e.g., zoneA=3, zoneB=5).
- A bounded inner preview whose synthetic completion increments `troopCount` by an option-dependent delta (e.g., `+2` per chosen zone target). The projected post-completion state therefore has different `troopCount` values per option (zoneA option → projected troopCount 5 for zoneA; zoneB option → projected troopCount 7 for zoneB).
- Per-collection path-depth-≥2 readouts on the projected surface for each of `zones`, `tokens`, `players`, `globals`.
- Per-seat observer projection: at least one path is visible to seat A and hidden from seat B, exercising the observer-visibility inheritance (Spec §4.7).

### 3. Smoke test consuming the fixture end-to-end

Author `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-end-to-end.test.ts` (new). The test:

- Compiles a YAML profile that uses `lookup.surface: 'previewOptionState'` against each collection.
- Runs the agent at the chooseN ADD frontier with the fixture state.
- Asserts: per-option projected lookups resolve to the expected per-zone values; `previewFallback` does NOT fire (all options resolve `ready`); the agent's selection differs from a baseline profile that uses only scalar `preview.option.*` (proving the projected-keyed signal exposes per-option differentiation that the scalar family cannot).
- Asserts the same end-to-end flow under the deepening trigger pipeline (one option pre-arranged to depth-cap at broad pass → deep pass fires → projected lookup resolves at deep cap).

### 4. Optional consolidation note

If ticket 004's `projected-lookup-collection-coverage.test.ts` was written to use an inline fixture, evaluate at the implementation pass whether to migrate it to consume this shared fixture. Either is acceptable per Spec §8; the shared fixture keeps the surface canonical but inline fixtures keep each test self-contained. Document the choice in the PR description.

## Files to Touch

- `docs/agent-dsl-cookbook.md` (modify — add "Projected-State Lookups at chooseN Frontiers" section)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-fixture.ts` (new — comprehensive synthetic two-zone fixture)
- `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-end-to-end.test.ts` (new — smoke test consuming the fixture across all four collections + deepening)

## Out of Scope

- The Spec §8.5 #14 optional FITL ARVN profile-quality convergence witness — explicitly profile-quality, non-blocking, deferred.
- Any compiler / runtime / deepening behavior change — those are covered by tickets 003-005.
- New diagnostic codes or schema changes — those are covered by tickets 001 and 003.
- Per-game fixture material — the synthetic two-zone game shell is engine-agnostic; FITL-specific projected-lookup recipes belong in the optional profile-quality witness (out of scope).
- A separate clairvoyance-hardening / drive-time observer-purity documentation pass — Spec §4.7, §11 open question 1 explicitly defers this.

## Acceptance Criteria

### Tests That Must Pass

1. **`projected-lookup-end-to-end.test.ts`** — compiles the YAML profile, runs at the chooseN ADD frontier with the synthetic two-zone fixture, asserts:
   - Per-option projected lookups resolve to the expected per-zone values for all four collections.
   - `previewFallback` does not fire in the happy path.
   - The selection differs from a baseline scalar-only profile (proving differentiation).
   - Deepening trigger fires on a depth-capped option and the deep pass resolves the projected lookup at deep cap.
2. **Cookbook section** parses as valid markdown (verify by visual review or any cookbook-lint tooling the repo uses).
3. **All Spec 163 + ticket-003-004-005 tests** continue to pass byte-identically.
4. **Full engine suite**: `pnpm -F @ludoforge/engine test` green.
5. **Build / typecheck / lint**: `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint` green.

### Invariants

1. **Fixture is engine-agnostic**: the synthetic game shell carries no game-specific semantics; the fixture proves the projected-lookup family works on a generic GameState. Foundation #1.
2. **Four-way decision tree is complete**: the cookbook documents all four authoring choices for "score-by-state-feature" patterns; an author reading the cookbook can choose between them without ambiguity.
3. **Cookbook is documentation, not executable**: no embedded scripts, no `eval`. Foundation #7.
4. **End-to-end smoke test exercises every layer**: compiler lowering + runtime routing + deepening integration. A regression in any of tickets 003-005 causes this test to fail.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-fixture.ts` — shared synthetic two-zone fixture for the projected-lookup family.
2. `packages/engine/test/architecture/lookup-refs-projected/projected-lookup-end-to-end.test.ts` — end-to-end smoke test consuming the fixture across all four collections + the deepening pipeline.

### Commands

1. `pnpm turbo build` — engine compile.
2. `node --test packages/engine/dist/test/architecture/lookup-refs-projected/projected-lookup-end-to-end.test.js` — run the smoke test.
3. `pnpm -F @ludoforge/engine test` — full engine suite.
4. `pnpm turbo build && pnpm turbo typecheck && pnpm turbo lint` — gates.
5. `pnpm run check:ticket-deps` — Deps validation.
