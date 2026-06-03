# 210FITLCOMP-007: Promote ARVN faction fixtures to executed-outcome tier

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — test-only
**Deps**: `tickets/210FITLCOMP-001.md`

## Problem

ARVN signature fixtures assert structurally. Spec 210 §2(9–11) requires executed-outcome proof for: Train+Govern executing with Patronage increase and bounded Support destruction; Transport rejecting a route that loses origin Control and selecting one that preserves it; and a pre-Coup Troop deployment that evaporates in Coup redeploy being demoted.

## Assumption Reassessment (2026-06-03)

1. Existing ARVN fixtures: `arvn-train-govern-separation.test.ts`, `arvn-govern-active-support-priority.test.ts`, `arvn-govern-patronage-unavailable-demotes.test.ts`, `arvn-transport-refuses-origin-control-loss.test.ts`, `arvn-transport-postState-origin-control-constraint-time.test.ts`, `arvn-precoup-posture-avoids-redeploy-undone.test.ts`. Confirmed.
2. They consume `arvn-plan-witness-helpers.ts` — structural helpers to be superseded.
3. Patronage outcome ref: `var.global.patronage` (used in `92-agents.md`). Transport origin-Control is a postState constraint already modeled in the existing transport fixtures. Confirmed.
4. Promotion pattern established by 001.

## Architecture Check

1. In-place promotion per 001 (FOUNDATIONS #14). Six files grouped under one ticket for faction-state cohesion (curated ARVN board context is shared setup).
2. No engine changes (FOUNDATIONS #1).
3. The Transport constraint proof executes the route and asserts origin Control is preserved post-move — behavioral proof, not a structural constraint-shape check (FOUNDATIONS #16).

## What to Change

### 1. Train+Govern (#9) — `arvn-train-govern-separation.test.ts`, `arvn-govern-active-support-priority.test.ts`, `arvn-govern-patronage-unavailable-demotes.test.ts`

Build curated states where Train+Govern executes; prove Patronage increases and Support destruction is bounded; the patronage-unavailable variant proves Govern is demoted when Patronage cannot increase (adversarial: the Govern move that yields no Patronage).

### 2. Transport origin-control (#10) — `arvn-transport-refuses-origin-control-loss.test.ts`, `arvn-transport-postState-origin-control-constraint-time.test.ts`

Build a curated state with a route that would lose origin Control (adversarial root) and one that preserves it; prove the constraint rejects the losing route and the selected route preserves origin Control post-execution.

### 3. Pre-Coup redeploy avoidance (#11) — `arvn-precoup-posture-avoids-redeploy-undone.test.ts`

Build a near-Coup curated state; prove a Troop deployment that would evaporate in Coup redeploy is demoted in favor of a deployment that survives (adversarial: the evaporating deployment).

### 4. Markers + dead-helper cleanup

Update markers to `@proof-tier: executed-outcome` + `@proof-tier: adversarial`. Prune `arvn-plan-witness-helpers.ts` exports with zero remaining consumers (FOUNDATIONS #14).

## Files to Touch

- `packages/engine/test/policy-profile-quality/arvn-train-govern-separation.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/arvn-govern-active-support-priority.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/arvn-govern-patronage-unavailable-demotes.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/arvn-transport-refuses-origin-control-loss.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/arvn-transport-postState-origin-control-constraint-time.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/arvn-precoup-posture-avoids-redeploy-undone.test.ts` (modify)
- `packages/engine/test/policy-profile-quality/arvn-plan-witness-helpers.ts` (modify — extend / prune dead exports)
- `packages/engine/test/policy-profile-quality/shared-competence-helpers.ts` (read — created by 001)

## Out of Scope

- P1 ARVN fixtures (`arvn-sweep-raid-expose-before-removal`, `arvn-patrol-govern-over-train-when-threatened`) — deferred (spec §5).
- `arvn-transport-rejected-by-reachable.test.ts` (pre-existing reachability witness, not a §2 P0 intent) — leave as-is.
- `92-agents.md` features — ticket 010.

## Acceptance Criteria

### Tests That Must Pass

1. Train+Govern executes; Patronage increases; Support destruction bounded; Govern demoted when Patronage cannot increase.
2. Transport rejects the origin-Control-losing route and preserves origin Control on the executed route.
3. Pre-Coup redeploy: the evaporating Troop deployment is demoted in favor of a surviving one.
4. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/arvn-train-govern-separation.test.js`

### Invariants

1. Each promoted fixture carries `@proof-tier: executed-outcome` + `adversarial`; original path/`describe` preserved (FOUNDATIONS #14).
2. ARVN reaches executed-outcome on its primary victory engine (Patronage/Support) and ≥1 signature combination (spec §4 AC#1).
3. Decisive preview refs `ready` or explicitly traced (FOUNDATIONS #20); replay identity holds (FOUNDATIONS #8).

## Test Plan

### New/Modified Tests

1. The six ARVN fixtures above — promoted to executed-outcome/adversarial tier.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/arvn-train-govern-separation.test.js packages/engine/dist/test/policy-profile-quality/arvn-govern-active-support-priority.test.js packages/engine/dist/test/policy-profile-quality/arvn-govern-patronage-unavailable-demotes.test.js packages/engine/dist/test/policy-profile-quality/arvn-transport-refuses-origin-control-loss.test.js packages/engine/dist/test/policy-profile-quality/arvn-transport-postState-origin-control-constraint-time.test.js packages/engine/dist/test/policy-profile-quality/arvn-precoup-posture-avoids-redeploy-undone.test.js`
2. `pnpm turbo lint typecheck && pnpm turbo test`
