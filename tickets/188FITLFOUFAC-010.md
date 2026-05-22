# 188FITLFOUFAC-010: VC skeleton + headline witnesses (port of 008)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — Tier-1 YAML authoring only
**Deps**: `archive/tickets/188FITLFOUFAC-008.md`, `archive/tickets/188FITLFOUFAC-009.md`, `archive/tickets/188FITLFOUFAC-010A.md`

## Problem

Spec 188 §4.2 / Phase 2 authors the VC faction personality as a correct skeleton: doctrine set + signature plan templates (Rally+Subvert, March+Subvert, Terror+Subvert, Terror+Tax, March+Ambush-from-LoC, Rally-reset→Terror) + key role selectors + top errors-to-avoid guardrails + relationship wiring (NVA/VC rival-ally per report §5.2). This is a **port** of the US skeleton ticket (008), listing only VC-specific content.

## Assumption Reassessment (2026-05-21)

1. `vc-baseline` is the current VC profile binding (`92-agents.md` ~line 778); this ticket authors the VC skeleton and rebinds the VC seat.
2. The skeleton-authoring structure is established by ticket 008 — follow it verbatim, substituting VC content.
3. The NVA/VC relationship (report §5.2) is the counterpart of NVA's wiring completed in `archive/tickets/188FITLFOUFAC-009.md` — keep the two sides consistent.

## Live Reassessment (2026-05-22)

1. A live `010` implementation probe authored the VC YAML skeleton and the two ticket-named warning-class witnesses. `pnpm -F @ludoforge/engine build` and the focused compiled VC witnesses passed.
2. The broad acceptance lane then exposed a generic architecture blocker: `pnpm -F @ludoforge/engine test:all` stalled after `dist/test/architecture/policy-evaluation-context-constructor-invariant.test.js`; isolated `node --test packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js` timed out after 120 seconds with only `TAP version 13`.
3. Per `docs/FOUNDATIONS.md`, this ticket cannot close by weakening its broad-suite proof, under-authoring the VC signature skeleton, or adding FITL-specific runtime code. The approved reset inserted `archive/tickets/188FITLFOUFAC-010A.md` as a generic prerequisite before VC skeleton authoring resumes.
4. The abandoned VC YAML/test probe was removed before the retarget handoff; this ticket remains `PENDING` and owns no landed partial implementation yet.

## Architecture Check

1. Port pattern — references ticket 008's structure; only VC-specific content differs.
2. Pure YAML, generic constructs (Foundation #1, #2).
3. No backwards-compatibility shims.

## What to Change

### 1. VC skeleton (follow ticket 008's shape)

Author VC doctrine carriers (priority stack report ~line 923; final statement ~line 1119), signature templates (combos ~lines 971-1053), key selectors (target features ~line 1055), top guardrails (errors ~line 1107), and the VC side of the NVA/VC relationship (report §5.2, ~line 1172). Rebind the VC seat.

### 2. Headline witnesses

Add Phase-2 VC headline witnesses: VC avoids conventional Attack unless Ambush payoff; VC protects bases from NVA Infiltrate.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `packages/engine/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.ts` (new)
- `packages/engine/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.ts` (new)

(Witness paths follow the `policy-profile-quality/` convention; may be consolidated.)

## Out of Scope

- ARVN (003–007), US (008), NVA (009).
- Full VC fidelity beyond the skeleton.
- Generic parity-witness performance or boundedness work exposed by the live VC skeleton probe; that is owned by `archive/tickets/188FITLFOUFAC-010A.md`.

## Acceptance Criteria

### Tests That Must Pass

1. FITL GameDef compiles with the VC skeleton bound to the VC seat (no diagnostics).
2. The two VC headline witnesses pass.
3. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. Determinism preserved — byte-identical compile on repeat (Foundation #16).
2. No engine/compiler diff (Foundation #1).
3. VC headline witnesses are warning-class (live in `policy-profile-quality/`).

## Test Plan

### New/Modified Tests

1. `vc-avoids-conventional-attack-without-ambush.test.ts`, `vc-protects-bases-from-nva-infiltrate.test.ts` — Phase-2 VC headline witnesses.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/vc-avoids-conventional-attack-without-ambush.test.js packages/engine/dist/test/policy-profile-quality/vc-protects-bases-from-nva-infiltrate.test.js`
2. `pnpm turbo test`
