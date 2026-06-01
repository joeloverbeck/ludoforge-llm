# 203FITLNVACOM-004: nva-baseline profile bindings (P3)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — data authoring in `92-agents.md`
**Deps**: `archive/tickets/203FITLNVACOM-003.md`

## Problem

Tickets 002 and 003 authored the new NVA plan templates, selectors, strategy modules, postures, and guardrails — but the plan templates, strategy modules, and guardrails are not active until they are bound into the `nva-baseline` profile's `use:` block. Spec 203 §4.5 specifies the bindings update.

The current `nva-baseline.use` block (at `92-agents.md:3088-3109`) lists 10 strategy modules (7 shared from Spec 201 + 3 faction-specific), 5 plan templates, and 3 guardrails (+ shared `dropPassWhenOtherMovesExist`). This ticket adds the new entries from §§4.1, 4.3, 4.4.

## Assumption Reassessment (2026-05-31)

1. The binding block at `92-agents.md:3088-3109` uses `use: { guardrails, strategyModules, planTemplates }` (confirmed during reassessment). Postures are NOT bound in the profile's `use:` block — they are referenced per-template via `postureHook`, so this ticket does not bind `nva.preserveTrail` or `nva.avoidVcKingmaking` directly.
2. Profile binding is purely additive — no removal or reordering of existing entries.
3. Spec 201 has shipped (archived COMPLETED), and 7 shared modules are already bound in `nva-baseline.use.strategyModules`.
4. Boundary reset approved on 2026-05-31: do not bind `nva.eventLogisticsOrControlSwing`, because no such event plan template is authored. Event doctrine remains covered by the already-bound `shared.eventDirectSwing` strategy module.
5. Boundary reset approved on 2026-05-31 after `pnpm -F @ludoforge/engine test:unit` exposed ARVN golden-trace drift: continue under this ticket and fix the binding-induced drift rather than weakening proof or retargeting to ticket 006. Focused isolation showed the newly bound NVA March templates must be included in the existing `shared.monsoonOperationalRestriction` suppression list, matching the old NVA March templates it already suppresses.

## Architecture Check

1. **Foundation 14 (No Backwards Compatibility)**: No compatibility shims — new entries are added inline without renaming, prefixing, or aliasing existing bindings. The pre-203 profile compiled; the post-203 profile compiles with strictly-more behaviors active.
2. **Foundation 1 (Engine Agnosticism)**: Profile bindings are pure data — no engine code modified.
3. **Replay-identity preservation**: Existing NVA witnesses must continue to pass after this ticket, per Spec 203 §6 P3 acceptance. The new templates / modules / guardrails only activate via their `when:` clauses; passive behaviors don't perturb prior trajectories on the existing witness seeds (those seeds were chosen to exercise specific paths that the new doctrine should not divert).

## What to Change

### 1. Add new strategy modules to `nva-baseline.use.strategyModules`

Append (after the existing `nva.vcRivalLeverage` entry): `nva.baseNetwork`, `nva.takeControl`, `nva.conventionalPressure`, `nva.vcRivalRisk`.

### 2. Add new plan templates to `nva-baseline.use.planTemplates`

Append (after the existing `nva.locOccupationBeforeCoup` entry) the new templates from ticket 002: `nva.rallyTrail`, `nva.marchControl`, `nva.marchInfiltrateControl`, `nva.infiltrateVcOnlyWhenRational`, `nva.bombardCoinStack`, `nva.terrorSupportReduction`.

`nva.marchAmbush` and `nva.attackAmbush` are already-existing, already-bound template names; do not re-add duplicate entries. `nva.eventLogisticsOrControlSwing` is not authored or bound; keep event doctrine under `shared.eventDirectSwing`.

### 3. Add new guardrails to `nva-baseline.use.guardrails`

Append (after the existing NVA guardrail entries): `nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial`, `nva.avoidLowYieldBombard`.

### 4. Extend Monsoon suppression to new NVA March templates

