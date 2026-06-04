# 210FITLCOMP-010: Conditional §3 YAML feature additions (gated on failing fixtures)

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — data-only (`92-agents.md`)
**Deps**: `archive/tickets/210FITLCOMP-001.md`, `archive/tickets/210FITLCOMP-002.md`, `archive/tickets/210FITLCOMP-003.md`, `archive/tickets/210FITLCOMP-004.md`, `tickets/210FITLCOMP-005.md`, `tickets/210FITLCOMP-006.md`, `tickets/210FITLCOMP-007.md`, `tickets/210FITLCOMP-008.md`, `tickets/210FITLCOMP-009.md`

## Problem

Spec 210 §3 permits adding agent-library features **only** where a fixture fails because the current encoding cannot distinguish the required choice (the trigger report's "tune YAML only where a fixture fails" rule, §4 AC#7). This ticket collects any such additions surfaced during the fixture-promotion work (001–009) into a single reviewable data change.

**Gate condition**: This is a gated ticket. Author a feature **only** if a named fixture from 001–009 demonstrably failed because the encoding could not express the decisive distinction. If every fixture passed without a new feature, **close this ticket with "Declined — no fixture required a new feature" in Outcome** and make no `92-agents.md` change.

Live gate opened by `archive/tickets/210FITLCOMP-003.md`: after the bounded visible-Coup schedule correction, US/ARVN/NVA near-Coup concrete-swing witnesses pass as executed outcomes, but `shared-near-coup-concrete-swing-vc.test.ts` selects `march|{}|false|operation` with no Coup-scored margin/Aid delta across base, active-support, passive-opposition, and active-opposition seed scans. This ticket owns the YAML/profile change that makes the VC fixture distinguish and select an executed near-Coup concrete swing.

## Assumption Reassessment (2026-06-03)

1. `92-agents.md` already ships a 24-entry `library.stateFeatures` block and 24 `candidateFeatures`. Confirmed. The 4 projected-delta candidateFeatures (`projectedSupportDelta`, `projectedOppositionDelta`, `projectedAidDelta`, `projectedTrailDelta`) and leader/ally features (`projectedCurrentLeaderMargin`, `projectedLeaderMarginDelta`, `projectedAllyMarginDelta`, `projectedNearestThreatMargin`) MUST NOT be re-added.
2. Candidate **new** `candidateFeatures` (absent today): `projectedAvailableUsDelta`, `projectedPatronageDelta`, `projectedNvaBaseDelta`, `projectedVcBaseDelta`, `projectedAgitationReadyDelta`. Each follows the shipping `coalesce(sub(preview.<ref>, <ref>), 0)` + `previewFallback: { onUnavailable: noContribution }` pattern over already-resolvable `preview.var.global.*` / `preview.feature.*` refs (pure data, no engine change).
3. Candidate **new** `stateFeatures` (absent today, verbatim): `availableUsPieces`, `keyEconSabotageCount`, `agitationReadyPop`, `pacifiableSupportPop`, `nvaSanctuaryBaseCount`, `vcBaseThreatenedByNvaInfiltrate`. Before adding, check for a near-duplicate of an existing entry (e.g. `availableUsPieces` overlaps `availableUsTroops` + `availableUsBases`; `nvaSanctuaryBaseCount` overlaps `nvaBaseCount`) and prefer composing existing features.
4. `shared-near-coup-concrete-swing-vc.test.ts` remains structural after `210FITLCOMP-003`; it is the concrete named fixture that opens this gate.

## Architecture Check

1. All rule-authoritative agent data lives in GameSpecDoc YAML (`92-agents.md`) — Foundation #2 (Evolution-First). No engine change (Foundation #1).
2. Each added feature reuses existing expr primitives / preview refs, so the addition is pure data — confirmed no preview-provider surface is missing for `preview.var.global.*` / `preview.feature.*` (the four shipping projected deltas prove the surface exists).
3. Gating each feature on a named failing fixture prevents speculative authoring and overfitting (FOUNDATIONS #15; spec §4 AC#7).

## What to Change

### 1. Add only fixture-justified features

For each new feature added, cite in the commit/PR body the exact failing fixture (file + assertion) that could not be satisfied without it. Add `candidateFeatures` under `library.candidateFeatures` and `stateFeatures` under `library.stateFeatures` in `92-agents.md`, following the existing shape. Do not add any feature not demanded by a named fixture.

### 2. Wire the new feature into the demanding fixture's profile/module

If a feature is added, update the relevant doctrine module/selector in `92-agents.md` to consume it so the previously-failing fixture passes, and re-run that fixture to confirm.

### 3. Promote the VC near-Coup residual

After the YAML/profile distinction is added, promote `shared-near-coup-concrete-swing-vc.test.ts` to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`, proving `shared.nearCoupConcreteSwing` is active, the selected root is in the live frontier, pass/speculative setup is rejected, and the executed state changes a Coup-scored property.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — only if a fixture requires it)
- `packages/engine/test/policy-profile-quality/shared-near-coup-concrete-swing-vc.test.ts` (modify — promote once the YAML/profile gap is fixed)
- `packages/engine/test/policy-profile-quality/shared-doctrine-witness-helpers.ts` (modify/delete if the VC promotion leaves no consumers)

## Out of Scope

- Re-adding any of the 4 shipping projected-delta or 4 leader/ally candidateFeatures (explicitly forbidden).
- Speculative features not demanded by a named failing fixture.
- Engine changes of any kind.
- New fixture files. The existing VC near-Coup fixture promotion is in scope because `210FITLCOMP-003` deferred it here after live failure evidence.

## Acceptance Criteria

### Tests That Must Pass

1. The production FITL spec still compiles after any feature addition.
2. Every fixture that motivated a feature addition passes after the addition, including `shared-near-coup-concrete-swing-vc.test.ts` when this gate is opened by the 003 evidence.
3. Full policy-profile-quality lane + smoke/perf canaries stay green: `pnpm turbo test`

### Invariants

1. No `candidateFeature` or `stateFeature` is added without a named failing fixture justifying it (spec §4 AC#7).
2. None of the 4 shipping projected-delta candidateFeatures are re-added (FOUNDATIONS #14, DRY).
3. No engine source change; the addition is pure GameSpecDoc data (FOUNDATIONS #1/#2).

## Test Plan

### New/Modified Tests

1. No new test files — this ticket only unblocks fixtures authored in 001–009. Verification is that the previously-failing fixture(s), including the VC near-Coup residual, now pass.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/<demanding-fixture>.test.js`
2. `pnpm turbo lint typecheck && pnpm turbo test`
