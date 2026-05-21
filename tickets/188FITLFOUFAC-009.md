# 188FITLFOUFAC-009: NVA skeleton + headline witnesses (port of 008)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — Tier-1 YAML authoring only
**Deps**: `tickets/188FITLFOUFAC-008.md`

## Problem

Spec 188 §4.2 / Phase 2 authors the NVA faction personality as a correct skeleton: doctrine set + signature plan templates (Rally+Infiltrate, March+Infiltrate, March+Ambush, Attack+Ambush, Terror→Rally, LoC-occupation) + key role selectors + top errors-to-avoid guardrails + relationship wiring (NVA/VC rival-ally per report §5.2). This is a **port** of the US skeleton ticket (008): it follows the same authoring shape, listing only NVA-specific content.

## Assumption Reassessment (2026-05-21)

1. `nva-baseline` is the current NVA profile binding (`92-agents.md` ~line 756); this ticket authors the NVA skeleton and rebinds the NVA seat.
2. The skeleton-authoring structure (how doctrines/templates/selectors/guardrails/relationships lay out in `92-agents.md`) is established by ticket 008 — follow it verbatim, substituting NVA content.
3. The NVA/VC relationship (report §5.2) is the counterpart of VC's wiring in ticket 010.

## Architecture Check

1. Port pattern — references ticket 008's structure; only NVA-specific doctrines/combos/selectors/guardrails/relationship differ.
2. Pure YAML, generic constructs (Foundation #1, #2).
3. No backwards-compatibility shims.

## What to Change

### 1. NVA skeleton (follow ticket 008's shape)

Author NVA doctrine carriers (priority stack report ~line 687; final statement ~line 871), signature templates (combos ~lines 731-808), key selectors (target features ~line 810), top guardrails (errors ~line 859), and the NVA/VC relationship (report §5.2, ~line 1172). Rebind the NVA seat.

### 2. Headline witnesses

Add Phase-2 NVA headline witnesses: March+Infiltrate when VC base stealable and VC near win; protects Trail before Coup.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `packages/engine/test/policy-profile-quality/nva-march-infiltrate-steal-vc-base.test.ts` (new)
- `packages/engine/test/policy-profile-quality/nva-protects-trail-before-coup.test.ts` (new)

(Witness paths follow the `policy-profile-quality/` convention; may be consolidated.)

## Out of Scope

- ARVN (003–007), US (008), VC (010).
- Full NVA fidelity beyond the skeleton.

## Acceptance Criteria

### Tests That Must Pass

1. FITL GameDef compiles with the NVA skeleton bound to the NVA seat (no diagnostics).
2. The two NVA headline witnesses pass.
3. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. Determinism preserved — byte-identical compile on repeat (Foundation #16).
2. No engine/compiler diff (Foundation #1).
3. NVA headline witnesses are warning-class (live in `policy-profile-quality/`).

## Test Plan

### New/Modified Tests

1. `nva-march-infiltrate-steal-vc-base.test.ts`, `nva-protects-trail-before-coup.test.ts` — Phase-2 NVA headline witnesses.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/`
2. `pnpm turbo test`
