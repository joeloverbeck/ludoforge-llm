# 181STRSTRPOL-002: Phase 0 — Probe assertion library

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/test/policy-profile-quality/probes/` only (no engine src changes)
**Deps**: `archive/tickets/181STRSTRPOL-001.md`

## Problem

The probe runner from 001 dispatches assertions by `assertion.kind` but has no kinds implemented. Spec §4.2 enumerates the initial set of assertion kinds that profile-quality probes will need; without them, ticket 003 (ARVN distribution probe) and 004 (constructibility probe) have nothing to assert.

## Assumption Reassessment (2026-05-18)

1. Ticket 001 has landed the runner scaffold; the assertion dispatcher delegates to a `kind`-keyed lookup. Confirmed by 001's Acceptance Criteria.
2. `PolicyAgentDecisionTrace.selectedBy` exists and currently emits values including `'tiebreakAfterPreviewNoSignal'` per Foundation #20 (see `packages/engine/src/agents/policy-eval.ts`). Confirmed by Step 2 verification this session.
3. Spec 180's standing-role primitives (`currentLeader`, `nearestThreat`, `closestAhead`, `closestBehind`) are live (`packages/engine/src/contracts/policy-contract.ts:98-110`) and usable by `selectedSeatTargetMatchesRole`.
4. The selector-dependent assertion `selectedTargetSatisfiesSelector` is reserved here as a kind ID but its evaluator stub returns `error { message: 'selectors not yet available' }` until 006 lands the selector IR — same for `guardrailFired`/`guardrailNotFired` which await Spec 183.

## Architecture Check

1. Each assertion is a pure function over `(selectedCandidate, trace, state, seedAggregate?)`. No side effects, no engine mutation. Deterministic (Foundation #8).
2. Assertions are game-agnostic: they consume canonical trace fields, candidate stable keys, action tags, and standing-role tokens — never FITL- or Hold'em-specific identifiers (Foundation #1).
3. The reserved-but-stubbed selector / guardrail kinds keep the assertion taxonomy stable so probes authored against future selector / guardrail features compile today and execute when the upstream lands. No backward-compatibility shim; the stubs error explicitly.

## What to Change

### 1. Assertion type union

Replace the empty `ProbeAssertion = never` placeholder in `probe-types.ts` with the discriminated union covering the spec §4.2 kinds:

| `kind` | Payload fields |
| --- | --- |
| `selectedCandidateHasTag` | `tag: ActionTagId` |
| `selectedCandidateLacksTag` | `tag: ActionTagId` |
| `selectedCandidateRankWithinTopK` | `k: number` |
| `selectedTargetSatisfiesSelector` | `selector: SelectorId, minRank?: number` *(stubbed — errors until 006)* |
| `selectedSeatTargetMatchesRole` | `role: 'currentLeader' \| 'nearestThreat' \| 'closestAhead' \| 'closestBehind'` |
| `previewRefStatusIn` | `ref: string, allowed: ReadonlyArray<PreviewRefStatus>` |
| `selectedNotByReason` | `reason: SelectedByReason, maxRate?: number` (rate applies only when `occurrence: 'every'`) |
| `actionFamilyDistributionBelow` | `family: 'any' \| { tags: ReadonlyArray<ActionTagId> }, threshold: number, windowMinDecisions: number` (requires `occurrence: 'every'`) |
| `traceContainsField` | `field: string` (dotted path into trace) |
| `traceHasAdvisory` | `code: AdvisoryCode` |
| `traceLacksAdvisory` | `code: AdvisoryCode` |
| `guardrailFired` | `guardrail: GuardrailId` *(stubbed — errors until Spec 183)* |
| `guardrailNotFired` | `guardrail: GuardrailId` *(stubbed — errors until Spec 183)* |

### 2. Assertion evaluators

`probes/assertions/<kind>.ts` per assertion (single-file evaluator). Each evaluator returns `{ outcome: 'pass' } | { outcome: 'fail', reason: string }`. Reasons are deterministic strings ("selected candidate had tag `foo`, expected to lack it"; "rank 4 exceeded k=3").

For aggregate kinds (`actionFamilyDistributionBelow`, `selectedNotByReason` with `maxRate`), the evaluator consumes the full `Array<{candidate, trace, state}>` sequence the runner gathered under `occurrence: 'every'`. Per-decision kinds receive a single `{candidate, trace, state}` triple.

`actionFamilyDistributionBelow` computes the per-family rate from candidate action tags:
- `family: 'any'`: rate of the dominant family (highest-rate tag-set). Fails when dominant rate ≥ `threshold`.
- `family: { tags: [...] }`: rate of candidates whose tag set intersects the named set. Fails when rate ≥ `threshold`.
- Requires `decisions.length ≥ windowMinDecisions`; otherwise emits `error { message: 'insufficient decisions: <N> < <windowMinDecisions>' }`.

### 3. Assertion dispatcher

`probes/assertions/index.ts` exports a `dispatchAssertion(assertion, context): AssertionOutcome` registry keyed on `assertion.kind`. Runner from 001 imports `dispatchAssertion` and calls it once per assertion per match group.

### 4. Per-assertion tests

`probes/assertions/<kind>.test.ts` per assertion. Each test exercises the assertion against a minimal fixture probe whose candidate/trace/state is constructed in-test (no full kernel run needed for unit-level coverage). Aggregate kinds need a fixture sequence of ≥`windowMinDecisions` decisions.

### 5. Reserved-but-stubbed kinds

`selectedTargetSatisfiesSelector`, `guardrailFired`, `guardrailNotFired` evaluators return `error { message: 'requires <upstream-spec> — not yet available' }` and unit tests assert that error explicitly. When 006 (selectors) and Spec 183 (guardrails) land, those tickets MUST replace the stub bodies and update the unit tests in the same change (Foundation #14 — no transitional period beyond what these stubs declare).

## Files to Touch

- `packages/engine/test/policy-profile-quality/probes/probe-types.ts` (modify — replace `ProbeAssertion = never` with the discriminated union)
- `packages/engine/test/policy-profile-quality/probes/assertions/index.ts` (new — dispatcher)
- `packages/engine/test/policy-profile-quality/probes/assertions/selected-candidate-has-tag.ts` (new) + 12 sibling files for the other kinds
- `packages/engine/test/policy-profile-quality/probes/assertions/<kind>.test.ts` per kind (new)

## Out of Scope

- Specific probe data files (003, 004 ship probes that exercise these assertions).
- CI integration / per-probe overhead budget (005).
- Actually wiring the selector / guardrail kinds to live implementations — they remain stubbed here. Live wiring lands in 006 / Spec 183 respectively.

## Acceptance Criteria

### Tests That Must Pass

1. Each non-stubbed assertion has at least one positive (pass) and one negative (fail) unit test exercising its evaluator.
2. Stubbed assertions (`selectedTargetSatisfiesSelector`, `guardrailFired`, `guardrailNotFired`) have a unit test asserting the `error { message: 'requires <upstream-spec> ...' }` outcome.
3. `actionFamilyDistributionBelow` correctly computes dominant-family rate over a fixture decision sequence and reports `insufficient decisions` when the window is short.
4. Dispatcher routes by `kind` exhaustively — TypeScript `assertNever` covers any unhandled kind at compile time.
5. Existing suite: `pnpm turbo test`

### Invariants

1. Assertion evaluators are pure: same inputs → same outputs, no mutation, no I/O (Foundation #8).
2. No assertion evaluator references game-specific identifiers (FITL action tags, Hold'em seat names, etc.) (Foundation #1).
3. Aggregate assertions reject `occurrence: 'first'` / `'nth'` probes at runtime with a clear error.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/probes/assertions/<kind>.test.ts` — one file per assertion kind, positive + negative + edge cases.
2. `packages/engine/test/policy-profile-quality/probes/assertions/dispatch.test.ts` — round-trip dispatch test ensuring every kind is registered.

