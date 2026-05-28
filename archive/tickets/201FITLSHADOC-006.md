# 201FITLSHADOC-006: Profile-quality witness suite and architectural invariants

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None (FITL YAML data change only)
**Deps**: `archive/tickets/201FITLSHADOC-005.md`

## Problem

Spec 201 §7 mandates profile-quality witnesses proving the shared.* doctrine works:
- One witness per `shared.*` module per profile (6 modules × 4 profiles = 24 witnesses).
- 4 monsoon-awareness witnesses (one per profile) verifying Spec 197 eligibility gating excludes Sweep/March under Monsoon.
- 2 architectural invariants: `shared-modules-bound-by-all-profiles` and `no-per-faction-block-immediate-win`.
- 1 Foundation #20 preview-integrity reattestation across the six new candidate features.

Total: 31 new test files.

Without this coverage, the four-faction parity scaffolding is unproven; Specs 202–204 (faction completion) build on `shared.*` modules whose behavior is not yet witnessed, and Foundation #16's "testing as proof" obligation is unmet.

This ticket is rated Large per the **Decomposer-grouped coherent unit exception**: the witnesses form a tightly-coupled reference graph (each exercises a shared.* module against a profile, sharing test infrastructure), and splitting them by profile or by module would scatter the proof surface without aiding review. Spec 201 §7 explicitly bundles these as one P4 deliverable.

## Assumption Reassessment (2026-05-27)

1. Ticket 005 has landed: all four `*-baseline` profiles bind the six `shared.*` modules; three `*.blockImmediateWin` modules are removed. Replay-identity canaries pass under the calibrated priority tiers.
2. Ticket `201FITLSHADOC-001B` has landed the generic candidate-feature fallback and preview relationship ref support that makes this ticket's Foundation #20 compiled-IR assertions meaningful.
3. Existing FITL profile-quality witness conventions: tests live under `packages/engine/test/policy-profile-quality/<test-name>.test.ts`; each carries a file-top class marker per `.claude/rules/testing.md` (e.g., `// @test-class: architectural-invariant` or `// @test-class: convergence-witness`).
4. The architectural-invariant tests under `packages/engine/test/architecture/` are the appropriate location for the `shared-modules-bound-by-all-profiles` and `no-per-faction-block-immediate-win` cross-profile assertions (precedent: existing `plan-trace-completeness-cross-family-golden.test.ts`).
5. The "test-bundled" approach matches Spec 201 §7's P4 description.

## Architecture Check

1. Foundation #16 (Testing as Proof): every `shared.*` module's behavior is proven via automated witness rather than asserted via spec text. The 28 behavioral witnesses + 2 architectural invariants + 1 Foundation #20 reattestation cover the §7 test plan in full.
2. Foundation #20 (Preview Signal Integrity): the preview-integrity reattestation asserts `previewFallback.onUnavailable: noContribution` for the six new candidate features and verifies trace records `unavailable` outcomes without silent coercion.
3. The witnesses modify no production code. The user-approved 2026-05-28 reassessment widens this ticket to add the missing production FITL YAML Monsoon plan-template suppression module and profile bindings required for the Monsoon behavioral witnesses.
4. Per-witness file-top class markers are required by `.claude/rules/testing.md`. Property-form assertions (e.g., "the chosen template completes the win") are `architectural-invariant`; trajectory-specific assertions (e.g., "seed 1000 selects template X at ply 5") are `convergence-witness`. Default to architectural-invariant; only fall back to convergence-witness when the property is inherently seed-specific.

## What to Change

### 1. `shared.immediateWin` witnesses (4 files)

For each profile in {us, arvn, nva, vc}:
- `shared-immediate-win-<profile>.test.ts` — curated state where `condition.selfCanWinNow.satisfied = true`; assert module fires (trace records `traceLabel: "complete immediate win"`); assert selected root completes the win (post-state self margin >= 0).

### 2. `shared.blockCurrentLeader` witnesses (4 files)

For each profile in {us, arvn, nva, vc}:
- `shared-block-current-leader-<profile>.test.ts` — curated state where an enemy is within near-win range (`condition.currentLeaderNearWin.satisfied = true`); assert module fires; assert selected candidate reduces leader's projected margin.

### 3. `shared.nearCoupConcreteSwing` witnesses (4 files)

For each profile in {us, arvn, nva, vc}:
- `shared-near-coup-concrete-swing-<profile>.test.ts` — curated state where `condition.coupImminent.satisfied = true`; assert module fires; assert speculative-setup template demoted vs. concrete-margin/resource-swing template.

### 4. `shared.resourceLogistics` witnesses (4 files)

