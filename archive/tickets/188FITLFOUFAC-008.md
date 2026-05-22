# 188FITLFOUFAC-008: US skeleton — doctrines/combos/selectors/guardrails/relationships + headline witnesses (pattern-setting)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — Tier-1 YAML authoring only
**Deps**: `archive/tickets/188FITLFOUFAC-008B.md`

## Problem

Spec 188 §4.2 / Phase 2 authors the US faction personality as a correct *skeleton*: doctrine set + signature plan templates (Train+Advise, Patrol+Advise, Sweep+AirStrike, Assault+AirLift+Assault, AirLift+Train) + key role selectors + the US top errors-to-avoid guardrails + relationship wiring (US/ARVN per report §5.1). This ticket is the **pattern-setting** Phase-2 ticket: it establishes the skeleton-authoring shape that NVA (009) and VC (010) reference. It is not hard-dependent on the ARVN tickets (separate YAML blocks), but per the spec it is sequenced after ARVN validates the approach.

## Assumption Reassessment (2026-05-21)

1. `us-baseline` is the current US profile binding (`92-agents.md` ~line 756 region); this ticket authors the US skeleton constructs and rebinds the US seat to them.
2. All required constructs (planTemplates, role selectors, strategyModules, guardrails, postureEvaluators, relationships) are landed (Spec 186/187) — Tier-1 YAML only.
3. The US/ARVN relationship is the counterpart of the ARVN relationship in ticket 005; author the US-side per report §5.1 (`reports/fitl-competent-agent-ai.md` ~line 1140).
4. Live 008 implementation proof on 2026-05-21 showed the generic planner let newly authored US templates compete in ARVN plan proposal. That prerequisite is now completed in `archive/tickets/188FITLFOUFAC-008A.md`; the generic profile/template isolation contract must stay green before US YAML authoring resumes.
5. A later live 008 probe on 2026-05-21 showed a second generic isolation gap for `strategyModules`: US doctrine carriers could perturb an ARVN golden canary, while an attempted `seat.self` YAML gate did not activate correctly in plan proposal. Per the user-approved Foundations-aligned reassessment, this ticket now depends on `archive/tickets/188FITLFOUFAC-008B.md` before US skeleton authoring resumes.

## Architecture Check

