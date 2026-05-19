# 182STRSTRPOL-011: Phase 3 — Guardrail conformance tests (4 severity tiers)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — new conformance test files under `packages/engine/test/integration/agents/`
**Deps**: `archive/tickets/182STRSTRPOL-010.md`

## Problem

Spec 182 Phase 3 acceptance (b)-(d) require one conformance test per severity tier (`prune` with `safe: true` + `onAllPruned`, `demote`, `warn`, `auditOnly`) plus a replay-determinism test for a guardrail-using profile. These run against the migrated FITL profile (post-ticket-010) and verify the severity dispatch + trace contracts work end-to-end.

## Assumption Reassessment (2026-05-18)

1. Ticket 010 migrates FITL's `dropPassWhenOtherMovesExist` to `severity: prune, safe: true, onAllPruned: pass` — confirmation that the migrated rule still produces the expected decisions is part of this ticket's `prune` conformance test.
2. For `demote`, `warn`, `auditOnly` conformance: author minimal fixture profiles (small game-agnostic fixtures or extend the FITL test profile) since the migrated FITL data only exercises `severity: prune`.
3. Determinism test infrastructure under `packages/engine/test/determinism/` is the precedent for the replay-determinism check.

## Architecture Check

1. Conformance tests use the kernel-published frontier + trace shape exclusively (Foundation #5 One Rules Protocol).
2. Trace assertions reference `guardrails.fired`, `guardrails.notFiredTop`, `guardrails.allPrunedFallback` — fields defined by tickets 007/008/009.
3. Replay-determinism test asserts bit-identical canonical serialized state across two runs (Foundation #8, #16).
4. No game-specific logic in test driver code; per-game fixtures live in test data.

## What to Change

### 1. `severity: prune` conformance

Test that the post-migration FITL `dropPassWhenOtherMovesExist` guardrail:
- Prunes `pass` candidates when `aggregate.hasNonPassAlternative` is true.
- Publishes the `onAllPruned` pass-fallback frame when the post-prune frontier is empty (synthetic state forcing this).
- Trace records `POLICY_GUARDRAIL_ALL_PRUNED_FALLBACK` with the correct `guardrailId` and `actionId`.

### 2. `severity: demote` conformance

Author a small fixture profile with one `severity: demote` guardrail (e.g., demote candidates where `condition.X.satisfied` is false). Assert:
- Candidate's final score subtracts the declared `penalty`.
- Trace records `guardrails.fired` entry with `severity: 'demote'` and the actual penalty value.
- Ranking changes accordingly (the demoted candidate moves down).

### 3. `severity: warn` conformance

Author a small fixture profile with one `severity: warn` guardrail. Assert:
- Candidate score is unchanged (zero score effect).
- Trace records `guardrails.fired` entry with `severity: 'warn'`.

### 4. `severity: auditOnly` conformance

Author a small fixture profile with one `severity: auditOnly` guardrail. Assert:
- Candidate score is unchanged.
- Trace records a probe-visible marker (`guardrails.fired` entry with `severity: 'auditOnly'`).
- The probe harness (Spec 181 §4) observes the marker.

### 5. Replay-determinism test

Test that a guardrail-using profile (post-migration FITL works) produces bit-identical canonical serialized state across two runs at the same seed. Reuse the existing determinism infrastructure pattern.

## Files to Touch

- `packages/engine/test/integration/agents/guardrail-conformance-prune.test.ts` (new)
- `packages/engine/test/integration/agents/guardrail-conformance-demote.test.ts` (new)
- `packages/engine/test/integration/agents/guardrail-conformance-warn.test.ts` (new)
- `packages/engine/test/integration/agents/guardrail-conformance-audit-only.test.ts` (new)
- `packages/engine/test/determinism/guardrail-replay-determinism.test.ts` (new)
- Optionally: small fixture profiles under `packages/engine/test/fixtures/` for demote/warn/auditOnly cases (avoid bloating FITL profile with test-only constructs)

## Out of Scope

- Profile-quality lint warnings (ticket 012).
- Texas Hold'em conformance (out of Spec 182 scope per §2).
- Module + turn-shape conformance (Phases 2, 4).

## Acceptance Criteria

### Tests That Must Pass

1. New `guardrail-conformance-prune.test.ts` — prune severity end-to-end including fallback frame.
2. New `guardrail-conformance-demote.test.ts` — penalty subtraction + trace marker.
3. New `guardrail-conformance-warn.test.ts` — trace marker + zero score effect.
4. New `guardrail-conformance-audit-only.test.ts` — probe-visible marker + zero score effect.
5. New `guardrail-replay-determinism.test.ts` — bit-identical decisions across two runs.
6. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`.

### Invariants

1. Each severity tier produces its declared runtime + trace effect, no more, no less.
2. `warn` and `auditOnly` produce zero score effect (assertions).
3. Replay determinism holds across two runs of guardrail-using profile (Foundation #8).
4. No game-specific code in test drivers (Foundation #1).

## Test Plan

### New/Modified Tests

1. Four conformance tests (one per severity tier).
2. One replay-determinism test.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/agents/guardrail-conformance-*.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/determinism/guardrail-replay-determinism.test.js`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-19

What changed:
- Added the four requested guardrail conformance files under `packages/engine/test/integration/agents/`, plus a shared synthetic guardrail fixture.
- `guardrail-conformance-prune.test.ts` covers both the migrated production FITL `dropPassWhenOtherMovesExist` guardrail and a synthetic `onAllPruned` pass-fallback frame.
- `guardrail-conformance-demote.test.ts`, `guardrail-conformance-warn.test.ts`, and `guardrail-conformance-audit-only.test.ts` cover the declared score/trace effects for each severity tier.
- Added `packages/engine/test/determinism/guardrail-replay-determinism.test.ts` to assert byte-identical guardrail decisions/traces across two same-seed evaluations.
- Replaced the stale probe-harness guardrail assertion stubs with real `guardrailFired` / `guardrailNotFired` trace checks; the auditOnly conformance test proves the marker is probe-visible.

Deviations from original plan:
- The fallback-frame proof uses a small synthetic guardrail fixture, while the production FITL assertion covers the migrated prune behavior on a real FITL frontier. This keeps the fallback edge deterministic without forcing a fragile production state shape where FITL naturally has only `pass`.
- The existing `guardrail-pass-fallback.test.ts` remains as a sibling integration test; this ticket adds the named conformance file rather than replacing that earlier proof.

Verification:
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/integration/agents/guardrail-conformance-*.test.js packages/engine/dist/test/determinism/guardrail-replay-determinism.test.js packages/engine/dist/test/policy-profile-quality/probes/assertions/guardrail-fired.test.js packages/engine/dist/test/policy-profile-quality/probes/assertions/guardrail-not-fired.test.js` — passed, 11 tests.
- `pnpm -F @ludoforge/engine test` — passed, default package lane summary `98/98 files passed`.
- `pnpm turbo lint` — passed, 2/2 tasks successful.
- `pnpm turbo typecheck` — passed, 3/3 tasks successful.
- `pnpm turbo build` — passed, 3/3 tasks successful.
- `pnpm turbo test` — passed, 5/5 tasks successful; engine default lane summary `98/98 files passed`.
- `pnpm run check:ticket-deps` — passed for 7 active tickets and 2439 archived tickets.

Terminal closeout:
- `post-review handoff`: post-ticket review run by the spec-ticket harness; archived after no must-fix-now cleanup was required.
- `ticket graph/status integrity`: `pnpm run check:ticket-deps` passed after terminal status edit.
- `source-size decision`: not triggered; new/modified source test files are below repo guidance and no production source file grew.
- `untracked/touched-file hygiene`: `git status --short`, tracked `git diff --check`, and untracked trailing-whitespace scan were clean before archival.
- `proof lane classification`: focused conformance/replay/probe assertions, package engine suite, and root turbo build/test/lint/typecheck are green.
- `terminal status allowed`: every named deliverable is implemented or explicitly covered by the synthetic/production split above.
