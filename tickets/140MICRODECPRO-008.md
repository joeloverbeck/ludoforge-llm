# 140MICRODECPRO-008: D9 — Policy profile migration (Categories A + B mechanical, FITL + Texas)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — game-data YAML only
**Deps**: `tickets/140MICRODECPRO-007.md`, `tickets/140MICRODECPRO-002.md`

## Problem

Ticket 007 deletes the Phase 1 / Phase 2 two-phase scoring machinery and reshapes `evaluatePolicyExpression` to take a `microturnContext` instead of a move + completion pair. Every existing policy-profile expression must be either:

- **Category A** — already microturn-compatible; no change.
- **Category B** — mechanically rewriteable; apply the I2-documented transform.

Category C (requires re-evolution) is handled in ticket 009.

## Assumption Reassessment (2026-04-20)

1. Ticket 002's I2 audit (`campaigns/phase3-microturn/profile-migration-audit.md`) has landed and classifies every expression in FITL and Texas profile files by category.
2. Ticket 007's agent API rewrite is complete — `evaluatePolicyExpression` is the canonical evaluator.
3. FITL profile file `data/games/fire-in-the-lake/92-agents.md` contains 5 profiles at ticket 002 audit time (per reassessment), but the I2 audit re-reads the file at ticket 008 start — `us-evolved` may have landed via a concurrent campaign and must be migrated if present.
4. Texas profile file `data/games/texas-holdem/92-agents.md` is a sparse skeleton — migration is near-trivial, likely fully Category A.

## Architecture Check

1. Evolution-first (F2): profiles are game-specific data in YAML. Migration preserves semantic intent while adapting to the new evaluation API.
2. Engine-agnostic (F1): no engine changes — all work is in `data/games/<game>/92-agents.md` files.
3. F14 compliant: migration is same-change (atomic) — old expression forms do not coexist with new forms. Every expression in every profile is rewritten in a single commit.
4. Correctness verification: T12 (ticket 014) asserts migrated expressions evaluate equivalently to pre-migration expressions at the action-selection microturn, within floating-point tolerance.

## What to Change

### 1. Re-read and refresh I2 audit

Read `campaigns/phase3-microturn/profile-migration-audit.md` (from ticket 002). Re-grep the profile files to check for profiles added since ticket 002 landed (e.g., `us-evolved` if the US campaign resumed). If new profiles or expressions are found, extend the audit doc in the same commit.

### 2. Apply Category A changes (no-op, verification only)

For every expression classified Category A, verify the expression text is preserved exactly. No-change verification is part of the ticket to ensure regression tests catch accidental edits.

### 3. Apply Category B mechanical transforms

For each Category B expression, apply the documented transform. Typical transforms (per spec 140 I2):

- `candidate.param.<key>` references → `microturnContext.accumulatedBindings[<key>]` where applicable.
- `option.value` references → `microturnContext.options[n].metadata.<field>` with array-index resolution driven by the microturn-kind.
- `decision.name` references → `microturnContext.decisionKey` (for chooseOne) or `microturnContext.decisionContextKind` (for kind-discriminating expressions).

Each transform is reviewable as a YAML-diff hunk in the profile file.

### 4. Flag Category C profiles

For each Category C expression, leave the expression in place with an explicit YAML comment:

```yaml
# spec-140-category-c: requires re-evolution (see ticket 140MICRODECPRO-009)
# original-expression: <copy of pre-migration expression>
```

Category C profiles are not yet functional after this ticket; ticket 009 re-evolves them.

### 5. Update profile metadata

Each migrated profile gains a metadata field `microturnMigration: 'spec-140'` indicating the expression set is microturn-native. Absent for Category C profiles until ticket 009 re-evolves them.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — all profiles except Category C expressions)
- `data/games/texas-holdem/92-agents.md` (modify — likely minimal)
- `campaigns/phase3-microturn/profile-migration-audit.md` (refresh if profile set changed since ticket 002)

## Out of Scope

- Category C re-evolution — ticket 009.
- Engine code changes.
- Agent API changes (ticket 007).
- Certificate machinery retirement — ticket 012.
- T12 (profile migration correctness) test — ticket 014.

## Acceptance Criteria

### Tests That Must Pass

1. Profile YAML parses cleanly under the existing compiler: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit` for profile parse tests.
2. Any profile fully migrated (not Category C) runs green through `runGame` with seed 123 — bounded termination preserved.
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` all green.

### Invariants

1. Every Category A + B expression is migrated in this commit; no pre-migration syntax survives in non-C profiles.
2. Every Category C expression is explicitly tagged in a YAML comment and retains its pre-migration form for later re-evolution.
3. FITL corpus seed 123 game does not throw — PolicyAgent with migrated profile successfully chooses decisions at every microturn.

## Test Plan

### New/Modified Tests

- T12 (profile migration correctness) is authored in ticket 014. No new tests in this ticket.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit` — profile parse tests.
3. Spot-test: `pnpm -F @ludoforge/engine test:e2e` for any corpus that exercises FITL profile seed 123.
4. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
