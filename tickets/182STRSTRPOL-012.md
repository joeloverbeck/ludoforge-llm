# 182STRSTRPOL-012: Phase 3 — Guardrail profile-quality lint warnings (`RARELY_SAFE` + `FIRES_UNIFORM`)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — compiler-side lint + audit-harness-side lint
**Deps**: `archive/tickets/182STRSTRPOL-011.md`

## Problem

Spec 182 §5.3 + §8 + §10 introduce two profile-quality lint warnings:
- `POLICY_PROFILE_QUALITY_GUARDRAIL_RARELY_SAFE` — fires at compile time when a `severity: prune` guardrail's `when` clause does NOT transitively reach any state-scoped feature (signal: the guardrail might fire on most or all candidates, erasing the frontier — exactly Spec 144's pass-fallback failure mode that authors should be steered away from invoking lightly).
- `POLICY_PROFILE_QUALITY_GUARDRAIL_FIRES_UNIFORM` — fires when the audit harness observes a `severity: demote` guardrail firing on 100% of candidates across a probe corpus (relative ranking unaffected; constant-shift effective; signal that the guardrail isn't selecting anything).

Both follow the `POLICY_PROFILE_QUALITY_REGRESSION` precedent (non-blocking CI, profile-maintainer signal — per Foundation #8 + FOUNDATIONS Appendix).

## Assumption Reassessment (2026-05-18)

1. `POLICY_PROFILE_QUALITY_REGRESSION` is the established non-blocking lint precedent (per FOUNDATIONS Appendix); the two new warnings follow that pattern.
2. `RARELY_SAFE` is a compile-time check: trace `when` clause's ref reachability through compile-time dependency graph (already available via `dependencies` field on compiled expressions).
3. `FIRES_UNIFORM` is runtime-observed: requires the probe harness from Spec 181 to count guardrail firings across a corpus. The check runs against the conformance corpus established in ticket 011.
4. The "weight-soup lint" warnings from proposal §11.2 are explicitly out of scope per spec §10 (Spec 183 work).

## Architecture Check

1. `RARELY_SAFE` lives in `compile-agents.ts` or the dependency-tracker (locate during implementation); generic — no game-specific identifiers (Foundation #1).
2. `FIRES_UNIFORM` lives in the audit harness (`packages/engine/test/policy-profile-quality/probes/`); profile-quality signal, not blocking CI (Foundation #8 separation).
3. Both warnings respect Foundation #16 — they're proven via tests in this ticket.
4. No backwards-compatibility shim — both are net-new warning paths.

## What to Change

### 1. RARELY_SAFE compile-time check

In `compile-agents.ts` (or sibling): after compiling a `severity: prune` guardrail, walk its `when` clause dependency graph. If no transitive dependency reaches a state-scoped feature (or candidate-bound condition that varies across candidates), emit `POLICY_PROFILE_QUALITY_GUARDRAIL_RARELY_SAFE` as a non-blocking warning.

Locate the existing `POLICY_PROFILE_QUALITY_*` warning emission path for the precedent.

### 2. FIRES_UNIFORM audit-harness check

Add an assertion kind to the probe harness (`packages/engine/test/policy-profile-quality/probes/`): `guardrailFiresUniformAcross` (or similar). Configure with a threshold (e.g., 100% firing across N decisions in the probe corpus → warn).

Integrate into the existing probe-runner so any guardrail-using profile observes the rate.

### 3. Lint tests

- `RARELY_SAFE` positive-trigger test: a fixture guardrail with a `when` clause that depends only on time-invariant refs emits the warning.
- `RARELY_SAFE` negative-trigger test: a fixture guardrail with a `when` clause that depends on a state-scope feature does NOT emit the warning.
- `FIRES_UNIFORM` positive-trigger test: a fixture guardrail authored to always fire (`when: true`) emits the warning when observed across a probe corpus.
- `FIRES_UNIFORM` negative-trigger test: a fixture guardrail with selective firing does NOT emit the warning.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify — `RARELY_SAFE` check) or sibling dependency-tracker
- `packages/engine/test/policy-profile-quality/probes/` (modify — add `FIRES_UNIFORM` assertion kind)
- `packages/engine/test/unit/cnl/guardrail-rarely-safe-lint.test.ts` (new)
- `packages/engine/test/policy-profile-quality/guardrail-fires-uniform-lint.test.ts` (new — locate appropriate test location during implementation)

## Out of Scope

- Other weight-soup lint warnings from proposal §11.2 (Spec 183 work; spec §10 explicit).
- Module / turn-shape lint (out of scope for this ticket).

## Acceptance Criteria

### Tests That Must Pass

1. New `guardrail-rarely-safe-lint.test.ts` — positive-trigger + negative-trigger.
2. New `guardrail-fires-uniform-lint.test.ts` — positive-trigger + negative-trigger.
3. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`.

### Invariants

1. Both lint warnings are non-blocking (Foundation #8 separation; FOUNDATIONS Appendix).
2. `RARELY_SAFE` is compile-time; deterministic given identical profile YAML.
3. `FIRES_UNIFORM` is runtime-observed via probe harness; deterministic given identical seed + state.
4. No game-specific logic in lint code (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/guardrail-rarely-safe-lint.test.ts`
2. `packages/engine/test/policy-profile-quality/guardrail-fires-uniform-lint.test.ts`

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/cnl/guardrail-rarely-safe-lint.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/guardrail-fires-uniform-lint.test.js`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
