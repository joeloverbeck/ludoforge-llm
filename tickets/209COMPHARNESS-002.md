# 209COMPHARNESS-002: Plan-trace-chain assertion helper

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test infrastructure only
**Deps**: `tickets/209COMPHARNESS-001.md`

## Problem

Spec §3.2: the harness must assert the ordered plan-trace chain for the turn under test — doctrine active → template eligible → root candidate present in frontier → **selected** root → compound-availability status → role binding → microturn resolution → executed outcome — consuming the existing Spec 200 trace records without adding new trace fields. This proves the agent's *selection* was driven by the intended doctrine/template/role path, not an accidental match.

## Assumption Reassessment (2026-06-03)

1. `PolicyPlanTrace` (`packages/engine/src/kernel/types-plan-trace.ts`) exposes `status` (`'selected' | 'noTemplate' | 'noEligibleTemplate' | 'noRootMatch' | 'noRoleBinding'`), `activeDoctrines`, `selectedTemplate`, `selectedRootStableMoveKey`, `roleBindingStatuses`, `alternatives`, `posture`, and `microturns?` — confirmed this session.
2. `PolicyPlanMicroturnTrace.match` is `'exact' | 'reselected' | 'fallback'`; **`primitive`/`stable` are NOT match values** — they are `PlanMicroturnFallbackReason.kind` values (`primitiveConsiderationPolicyFallback` / `stableFrontierTieBreakFallback`), carried in `fallbackReason`. The helper must assert against `match` + `fallbackReason.kind`, not a four-value ladder (this was corrected in the spec reassessment).
3. Compound-availability status (`ready` / `provisional` / `unavailable`) comes from `plan-proposal-compound-availability.ts` — confirmed.
4. The runner (001) already surfaces `planTrace` and `microturnTraces`; this helper is pure assertion over those records (no re-run, no new fields).

## Architecture Check

1. Consumes only existing Spec 200 trace records — adds no trace fields and no engine change (FOUNDATIONS #15).
2. Game-agnostic: asserts the structural chain by trace shape (doctrine ids, template id, role binding statuses, match/fallback kinds) — the *values* are supplied by the fixture, the helper carries no game identifiers (FOUNDATIONS #1).
3. Asserts strategic chain integrity, not a single arbitrary stable key — mitigates the brittle-overfitting risk (spec §5).

## What to Change

### 1. Plan-trace-chain assertion helper

`packages/engine/test/helpers/competence/plan-trace-chain.ts`:
- Accepts the runner result's `planTrace` + `microturnTraces` and an expectation object `{ activeDoctrine?, eligibleTemplate?, selectedRootStableMoveKey?, compoundAvailability?, roleBinding?, microturnMatch?: { match, fallbackReasonKind? } }`.
- Asserts, in order: the expected doctrine is in `activeDoctrines`; the template is `selectedTemplate` (and was eligible, not in `filteredOutTemplates`); the selected root's stable move key is present in the published frontier (cross-checked against the runner's frontier) and equals `selectedRootStableMoveKey`; the compound-availability status matches; the role binding resolved with the expected status (`roleBindingStatuses`); the microturn resolution `match` (and `fallbackReason.kind` when `match === 'fallback'`) matches.
- Fails loudly (not vacuously) when any expected link is absent.

### 2. Barrel export

Append the helper export to `packages/engine/test/helpers/competence/index.ts`.

## Files to Touch

- `packages/engine/test/helpers/competence/plan-trace-chain.ts` (new)
- `packages/engine/test/helpers/competence/index.ts` (modify — append one export; serialize with sibling tickets)

## Out of Scope

- Adding or modifying any kernel trace field (Spec 200 already delivers the records).
- The reference fixture exercising this helper — ticket 007 (per spec AC#2). This helper's behavioral exercise attaches to 007's reference fixture; no standalone `.test.ts` here.
- Cross-family use: this helper is exercised on FITL only (sole corpus game configuring plan templates) — see 007 / spec AC#3.

## Acceptance Criteria

### Tests That Must Pass

1. Exercised by ticket 007's reference fixture: the helper passes when given a real FITL run whose trace matches the expected doctrine→template→root→availability→role→microturn chain, and fails when any expected link is absent or mismatched.
2. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit`

### Invariants

1. The helper asserts against `match` ∈ {exact, reselected, fallback} and `fallbackReason.kind`, never a non-existent `primitive`/`stable` match value.
2. No game-specific identifier in the helper body (FOUNDATIONS #1).
3. The selected root is verified present in the kernel-published frontier (FOUNDATIONS #18).

## Test Plan

### New/Modified Tests

1. None standalone — behavioral exercise lands in `packages/engine/test/architecture/competence-harness-reference.test.ts` (ticket 007) per spec AC#2's single-reference-fixture bundling.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine typecheck`
2. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