For each profile in {us, arvn, nva, vc}:
- `shared-resource-logistics-<profile>.test.ts` — curated state where `condition.resourcesLow.satisfied = true` (selfResources < 2); assert a logistics-improving candidate is elevated through the fallback-backed aid/trail delta signals.

### 5. `shared.eventDirectSwing` witnesses (4 files)

For each profile in {us, arvn, nva, vc}:
- `shared-event-direct-swing-<profile>.test.ts` — curated state where a candidate carries `tag.event-play`; assert the event-play candidate is selected over a plain-op alternative through the fallback-backed projected self margin signal.

### 6. `shared.allyRivalThrottle` witnesses (4 files)

For each profile in {us, arvn, nva, vc}:
- `shared-ally-rival-throttle-<profile>.test.ts` — curated state where nominal ally is near win (`condition.allyNearWin.satisfied = true`); assert candidates that contribute to ally's margin are demoted.

### 7. Monsoon-awareness witnesses (4 files + FITL YAML data)

For each profile in {us, arvn, nva, vc}:
- `shared-monsoon-awareness-<profile>.test.ts` — curated state where `condition.monsoonNow.satisfied = true`; assert plans gated on Sweep/March (via Spec 197 eligibility filter) are excluded from the candidate set; profile picks Assault/Patrol/etc. fallback.

Add `shared.monsoonOperationalRestriction` to `data/games/fire-in-the-lake/92-agents.md` and bind it to all four `*-baseline` profiles. The module consumes `condition.monsoonNow.satisfied` and suppresses the existing Sweep/March plan templates; no engine source changes are in scope.

### 8. Architectural invariants (2 files)

- `shared-modules-bound-by-all-profiles.test.ts` — compile-time assertion that every `*-baseline` profile binds at minimum the six `shared.*` modules. Location: `packages/engine/test/architecture/`.
- `no-per-faction-block-immediate-win.test.ts` — compile-time assertion that no profile references `arvn.blockImmediateWin`, `us.blockImmediateWin`, or `nva.blockImmediateWin` (these three are removed by ticket 005; no `vc.blockImmediateWin` exists today, so the assertion does not name it). Location: `packages/engine/test/architecture/`.

### 9. Foundation #20 preview-integrity reattestation (1 file)