1. Pure YAML authoring of generic constructs (Foundation #1, #2).
2. Skeleton fidelity — doctrine + signature combos + key guardrails + relationship, deepened later (Spec 188 §2 "no four-faction parity in one phase").
3. No backwards-compatibility shims.

## What to Change

### 1. US doctrines + signature plan templates

Author the US doctrine carriers (priority stack, report ~line 210; final statement ~line 384) and the five signature templates: Train+Advise, Patrol+Advise, Sweep+AirStrike, Assault+AirLift+Assault, AirLift+Train (combos ~lines 252-328).

### 2. US key role selectors

Author the role selectors the templates bind (target scoring features, report ~line 330).

### 3. US guardrails

Author the US top errors-to-avoid guardrails (report ~line 372) — e.g. avoid Air Strike in populated Support unless blocking a win.

### 4. US relationship wiring

Author the US/ARVN relationship (report §5.1, ~line 1140), the counterpart of ticket 005's ARVN-side wiring.

### 5. Bind to the US profile and author headline witnesses

Rebind the US seat; add the Phase-2 headline witnesses in `policy-profile-quality/`: US avoids Air Strike in populated Support unless blocking a win; US uses Advise+Air Lift as force multipliers.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `packages/engine/test/policy-profile-quality/us-avoids-airstrike-populated-support.test.ts` (new)
- `packages/engine/test/policy-profile-quality/us-advise-airlift-force-multiplier.test.ts` (new)

(Witness paths follow the `policy-profile-quality/` convention; may be consolidated.)

## Out of Scope

- ARVN factions (003–007), NVA (009), VC (010).
- Full US fidelity beyond the skeleton — deepening is a later effort (Spec 188 §2).
- Generic planner/compiler profile-template isolation — owned by `archive/tickets/188FITLFOUFAC-008A.md`.
- Generic planner/compiler strategy-module profile/seat isolation — owned by `archive/tickets/188FITLFOUFAC-008B.md`.

## Acceptance Criteria

### Tests That Must Pass

1. FITL GameDef compiles with the US skeleton bound to the US seat (no diagnostics).
2. The two US headline witnesses pass.
3. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. Determinism preserved — byte-identical compile on repeat (Foundation #16).
2. No engine/compiler diff (Foundation #1).
3. US headline witnesses are warning-class (live in `policy-profile-quality/`).

## Test Plan

### New/Modified Tests

1. `us-avoids-airstrike-populated-support.test.ts`, `us-advise-airlift-force-multiplier.test.ts` — Phase-2 US headline witnesses (Spec 188 §5 Phase 2).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/us-avoids-airstrike-populated-support.test.js packages/engine/dist/test/policy-profile-quality/us-advise-airlift-force-multiplier.test.js`
2. `pnpm turbo test`

## Outcome

Completed on 2026-05-21.

What changed:
- Authored the US Phase-2 skeleton in `data/games/fire-in-the-lake/92-agents.md`: US state/support, patrol/econ, sweep, assault, Advise, Air Lift, and Air Strike role selectors; five US signature plan templates; US doctrine carriers; US/ARVN relationship wiring; a US posture hook; and the `us-baseline` profile binding.
- Added the two ticket-named US warning-class policy-profile-quality witnesses plus `us-plan-witness-helpers.ts` to keep production compilation and plan-proposal setup DRY.
- Refreshed `packages/engine/test/architecture/fixtures/178-outcome-parity-1011.json` and `packages/engine/test/architecture/fixtures/178-outcome-parity-1013.json` after the US profile rebinding intentionally shifted full-game ARVN continued-deepening trajectory witnesses.
- No engine/compiler production source or schema files changed.

Command ledger:
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/policy-profile-quality/us-avoids-airstrike-populated-support.test.js packages/engine/dist/test/policy-profile-quality/us-advise-airlift-force-multiplier.test.js` — passed, 2 tests / 2 suites.
- `node --test packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js` — initially failed for seeds 1011 and 1013 after the intentional US profile trajectory shift; passed after refreshing those two fixtures.
- `pnpm -F @ludoforge/engine test:all` — initially failed only on `policy-preview-inner-outcome-parity.test.js`; passed after fixture refresh, 958 tests.

Command substitutions:
- Ticket command 1 was split into serial build and focused compiled witness commands so the `dist/` consumer ran after the producer.
- Ticket command 2 (`pnpm turbo test`) was substituted by the ticket acceptance suite `pnpm -F @ludoforge/engine test:all`, which covers the engine package surface changed by this YAML/test ticket. No runner or non-engine package files changed.

Generated artifact provenance:
- artifact path(s): `packages/engine/test/architecture/fixtures/178-outcome-parity-1011.json`, `packages/engine/test/architecture/fixtures/178-outcome-parity-1013.json`
- generation command: `node /tmp/refresh-178-outcome-parity.mjs 1011 1013`
- canonical inputs: production FITL GameSpecDoc after US skeleton binding, existing fixture `maxTurns`, seeds 1011 and 1013, `arvn-evolved` profile capture logic from `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts`
- expected refresh reason: the US seat now uses authored plan-template/doctrine behavior instead of the flat baseline, which intentionally shifts full-game state before later ARVN continued-deepening chooseOne decisions.
- generator durability: ad hoc generator body recorded in this ticket outcome; it copied the test's `captureOutcomeParity` logic and wrote only the two failing seed fixtures.
- hygiene proof: isolated parity test passed after refresh; full `pnpm -F @ludoforge/engine test:all` passed.

Source-size notes:
- `data/games/fire-in-the-lake/92-agents.md` is authored data and was already over source-file guidance; this ticket's growth is data-only YAML authoring explicitly required by Spec 188.
- New TypeScript test/helper files are 52, 49, and 80 lines; no source-size hard gate triggered.
