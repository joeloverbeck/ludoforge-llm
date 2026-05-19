# 182STRSTRPOL-012: Phase 3 — Guardrail profile-quality lint warnings (`RARELY_SAFE` + `FIRES_UNIFORM`)

**Status**: COMPLETED
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

## Outcome

Completed: 2026-05-19

What changed:
- Added `POLICY_PROFILE_QUALITY_GUARDRAIL_RARELY_SAFE` as a non-blocking compiler warning for `severity: prune` guardrails whose compiled dependency metadata has no state feature, candidate feature, aggregate, or selector dependency.
- Kept the compile-time warning in `compile-agent-guardrails.ts`, the guardrail compiler sibling, instead of growing the oversized `compile-agents.ts` orchestration file.
- Added the probe assertion kind `guardrailFiresUniformAcross`, which fails with `POLICY_PROFILE_QUALITY_GUARDRAIL_FIRES_UNIFORM` when a guardrail fires at or above the configured rate over an `occurrence: every` decision window.
- Added focused positive/negative tests for both lint surfaces and dispatcher coverage for the new assertion kind.

Deviations from original plan:
- The `RARELY_SAFE` check uses the already-compiled direct dependency metadata for the guardrail expression: state features, candidate features, aggregates, and selectors count as selective. It does not add a new recursive strategic-condition expansion pass because no current compiler dependency object exposes that contract directly.
- `FIRES_UNIFORM` is represented as an audit-harness assertion outcome, matching the existing profile-quality probe pattern, rather than a compiler diagnostic.

Verification:
- `pnpm -F @ludoforge/engine build` — passed after the final source/test shape.
- `node --test packages/engine/dist/test/unit/cnl/guardrail-rarely-safe-lint.test.js` — passed, 2 tests.
- `node --test packages/engine/dist/test/policy-profile-quality/guardrail-fires-uniform-lint.test.js` — passed, 2 tests.
- `node --test packages/engine/dist/test/policy-profile-quality/probes/assertions/dispatch.test.js` — passed, 1 test.
- `pnpm -F @ludoforge/engine test` — passed, default package lane summary `98/98 files passed`.
- `pnpm turbo build` — passed, 3/3 tasks successful.
- `pnpm turbo lint` — passed, 2/2 tasks successful.
- `pnpm turbo typecheck` — passed, 3/3 tasks successful.
- `pnpm turbo test` — passed, 5/5 tasks successful; engine default lane summary `98/98 files passed`; runner lane passed `205` files and `2019` tests.

Terminal closeout:
- `post-review handoff`: ready for post-ticket review and archival by the spec-ticket harness.
- `ticket graph/status integrity`: to be rechecked after archival because this ticket still has an active-path spec reference until the archive move occurs.
- `source-size decision`: production files remain below guidance in the touched seam: `compile-agent-guardrails.ts` is 279 lines and `compiler-diagnostic-codes.ts` is 438 lines. New files are 89, 62, and 29 lines.
- `untracked/touched-file hygiene`: tracked `git diff --check`, ticket dependency checks, and stale active-path sweeps are part of the post-review archival step.
- `proof lane classification`: focused lint tests, package engine suite, and root turbo build/test/lint/typecheck are green.
- `terminal status allowed`: every named deliverable is implemented or explicitly classified above.
