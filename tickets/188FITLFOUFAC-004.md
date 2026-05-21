# 188FITLFOUFAC-004: ARVN guardrails (errors-to-avoid)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — Tier-1 YAML authoring only
**Deps**: `archive/tickets/188FITLFOUFAC-003.md`

## Problem

Spec 188 §4.1 authors the ARVN "errors to avoid" as guardrails in `data/games/fire-in-the-lake/92-agents.md`. These prune/demote moves that would damage the ARVN position — serving a US win, breaching the aid/econ floor, governing away support everywhere, losing origin control via Transport, over-committing troops pre-Coup without a base, or fighting low-yield highlands. Without them the authored plan structure (ticket 003) can still select self-harming moves.

## Assumption Reassessment (2026-05-21)

1. The `guardrails` library bucket exists in `92-agents.md` (line ~349); `GuardrailDef` supports `scopes` (`move`/`microturn`), severities (`prune`/`demote`/`warn`/`auditOnly`), and `onAllPruned` fallback (confirmed during Spec 188 reassessment).
2. `arvn-evolved` currently binds one guardrail (`dropPassWhenOtherMovesExist`); this ticket adds six and binds them to the profile.
3. Guardrail conditions reference the authored ARVN selectors/state features from ticket 003 — that is why this ticket depends on 003.

## Architecture Check

1. Guardrails are generic declarative pruning rules — FITL semantics live entirely in the authored conditions, not in engine code (Foundation #1).
2. Preserves agnostic boundaries — all in `data/games/fire-in-the-lake/`.
3. No backwards-compatibility shims; additive guardrails plus profile binding.

## What to Change

### 1. Author the six ARVN guardrails

Add `arvn.doNotServeUSWin`, `arvn.preserveAidEconFloor`, `arvn.doNotGovernAwaySupportEverywhere`, `arvn.doNotLoseOriginControlByTransport`, `arvn.doNotOvercommitTroopsPreCoupWithoutBase`, `arvn.doNotFightLowYieldHighlands` to the guardrails bucket. Conditions/severities per report §ARVN errors to avoid (`reports/fitl-competent-agent-ai.md` ~line 624).

### 2. Bind to the ARVN profile

Add the six guardrails to the `arvn-evolved` profile `use.guardrails` list (line ~736), alongside the existing `dropPassWhenOtherMovesExist`.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)

## Out of Scope

- ARVN posture/relationships (005), legacy demotion (006), witnesses (007), and all other factions (008–010).
- Do not delete or alter the v2 considerations here — that is ticket 006.

## Acceptance Criteria

### Tests That Must Pass

1. FITL GameDef compiles with the six new guardrails bound to ARVN (no diagnostics).
2. Existing suite: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. Determinism preserved — byte-identical compile on repeat (Foundation #16).
2. No engine/compiler diff (Foundation #1).
3. Guardrail conditions reference only existing selectors/state features (no dangling refs).

## Test Plan

### New/Modified Tests

1. No new test files — guardrail-firing behavior is asserted by the ARVN witnesses in ticket 007.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/`
2. `pnpm turbo test`
