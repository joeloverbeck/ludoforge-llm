# FITLSEC4RULGAP-005: Advise Viability Authoring Contract

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Possibly none; if needed, generic viability support only
**Deps**: reports/fire-in-the-lake-rules-section-4.md, reports/fire-in-the-lake-rules-section-5.md, data/games/fire-in-the-lake/20-macros.md, data/games/fire-in-the-lake/30-rules-actions.md

## Problem

The current FITL `Advise` authoring does not encode an explicit viability contract beyond geographic space selection plus optional Aid. That makes free-operation usability sensitive to generic probe behavior rather than to a clearly authored FITL rule contract. If `Advise` should remain usable whenever at least one geographic space can be selected, that should be explicit and regression-locked. If `Advise` should require at least one space with a meaningful per-space branch, that requirement should be authored in `GameSpecDoc`, not inferred by kernel special-casing.

## Assumption Reassessment (2026-03-12)

1. In `data/games/fire-in-the-lake/20-macros.md`, `advise-select-spaces` currently filters only by map geography and requires `min: 1`; it does not encode “meaningful branch available in selected space”.
2. In `data/games/fire-in-the-lake/30-rules-actions.md`, `advise-profile` always offers per-space mode choices after space selection and then separately offers optional `+6 Aid`.
3. FITL rules extracts confirm that `Advise` includes a separate Aid rider, but they do not unambiguously settle whether `Advise` is legal when no selected space can perform a meaningful Sweep/Assault/activate-remove effect. Current code/tests therefore do not justify silently hardcoding either interpretation in the generic engine.
4. The earlier MACV investigation showed that if `Advise` semantics need tightening, the correction belongs first in FITL `GameSpecDoc` authoring and tests, not in `GameDef`/kernel special cases.

## Architecture Check

1. The clean architecture is to encode FITL-specific `Advise` legality in FITL data. Generic free-operation viability should only consume the declared action/profile contract.
2. `GameDef` and simulation remain game-agnostic. Any FITL-specific notion of a “meaningful Advise space” must live in `GameSpecDoc` action/profile authoring, not in runtime branches keyed on `advise` or FITL seats.
3. No backwards-compatibility aliasing is needed. Choose one canonical `Advise` viability interpretation, author it explicitly, and update tests accordingly.

## What to Change

### 1. Resolve the canonical FITL `Advise` viability interpretation

Use the FITL rules extracts already in `reports/fire-in-the-lake-rules*` to make the ticket’s rule assumption explicit:

- either `Advise` is legal whenever at least one non-North-Vietnam province/city can be selected and optional Aid may still be taken,
- or `Advise` requires at least one selected space with a meaningful per-space branch.

Record that decision in the ticket before implementation so code/tests do not drift on ambiguous assumptions.

### 2. Encode the chosen contract in FITL data authoring

If the current authoring is too permissive, update FITL `GameSpecDoc` so `advise` space selection and/or profile legality explicitly models the chosen legality contract.

If the current behavior is intended, add explicit regression coverage that locks the permissive contract and documents why.

Any implementation must stay declarative in FITL data first. Only introduce kernel work if a generic capability is truly missing and can be expressed without FITL-specific branching.

### 3. Add grant-viability and direct-action regressions

Add tests that cover both:

- direct `advise` action legality,
- free-operation issuance/viability scenarios where `advise` affects event usability decisions such as `MACV`.

The same authored contract must hold in both ordinary action discovery and free-operation probing.

## Files to Touch

- `data/games/fire-in-the-lake/20-macros.md` (modify if legality/filter authoring changes)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify if profile legality/targeting changes)
- `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-macv.test.ts` (modify)
- `packages/engine/test/integration/fitl-option-matrix.test.ts` or another FITL legality-surface test (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify only if a missing generic capability is proven necessary)

## Out of Scope

- Game-specific branches in the kernel keyed on `advise`, `MACV`, FITL factions, or FITL card IDs.
- Visual presentation changes in `visual-config.yaml`.
- Reworking unrelated FITL special activities.

## Acceptance Criteria

### Tests That Must Pass

1. The ticket states one explicit canonical FITL interpretation for `Advise` viability and implementation matches that interpretation.
2. Direct `advise` legality/discovery and free-operation usability probing agree for the chosen contract.
3. `MACV` and any other affected FITL free-operation event behavior reflects the authored `Advise` contract without engine-side FITL hacks.
4. Existing suite: `pnpm turbo test` passes.

### Invariants

1. FITL-specific legality semantics for `Advise` are authored in FITL `GameSpecDoc`, not in generic kernel branching.
2. If kernel changes are needed, they provide generic action/profile viability support reusable by any game, with no FITL identifiers in agnostic layers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` — pin the chosen direct-action legality contract for edge-case `Advise` states.
2. `packages/engine/test/integration/fitl-events-macv.test.ts` — verify `MACV` free-operation issuance matches the chosen `Advise` viability semantics.
3. `packages/engine/test/integration/fitl-option-matrix.test.ts` or equivalent legality-surface coverage — ensure action discovery and grant probing stay aligned.

### Commands

1. `pnpm -F @ludoforge/engine test -- fitl-us-arvn-special-activities.test.ts fitl-events-macv.test.ts fitl-option-matrix.test.ts`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test`
