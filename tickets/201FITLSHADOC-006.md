# 201FITLSHADOC-006: Profile-quality witness suite and architectural invariants

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None
**Deps**: `tickets/201FITLSHADOC-005.md`

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
2. Existing FITL profile-quality witness conventions: tests live under `packages/engine/test/policy-profile-quality/<test-name>.test.ts`; each carries a file-top class marker per `.claude/rules/testing.md` (e.g., `// @test-class: architectural-invariant` or `// @test-class: convergence-witness`).
3. The architectural-invariant tests under `packages/engine/test/architecture/` are the appropriate location for the `shared-modules-bound-by-all-profiles` and `no-per-faction-block-immediate-win` cross-profile assertions (precedent: existing `plan-trace-completeness-cross-family-golden.test.ts`).
4. The "test-bundled" approach matches Spec 201 §7's P4 description.

## Architecture Check

1. Foundation #16 (Testing as Proof): every `shared.*` module's behavior is proven via automated witness rather than asserted via spec text. The 28 behavioral witnesses + 2 architectural invariants + 1 Foundation #20 reattestation cover the §7 test plan in full.
2. Foundation #20 (Preview Signal Integrity): the preview-integrity reattestation asserts `previewFallback.onUnavailable: noContribution` for the six new candidate features and verifies trace records `unavailable` outcomes without silent coercion.
3. The witnesses modify no production code or YAML; they exercise the post-005 profile bindings as authored.
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
- `shared-resource-logistics-<profile>.test.ts` — curated state where `condition.resourcesLow.satisfied = true` (selfResources < 2); assert resource-restoring template selected.

### 5. `shared.eventDirectSwing` witnesses (4 files)

For each profile in {us, arvn, nva, vc}:
- `shared-event-direct-swing-<profile>.test.ts` — curated state where active card carries `tag.event-play` OR `hasAnnotation.directVictorySwing`; assert event-play template selected over plain-op alternative.

### 6. `shared.allyRivalThrottle` witnesses (4 files)

For each profile in {us, arvn, nva, vc}:
- `shared-ally-rival-throttle-<profile>.test.ts` — curated state where nominal ally is near win (`condition.allyNearWin.satisfied = true`); assert candidates that contribute to ally's margin are demoted.

### 7. Monsoon-awareness witnesses (4 files)

For each profile in {us, arvn, nva, vc}:
- `shared-monsoon-awareness-<profile>.test.ts` — curated state where `condition.monsoonNow.satisfied = true`; assert plans gated on Sweep/March (via Spec 197 eligibility filter) are excluded from the candidate set; profile picks Assault/Patrol/etc. fallback.

### 8. Architectural invariants (2 files)

- `shared-modules-bound-by-all-profiles.test.ts` — compile-time assertion that every `*-baseline` profile binds at minimum the six `shared.*` modules. Location: `packages/engine/test/architecture/`.
- `no-per-faction-block-immediate-win.test.ts` — compile-time assertion that no profile references `arvn.blockImmediateWin`, `us.blockImmediateWin`, or `nva.blockImmediateWin` (these three are removed by ticket 005; no `vc.blockImmediateWin` exists today, so the assertion does not name it). Location: `packages/engine/test/architecture/`.

### 9. Foundation #20 preview-integrity reattestation (1 file)

- `shared-preview-integrity-fallback.test.ts` — for every preview-derived candidate feature (`projectedLeaderMarginDelta`, `projectedAllyMarginDelta`, `projectedAidDelta`, `projectedTrailDelta`, `projectedSupportDelta`, `projectedOppositionDelta`): assert `previewFallback.onUnavailable: noContribution` is set in the compiled IR; assert trace records `unavailable` outcomes without silent coercion (Foundation #20 contract).

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

## Out of Scope

- Modifying `data/games/fire-in-the-lake/92-agents.md` — tickets 001–005 own all YAML changes; this ticket is test-only.
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
2. No production code or YAML modified by this ticket.
3. Witnesses do not silently coerce unavailable preview into zero — Foundation #20 trace assertions are explicit.

## Test Plan

### New/Modified Tests

1–24. `shared-{module}-{profile}.test.ts` for {immediate-win, block-current-leader, near-coup-concrete-swing, resource-logistics, event-direct-swing, ally-rival-throttle} × {us, arvn, nva, vc} — assert module-behavior witnesses.
25–28. `shared-monsoon-awareness-{profile}.test.ts` × 4 — assert Spec 197 eligibility gating excludes Sweep/March under Monsoon.
29. `shared-modules-bound-by-all-profiles.test.ts` — architectural invariant: every `*-baseline` profile binds the six `shared.*` modules.
30. `no-per-faction-block-immediate-win.test.ts` — architectural invariant: no profile references the three removed `*.blockImmediateWin` modules.
31. `shared-preview-integrity-fallback.test.ts` — Foundation #20 reattestation for the six new candidate features.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/policy-profile-quality/shared-*.test.js packages/engine/dist/test/architecture/shared-modules-bound-by-all-profiles.test.js packages/engine/dist/test/architecture/no-per-faction-block-immediate-win.test.js`
3. `pnpm turbo lint typecheck test`
4. `pnpm turbo build && pnpm turbo build` — verify byte-identical GameDef across consecutive runs.
