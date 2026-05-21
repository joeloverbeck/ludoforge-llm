# 188FITLFOUFAC-007: ARVN profile-quality witnesses

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/188FITLFOUFAC-003.md`, `archive/tickets/188FITLFOUFAC-004.md`, `tickets/188FITLFOUFAC-005.md`, `tickets/188FITLFOUFAC-006.md`

## Problem

Spec 188 §5 Phase 1 acceptance (b) and §6 require profile-quality witnesses proving the authored ARVN personality behaves per the competence report. These witnesses span tickets 003–006 (plan structure, guardrails, posture/relationships, demotion), so they attach here — the ticket that completes the ARVN behavior. The `arvn-train-govern-separation.test.ts` witness already exists from Spec 186 and is NOT re-authored; this ticket adds the remaining behaviors alongside it.

## Assumption Reassessment (2026-05-21)

1. `packages/engine/test/policy-profile-quality/` exists; tests there emit `POLICY_PROFILE_QUALITY_REGRESSION` warnings and are warning-class non-blocking per the FOUNDATIONS Appendix (confirmed during Spec 188 reassessment).
2. `arvn-train-govern-separation.test.ts` already passes (Spec 186); do not duplicate the Train+Govern-separation behavior.
3. Tests are property-form where possible (e.g. "Govern target population ≥ alternative unless emergency") and witness-form (`@test-class: convergence-witness` + `@witness:`) where seed-specific, per `.claude/rules/testing.md`.

## Architecture Check

1. Foundation #16 — the authored personalities are proven by automated witnesses, not assumed.
2. Witnesses live in `policy-profile-quality/` (not `determinism/`) so they are profile-quality signals, not blocking determinism proofs (FOUNDATIONS Appendix).
3. Property-form witnesses are preferred to seed-pinned ones to avoid trajectory-shift re-bless tax (`.claude/rules/testing.md` distillation guidance).

## What to Change

### 1. Author the remaining ARVN witnesses

One witness per accepted behavior (Spec 188 §5b), excluding the already-covered Train+Govern separation:
- Govern prefers high-pop Active Support before low-pop Passive Support except emergency.
- US rival-risk flip when US near win (exercises ticket 005 relationship).
- Patrol+Govern beats Train+Govern when LoCs/Econ threatened.
- Sweep+Raid exposes before removal.
- Transport refuses origin-control loss (exercises ticket 004 guardrail).
- Pre-Coup posture avoids redeploy-undone Troop placement.

Use constructed scenarios; property-form assertions where the property holds across seeds, witness-form where seed-specific. Mark each file with the appropriate `@test-class` marker.

## Files to Touch

- `packages/engine/test/policy-profile-quality/arvn-govern-active-support-priority.test.ts` (new)
- `packages/engine/test/policy-profile-quality/arvn-us-rival-risk-flip.test.ts` (new)
- `packages/engine/test/policy-profile-quality/arvn-patrol-govern-over-train-when-threatened.test.ts` (new)
- `packages/engine/test/policy-profile-quality/arvn-sweep-raid-expose-before-removal.test.ts` (new)
- `packages/engine/test/policy-profile-quality/arvn-transport-refuses-origin-control-loss.test.ts` (new)
- `packages/engine/test/policy-profile-quality/arvn-precoup-posture-avoids-redeploy-undone.test.ts` (new)

(Paths follow the existing `policy-profile-quality/` naming convention, glob-confirmed against siblings like `arvn-train-govern-separation.test.ts`. Final filenames may be consolidated where one constructed scenario proves multiple properties.)

## Out of Scope

- Re-authoring `arvn-train-govern-separation.test.ts`.
- US/NVA/VC witnesses (authored in tickets 008–010 alongside each faction).
- No engine/compiler changes — these witnesses must pass against the YAML authored in 003–006 with no engine diff.

## Acceptance Criteria

### Tests That Must Pass

1. Each new ARVN witness passes against the authored v3 ARVN library.
2. `arvn-train-govern-separation.test.ts` still passes (unchanged).
3. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. Witnesses are warning-class (live in `policy-profile-quality/`, emit `POLICY_PROFILE_QUALITY_REGRESSION`), not blocking determinism proofs.
2. No engine/compiler diff introduced by adding these tests (Foundation #1).
3. Each witness carries a valid `@test-class` marker (`.claude/rules/testing.md`).

## Test Plan

### New/Modified Tests

1. The six witness files above — each proves one Spec 188 §5b ARVN behavior.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/`
2. `pnpm turbo test`