Add `nva.marchControl` and `nva.marchInfiltrateControl` to `shared.monsoonOperationalRestriction.suppressesPlanTemplates`, alongside the existing suppressed NVA March templates. This preserves the existing Monsoon doctrine after the new templates are bound.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — `nva-baseline.use` block at `:3088-3109`; Monsoon suppression list for new NVA March templates)
- `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json` (modify — regenerated static coverage manifest after `nva-baseline` binds the new NVA modules)

## Out of Scope

- No removal or reordering of existing bindings.
- No binding changes to other profiles (`arvn-baseline`, `us-baseline`, `vc-baseline`).
- No new witness authoring (ticket 005).
- Reattestation of FITL canaries against the new bindings (ticket 006).

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — profile compiles with new bindings.
2. Existing NVA witnesses pass unchanged: `nva-march-infiltrate-steal-vc-base.test.ts`, `nva-protects-trail-before-coup.test.ts`.
3. Existing suite: `pnpm turbo test` — green.

### Invariants

1. Every binding entry resolves to an artifact authored in tickets 002 or 003, or to a pre-existing artifact (no dangling binding references).
2. The `nva-baseline.use` block keeps its `guardrails`, `strategyModules`, `planTemplates` field structure unchanged (additive only).
3. No duplicate binding entries (e.g., `nva.marchAmbush` listed twice if already bound).
4. `shared.monsoonOperationalRestriction` suppresses the newly bound NVA March templates under Monsoon, matching the existing NVA March-template suppression behavior.

## Test Plan

### New/Modified Tests

None — witnesses authored in ticket 005.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo test --force`
4. `pnpm run check:ticket-deps`

## Outcome (2026-05-31)

Completed the P3 `nva-baseline` binding update from Spec 203 §4.5:

- Added the new NVA guardrails, strategy modules, and plan templates to `nva-baseline.use` without removing, reordering, or duplicating existing profile entries.
- Kept `nva.eventLogisticsOrControlSwing` unbound because no such event template is authored; event doctrine remains covered by `shared.eventDirectSwing`.
- Fixed binding-induced ARVN golden-trace drift by extending `shared.monsoonOperationalRestriction.suppressesPlanTemplates` to include the newly bound NVA March templates (`nva.marchControl`, `nva.marchInfiltrateControl`), preserving the existing Monsoon doctrine for the expanded NVA template set.
- Regenerated `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json` because the newly bound `nva-baseline` modules now statically cover `projectedUsMarginDelta`.

Generated artifact provenance:

- Artifact: `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json`
- Generation command: `env UPDATE_GOLDEN=1 node --test packages/engine/dist/test/architecture/policy-wasm-coverage-manifest.test.js`
- Canonical inputs: the compiled conformance corpus and production FITL profile data, including `data/games/fire-in-the-lake/92-agents.md` / `nva-baseline`
- Refresh reason: new bound NVA modules add the `projectedUsMarginDelta` WASM-row entry for `fire-in-the-lake.nva-baseline`
- Generator retained: `packages/engine/test/architecture/policy-wasm-coverage-manifest.test.ts`

Verification:

- `pnpm turbo build` — passed (cached)
- `node --test packages/engine/dist/test/policy-profile-quality/nva-march-infiltrate-steal-vc-base.test.js packages/engine/dist/test/policy-profile-quality/nva-protects-trail-before-coup.test.js` — passed
- `node --test packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js` — passed after Monsoon suppression repair
- `node --test packages/engine/dist/test/architecture/policy-wasm-coverage-manifest.test.js` — passed after manifest refresh
- `pnpm -F @ludoforge/engine test:unit` — passed (6107 tests, 0 failures)
- `pnpm turbo test --force` — passed (5/5 tasks, 0 cached; engine default lane 189/189 files passed)
- `pnpm run check:ticket-deps` — passed
- `git diff --check -- data/games/fire-in-the-lake/92-agents.md tickets/203FITLNVACOM-004.md packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json .codex/run-state/implement-spec-tickets.json` — passed
- `rg -n "takeControlOnlyWhenTrailing" data/games/fire-in-the-lake/92-agents.md tickets specs` — no hits

Deviation from original plan: the ticket stayed data-only for product behavior, but the proof boundary required one generated manifest refresh and one Monsoon suppression-list addition after live golden-trace evidence showed the new bound March templates could otherwise bypass established Monsoon doctrine.
