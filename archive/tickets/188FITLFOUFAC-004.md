# 188FITLFOUFAC-004: ARVN guardrails (errors-to-avoid)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — Tier-1 YAML authoring only
**Deps**: `archive/tickets/188FITLFOUFAC-003.md`, `archive/tickets/188FITLFOUFAC-004A.md`

## Problem

Spec 188 §4.1 authors the ARVN "errors to avoid" as guardrails in `data/games/fire-in-the-lake/92-agents.md`. These prune/demote moves that would damage the ARVN position — serving a US win, breaching the aid/econ floor, governing away support everywhere, losing origin control via Transport, over-committing troops pre-Coup without a base, or fighting low-yield highlands. Without them the authored plan structure (ticket 003) can still select self-harming moves.

## Assumption Reassessment (2026-05-21)

1. The `guardrails` library bucket exists in `92-agents.md` (line ~349); `GuardrailDef` supports `scopes` (`move`/`microturn`), severities (`prune`/`demote`/`warn`/`auditOnly`), and `onAllPruned` fallback (confirmed during Spec 188 reassessment).
2. `arvn-evolved` currently binds one guardrail (`dropPassWhenOtherMovesExist`); this ticket adds six and binds them to the profile.
3. Guardrail conditions reference the authored ARVN selectors/state features from ticket 003 — that is why this ticket depends on 003.

## Approved Boundary Reset (2026-05-21)

User approved option 1 after Foundations reassessment: keep the behavioral `demote` guardrails and sequence a generic WASM guardrail-demotion parity prerequisite before closing this ticket.

Live proof from the 004 draft showed the YAML lane can compile and the policy-profile-quality lane can be truthed, but `pnpm -F @ludoforge/engine test:all` is red because the TypeScript policy score path applies a guardrail demotion that the WASM score-row path does not. The decisive failure was `arvn-tournament-wasm-equivalence`: decision 22 kept the same `govern` action, but the `sweep` candidate scored `8000` in TypeScript and `8300` in WASM.

This ticket still owns only the ARVN authored guardrails and profile binding. `archive/tickets/188FITLFOUFAC-004A.md` owns the generic engine/WASM parity prerequisite; do not close or archive this ticket until 004A lands and this ticket's acceptance commands are rerun.

004A landed in the same implementation pass and the acceptance commands were rerun green.

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
- Generic WASM guardrail-demotion parity — that is owned by `archive/tickets/188FITLFOUFAC-004A.md`.
- Do not delete or alter the v2 considerations here — that is ticket 006.

## Acceptance Criteria

### Tests That Must Pass

1. FITL GameDef compiles with the six new guardrails bound to ARVN (no diagnostics).
2. Existing suite: `pnpm -F @ludoforge/engine test:all`.
3. `archive/tickets/188FITLFOUFAC-004A.md` is completed first, so the guardrail demotions are scored consistently across TypeScript and WASM policy paths.

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

## Implementation Notes (2026-05-21)

Added the six ARVN `demote` guardrails and bound them to `arvn-evolved`. The authored guardrails required additive state/candidate features for current and projected US/ARVN margin deltas.

The guardrail behavior changed the fixed ARVN seed trajectory, so the existing seed-1001 recovery fixture, the Spec 162 ARVN witness expectation, the prefer-patronage migration witness, and the seed-1008 inner-preview outcome fixture were truthed to the new deterministic trajectory.

## Proof (2026-05-21)

1. `pnpm -F @ludoforge/engine build` — passed.
2. `pnpm -F @ludoforge/engine test:policy-profile-quality` — passed, 36/36.
3. `node --test packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js` — passed.
4. `node --test packages/engine/dist/test/unit/agents/migration-equivalence-prefer-patronage.test.js` from `packages/engine` — passed.
5. `pnpm -F @ludoforge/engine test:all` — passed, 957/957.