### Commands

1. `pnpm -F @ludoforge/engine test -- assertions`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-18

What changed:
- Replaced the `ProbeAssertion = never` placeholder with the Phase 0 assertion union and supporting probe assertion ids/status types.
- Added the `probes/assertions/` dispatcher plus per-kind evaluators for tag, rank, selected-reason, action-family distribution, preview-ref status, trace-field, advisory, standing-role target, and reserved selector/guardrail assertions.
- Wired `runProbe` to evaluate assertions for matched decision groups, pass the current state/def into assertion context, and add selected action tags to `ProbeMatch` so tag/family assertions stay data-driven.
- Removed the temporary `occurrence: "every"` validation block now that aggregate assertion kinds are available.
- Added per-kind unit tests and dispatcher coverage with repo-required `@test-class` markers.

Deviations:
- The literal focused command `pnpm -F @ludoforge/engine test -- assertions` is stale in the live package runner; it forwards `assertions` to `run-tests.mjs` and fails with `Could not find 'assertions'`. The equivalent focused compiled test lane used for this ticket was `pnpm -F @ludoforge/engine exec node --test "dist/test/policy-profile-quality/probes/assertions/*.test.js" "dist/test/policy-profile-quality/probes/probe-runner.test.js"` after `pnpm -F @ludoforge/engine build`.
- The implementation added a small shared assertion test helper instead of duplicating synthetic trace fixtures in every assertion test file.

Verification:
- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine test -- assertions` — failed as a stale command shape (`Could not find 'assertions'`); replaced by the focused compiled Node test lane above.
- `pnpm -F @ludoforge/engine exec node --test "dist/test/policy-profile-quality/probes/assertions/*.test.js" "dist/test/policy-profile-quality/probes/probe-runner.test.js"` — passed, 30 tests.
- `pnpm turbo build` — passed.
- `pnpm turbo test` — initially failed only because the new assertion tests lacked `@test-class` markers; after adding markers, rerun passed.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm run check:ticket-deps` — passed after terminal status edit.
- `git diff --check` — passed.
- `rg -n '[ \t]+$' packages/engine/test/policy-profile-quality/probes/assertions` — no trailing whitespace in new assertion files.

Post-review correction:
- Review found that the initial assertion dispatcher did not pass the current state/def even though the ticket defined assertion inputs as candidate/trace/state. The dispatcher now carries `def` and `state`, and `selectedSeatTargetMatchesRole` uses the existing generic standing-role resolver when state is available, with a trace fallback for synthetic unit fixtures.
- Post-review correction verification: `pnpm -F @ludoforge/engine build`, focused assertion/probe-runner Node test lane, `pnpm turbo lint`, and `pnpm turbo typecheck` all passed after the correction. The earlier successful `pnpm turbo test` was not rerun because the correction is confined to the policy-profile-quality probe harness, and the focused probe lane plus rebuild/typecheck exercises the changed compiled output.

Closeout ledgers:
- Ticket graph/status integrity: `pnpm run check:ticket-deps` passed after this terminal status edit.
- Source-size sweep: largest touched/new test/probe source file is `packages/engine/test/policy-profile-quality/probes/probe-runner.ts` at 254 lines; no file is near the 800-line cap.
- Untracked/touched-file hygiene: new `packages/engine/test/policy-profile-quality/probes/assertions/` files are ticket-owned and will be staged with this ticket.
- Post-review: run in this session; the ticket is archive-ready after the state/def assertion-context correction above.
