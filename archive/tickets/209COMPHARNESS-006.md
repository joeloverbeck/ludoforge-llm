# 209COMPHARNESS-006: Proof-tier convention — `testing.md` amendment

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — documentation/convention only
**Deps**: `archive/specs/209-game-agnostic-executed-turn-competence-harness.md`

## Problem

Spec §3.7 + AC#5: structural witnesses are currently mistakable for behavioral competence proof. Add a lightweight `@proof-tier` sub-annotation *inside* the existing 3-class `@test-class` taxonomy (it does not replace it), plus an explicit statement that structural/proposal-level witnesses MUST NOT be counted as behavioral competence proof. The trigger report's parallel 9-category marker system is rejected (it would collide with `@test-class` and violate DRY / FOUNDATIONS #15).

## Assumption Reassessment (2026-06-03)

1. `.claude/rules/testing.md` defines exactly 3 `@test-class` values — `architectural-invariant`, `convergence-witness`, `golden-trace` — confirmed this session. The amendment adds a sub-annotation, not a fourth class.
2. `@proof-tier` does not yet exist anywhere in the repo except specs 209/210 and `IMPLEMENTATION-ORDER.md` — confirmed net-new this session.
3. `testing.md` has no existing "structural ≠ competence proof" statement — confirmed; the amendment adds one.

## Architecture Check

1. Integrating the proof tier as a sub-annotation of the existing taxonomy avoids a duplicate/colliding marker system — the architecturally-complete choice over the rejected parallel taxonomy (FOUNDATIONS #15, DRY).
2. Documentation-only; no engine, kernel, compiler, or runtime impact (FOUNDATIONS #1).
3. The convention is game-agnostic — it classifies *proof strength*, not game content.

## What to Change

### 1. Add the proof-tier sub-annotation

In `.claude/rules/testing.md`, document the optional file-top marker for `policy-profile-quality` tests:

```ts
// @proof-tier: structural | proposal-level | selected-root | executed-outcome | adversarial
```

- `structural` / `proposal-level` map to the existing `architectural-invariant` / `convergence-witness` classes and remain valid regression guards.
- `selected-root`, `executed-outcome`, and `adversarial` are reserved for harness-backed witnesses (Spec 209 harness).
- A competence claim is only "proven" at `executed-outcome` (or `adversarial`) tier.

### 2. Add the "structural ≠ competence proof" statement

State explicitly in `testing.md` that structural / proposal-level witnesses MUST NOT be counted as behavioral competence proof, and that the 9-category marker system from the trigger report is rejected in favor of this sub-annotation.

## Files to Touch

- `.claude/rules/testing.md` (modify)

## Out of Scope

- Applying `@proof-tier` to any existing test (Spec 210 / future work).
- Reclassifying the existing `policy-profile-quality` corpus (deferred — spec §8 "Rejected").
- Any change to the 3-class `@test-class` taxonomy itself.

## Acceptance Criteria

### Tests That Must Pass

1. No automated test (documentation change). Manual verification: `grep -n "@proof-tier" .claude/rules/testing.md` shows the new marker and the five tier values; the "structural ≠ competence proof" statement is present.
2. Existing suite unaffected: `pnpm turbo test` stays green.

### Invariants

1. The `@test-class` taxonomy retains exactly its 3 classes; `@proof-tier` is additive and optional.
2. The amendment introduces no parallel/colliding marker taxonomy (FOUNDATIONS #15, DRY).

## Test Plan

### New/Modified Tests

1. None — convention/documentation only.

### Commands

1. `grep -n "@proof-tier" .claude/rules/testing.md`
2. `pnpm turbo lint`

## Outcome

Completed on 2026-06-03. `.claude/rules/testing.md` now documents the optional
`@proof-tier` sub-annotation under the existing three-class `@test-class`
taxonomy, explicitly rejects the parallel 9-category taxonomy, and states that
structural / proposal-level witnesses MUST NOT be counted as behavioral
competence proof.

Verification:

1. `grep -n "@proof-tier" .claude/rules/testing.md` passed; the marker and tier
   explanation are present.
2. `grep -n "structural ≠ competence proof" .claude/rules/testing.md` passed.
3. `rg -n "@test-class: (architectural-invariant|convergence-witness|golden-trace)|@test-class:" .claude/rules/testing.md` showed only the three existing class examples.
4. `pnpm turbo lint` passed.
5. `pnpm turbo test` passed: 5/5 Turbo tasks successful; engine default lane
   reported `summary 190/190 files passed`.

Deviations: none.