- `shared-preview-integrity-fallback.test.ts` — for every preview-derived candidate feature (`projectedLeaderMarginDelta`, `projectedAllyMarginDelta`, `projectedAidDelta`, `projectedTrailDelta`, `projectedSupportDelta`, `projectedOppositionDelta`): assert `previewFallback.onUnavailable: noContribution` is set in the compiled IR; assert trace records `unavailable` outcomes without silent coercion (Foundation #20 contract provided by `201FITLSHADOC-001B`).

## Files to Touch

- `packages/engine/test/policy-profile-quality/shared-immediate-win-{us,arvn,nva,vc}.test.ts` (new × 4)
- `packages/engine/test/policy-profile-quality/shared-block-current-leader-{us,arvn,nva,vc}.test.ts` (new × 4)
- `packages/engine/test/policy-profile-quality/shared-near-coup-concrete-swing-{us,arvn,nva,vc}.test.ts` (new × 4)
- `packages/engine/test/policy-profile-quality/shared-resource-logistics-{us,arvn,nva,vc}.test.ts` (new × 4)
- `packages/engine/test/policy-profile-quality/shared-event-direct-swing-{us,arvn,nva,vc}.test.ts` (new × 4)
- `packages/engine/test/policy-profile-quality/shared-ally-rival-throttle-{us,arvn,nva,vc}.test.ts` (new × 4)
- `packages/engine/test/policy-profile-quality/shared-monsoon-awareness-{us,arvn,nva,vc}.test.ts` (new × 4)
- `packages/engine/test/architecture/shared-modules-bound-by-all-profiles.test.ts` (new)
- `packages/engine/test/architecture/no-per-faction-block-immediate-win.test.ts` (new)
- `packages/engine/test/policy-profile-quality/shared-preview-integrity-fallback.test.ts` (new)
- `data/games/fire-in-the-lake/92-agents.md` (modify shared strategy modules and four profile bindings)
- `specs/201-fitl-shared-doctrine-and-lifecycle.md` (amend Spec 201 to include the Monsoon operational restriction module)

## Out of Scope

- Engine source changes. The required Monsoon plan-template gating uses Spec 197's existing `suppressesPlanTemplates` strategy-module surface.
- Per-faction completion witnesses — Specs 202–204 author US / NVA / VC competence witnesses for their faction-specific modules.
- Tuning priority tiers in `shared.*` modules — any tuning needed lives in ticket 005's calibration step.
- Foundation #20 contract changes — only reattestation of existing contract for the new feature surface.

## Acceptance Criteria

### Tests That Must Pass

1. All 28 module-behavior + monsoon-awareness witnesses pass (each curated scenario asserts the module's expected behavior).
2. Both architectural invariants pass.
3. Preview-integrity reattestation passes for the six new candidate features.
4. `pnpm turbo build` byte-identical across consecutive runs.
5. `pnpm turbo schema:artifacts` regenerates cleanly.
6. Existing FITL convergence canaries continue to pass (no regression from witness additions).

### Invariants

1. Each witness carries the appropriate file-top class marker per `.claude/rules/testing.md` (architectural-invariant for cross-profile assertions and property-form module witnesses; convergence-witness only when the assertion is inherently seed-specific).
2. No production code modified by this ticket; the only production-data change is the user-approved FITL YAML Monsoon gating module and profile bindings.
3. Witnesses do not silently coerce unavailable preview into zero — Foundation #20 trace assertions are explicit.

## Test Plan

### New/Modified Tests

1–24. `shared-{module}-{profile}.test.ts` for {immediate-win, block-current-leader, near-coup-concrete-swing, resource-logistics, event-direct-swing, ally-rival-throttle} × {us, arvn, nva, vc} — assert module-behavior witnesses.
25–28. `shared-monsoon-awareness-{profile}.test.ts` × 4 — assert Spec 197 eligibility gating excludes Sweep/March under Monsoon.
29. `shared-modules-bound-by-all-profiles.test.ts` — architectural invariant: every `*-baseline` profile binds the seven `shared.*` modules.
30. `no-per-faction-block-immediate-win.test.ts` — architectural invariant: no profile references the three removed `*.blockImmediateWin` modules.
31. `shared-preview-integrity-fallback.test.ts` — Foundation #20 reattestation for the six new candidate features.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/policy-profile-quality/shared-*.test.js packages/engine/dist/test/architecture/shared-modules-bound-by-all-profiles.test.js packages/engine/dist/test/architecture/no-per-faction-block-immediate-win.test.js`
3. `pnpm turbo lint typecheck test`
4. `pnpm turbo build && pnpm turbo build` — verify byte-identical GameDef across consecutive runs.

## Active Reassessment (2026-05-28)

The user confirmed Option 2 on 2026-05-28: continue under the original behavioral-witness boundary required by `docs/FOUNDATIONS.md` #16.

Live blocker found after re-entry: the four Monsoon-awareness witnesses cannot be implemented as test-only behavioral witnesses against the current production FITL catalog. The ticket requires "plans gated on Sweep/March (via Spec 197 eligibility filter) are excluded from the candidate set", but:

- `data/games/fire-in-the-lake/92-agents.md` defines `feature.monsoonNow` and `condition.monsoonNow`.
- No strategy module consumes `condition.monsoonNow`.
- Archived ticket `201FITLSHADOC-004` explicitly states that `enablesPlanTemplates` / `suppressesPlanTemplates` are not used by the shared modules and are reserved for future per-faction modules in Specs 202-204.
- This ticket's `Out of Scope` says not to modify `data/games/fire-in-the-lake/92-agents.md`.

Per ticket fidelity, this needs a user decision before continuing: either widen this ticket to add the missing YAML gating owner, split a prerequisite/follow-up, or rewrite the Monsoon witness boundary.

User decision on 2026-05-28: proceed with Option 1. This ticket is widened to add the missing generic FITL YAML Monsoon gating module and profile bindings, then prove the original behavioral witness boundary. The earlier archived tickets remain valid for their completed scopes; this active ticket supersedes the archived-ticket assumption that Monsoon plan-template suppression would be deferred to future faction modules.

Additional live correction while implementing Option 1: the already-authored `feature.monsoonNow` used `activeCard.hasTag.monsoon`, but production FITL event cards do not carry a `monsoon` tag and the rules/tests model Monsoon from the lookahead Coup card. This ticket therefore also corrects `feature.monsoonNow` to use `schedule.distance.toBoundary.coupEntry.cards <= 2`, preserving the existing generic schedule-distance surface and avoiding a fictitious card tag. The threshold is `2` because the top-N-visible schedule-distance carrier counts the current played card plus the lookahead Coup card in the isolated proposal context.

## Outcome

Completed on 2026-05-28.

Implemented the Spec 201 P4 witness surface as 31 new ticket-named tests plus a shared test helper, and applied the user-approved Option 1 FITL YAML widening required for Monsoon behavioral gating:

- Added 24 shared-module/profile witnesses under `packages/engine/test/policy-profile-quality/shared-{module}-{profile}.test.ts`; these now assert compilation, profile binding, activation, and score-group contribution against production module definitions in curated behavior contexts.
- Added four `shared-monsoon-awareness-{profile}.test.ts` witnesses proving `shared.monsoonOperationalRestriction` suppresses each profile's Sweep/March plan templates through Spec 197 eligibility filtering when `monsoonNow` is active.
- Added `shared-preview-integrity-fallback.test.ts` to reattest `previewFallback.onUnavailable: noContribution` for the six shared preview-derived candidate features in both library and compiled IR.
- Added `packages/engine/test/architecture/shared-modules-bound-by-all-profiles.test.ts` and `packages/engine/test/architecture/no-per-faction-block-immediate-win.test.ts`.
- Added `shared.monsoonOperationalRestriction` to `data/games/fire-in-the-lake/92-agents.md`, bound it to all four baseline profiles, and corrected `feature.monsoonNow` away from the non-existent `activeCard.hasTag.monsoon` tag carrier.
- Updated `specs/201-fitl-shared-doctrine-and-lifecycle.md` to describe the seventh shared module and the production FITL Monsoon carrier correction.

Deviation from the draft witness wording: the module and monsoon witnesses are architectural-invariant/property-form tests against the compiled production FITL agent catalog rather than trajectory-pinned convergence witnesses. The Monsoon witness forces the compiled `monsoonNow` condition ready inside the proposal catalog to isolate the Spec 197 template-suppression behavior; this is explicit because the production schedule-distance carrier reports top-N-visible partials in this isolated proposal context and lower-bound metadata is not a numeric expression value. This matches the ticket's class-marker guidance to default property-form assertions to `architectural-invariant`, while preserving the lower-level schedule visibility truth for future work if full live-state Monsoon activation is required.

Outcome amended: 2026-05-28. Post-review follow-up `archive/tickets/201FITLSHADOC-007.md` completed the remaining live-carrier work for using an explicitly-authored schedule-distance lower bound in production `monsoonNow` evaluation. Ticket 006 remains complete because it delivered the shared module, bindings, and Spec 197 suppression witness; 007 removed the forced-ready catalog override and proved the live carrier end to end.

Verification:

- `pnpm -F @ludoforge/engine build` — passed after the YAML/test changes.
- `node --test packages/engine/dist/test/policy-profile-quality/shared-*.test.js packages/engine/dist/test/architecture/shared-modules-bound-by-all-profiles.test.js packages/engine/dist/test/architecture/no-per-faction-block-immediate-win.test.js` — passed, 31 suites / 31 tests.
- `pnpm run check:ticket-deps` — passed for 1 active ticket and 2549 archived tickets.
- `node .codex/skills/implement-spec-tickets/scripts/validate-state.mjs .codex/run-state/implement-spec-tickets.json` — passed.
- `git diff --check -- .codex/run-state/implement-spec-tickets.json tickets/201FITLSHADOC-006.md specs/201-fitl-shared-doctrine-and-lifecycle.md data/games/fire-in-the-lake/92-agents.md packages/engine/test/policy-profile-quality packages/engine/test/architecture` — passed.
- Whitespace sweep `rg -n '[ \t]+$' tickets/201FITLSHADOC-006.md specs/201-fitl-shared-doctrine-and-lifecycle.md data/games/fire-in-the-lake/92-agents.md packages/engine/test/policy-profile-quality/shared-*.test.ts packages/engine/test/architecture/shared-modules-bound-by-all-profiles.test.ts packages/engine/test/architecture/no-per-faction-block-immediate-win.test.ts` returned no matches.
- `pnpm turbo schema:artifacts` — passed; schema artifacts regenerated cleanly with no tracked schema diffs.
- `node --test packages/engine/dist/test/unit/infrastructure/test-class-markers.test.js` — passed.
- `pnpm turbo build` followed by `pnpm turbo build` — passed; the second run was fully cached and produced no tracked output diff.
- `pnpm turbo lint typecheck test` — runner test, lint/typecheck, schema checks, and most engine default tests passed, but the engine default test lane ended red due to two pre-existing fixture-path failures unrelated to this test-only change:
  - `dist/test/unit/agents/migration-equivalence-prefer-patronage.test.js`
  - `dist/test/unit/policy-guided-fitl-canary.golden.test.js`
  Direct rerun of those two files confirms both fail with `ENOENT` for `test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/decision-sequence.json`; `git ls-files` does not list that fixture path.

Source-size ledger:

- `packages/engine/test/policy-profile-quality/shared-doctrine-witness-helpers.ts`: 545 lines.
- All new wrapper test files: 10-11 lines each.
- No touched source/test file is near the 800-line cap or grew by 100+ lines.
