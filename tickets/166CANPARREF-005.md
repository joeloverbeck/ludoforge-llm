# 166CANPARREF-005: Trace plumbing through microturn option eval and policy-agent per-candidate channel

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/microturn-option-eval.ts`, `packages/engine/src/agents/microturn-option-evaluator.ts`, `packages/engine/src/agents/policy-agent.ts`
**Deps**: `archive/tickets/166CANPARREF-003.md`, `archive/tickets/166CANPARREF-004.md`

## Problem

Ticket 004 introduced `EvaluationCandidate.unknownCandidateParamRefs` and ticket 003 introduced consideration-level `candidateParamFallback` lowering. Now those signals must flow:

- `unknownCandidateParamRefs` must propagate uniformly through the per-option result tuple at `microturn-option-eval.ts:28-29` into the aggregation at `microturn-option-evaluator.ts:40-41`.
- A new `candidateParamFallbackFired` map (keyed by consideration id, mirroring `previewFallbackFired` and `lookupFallbackFired`) must be populated whenever a consideration's `candidateParamFallback.onUnavailable` fires because of an unavailable `candidate.params.*` ref.
- `policy-agent.ts`'s `traceCandidatesForFrontier` (or analogous) must emit the parallel channel + counter alongside `unknownPreviewRefs` / `unknownLookupRefs` / `previewFallbackFired` / `lookupFallbackFired`.
- Aggregated breakdown counters under existing analytics names extend uniformly so consumers do not need bespoke per-game instrumentation.

## Assumption Reassessment (2026-05-11)

1. `microturn-option-eval.ts:28-29` carries the per-option result tuple. Ticket 004 already added an empty `unknownCandidateParamRefs: new Map()` stub here.
2. `microturn-option-evaluator.ts:40-41` aggregates per-option results into per-candidate trace structures. Mirrors of `unknownPreviewRefs` and `unknownLookupRefs` aggregation live there.
3. `policy-agent.ts`'s candidate-trace emission threads the unknown-refs maps and fallback-fired counters into the trace output consumed by analytics, replay, and profile-quality witness assertions. The exact function name (`traceCandidatesForFrontier` or close analogue) is to be re-confirmed during implementation; the threading pattern is consistent across the preview / lookup channels.
4. Existing fallback-fired counters live alongside `unknownPreviewRefs` in the trace object. The new `candidateParamFallbackFired` field uses identical shape (`Map<considerationId, number>`).
5. Ticket 003's `candidateParamFallback` compiled-consideration field is read by the aggregation site here — when a consideration's `value` evaluates to unavailable because of a candidate-param ref, the runtime applies the consideration's `candidateParamFallback.onUnavailable` and bumps `candidateParamFallbackFired[considerationId]`.

## Architecture Check

1. **Uniform tuple shape (Foundation #15).** The per-option result tuple already carries `unknownPreviewRefs` and `unknownLookupRefs`; the new field rides on the same plumbing. No bespoke per-game branching, no parallel struct hierarchy.
2. **Provenance honesty (Foundation #9 / Foundation #20).** Every unavailable ref produces a trace record with explicit family attribution. Mixing `previewFallbackFired`, `lookupFallbackFired`, and `candidateParamFallbackFired` lets analytics distinguish "the value would have been unavailable because of preview" from "because of a missing candidate param" — critical when reasoning about whether a profile depends too heavily on one channel.
3. **No silent coercion (Foundation #20).** A consideration whose `candidate.params.*` ref resolves to unavailable and whose `candidateParamFallback` is `noContribution` produces a recorded `candidateParamFallbackFired` entry with the consideration id and a contribution of 0. The trace consumer sees the fallback fired; it is never invisible.
4. **Generic aggregation (Foundation #1 / Foundation #6).** The aggregation site does not learn FITL-specific param identifiers; it routes refs by family discriminant and consideration id only.

## What to Change

### 1. Per-option result tuple

In `packages/engine/src/agents/microturn-option-eval.ts:28-29`, the empty `unknownCandidateParamRefs: new Map()` stub introduced by ticket 004 is now populated by the dispatch path. Verify that the resolver-returned map from each per-option evaluation is plumbed into the tuple (mirror the preview / lookup threading pattern). No new types here — the field already exists from ticket 004.

Add `candidateParamFallbackFired: Map<string, number>` to the per-option result tuple alongside the existing `previewFallbackFired` / `lookupFallbackFired` maps. Default empty.

### 2. Aggregation at `microturn-option-evaluator.ts:40-41`

Extend the aggregation that merges per-option result tuples into a per-candidate trace structure:

- Union the `unknownCandidateParamRefs` maps across the per-option tuples for a given candidate. Key conflicts (same ref id reported by multiple options) follow the existing resolution rule used for `unknownPreviewRefs` and `unknownLookupRefs` (typically last-write-wins or insertion-stable; preserve whichever the sibling channels use).
- Sum `candidateParamFallbackFired` counts per consideration id across per-option tuples.
- Surface both into the candidate's aggregated trace structure under the existing per-candidate breakdown.

### 3. `policy-agent.ts` per-candidate channel + counter

In `traceCandidatesForFrontier` (or whatever the policy-agent's candidate-trace emission entry point is called), thread the new map + counter into the trace output. Mirror the existing `unknownPreviewRefs` and `previewFallbackFired` plumbing:

- `unknownCandidateParamRefs` on the per-candidate trace block.
- `candidateParamFallbackFired` on the per-candidate trace block (per-consideration breakdown).
- Aggregated frontier-level breakdown counters: extend the existing analytics aggregator that surfaces `previewFallbackFiredCount` / `lookupFallbackFiredCount` to also emit `candidateParamFallbackFiredCount`.

### 4. Apply `candidateParamFallback.onUnavailable` at consideration evaluation

When a consideration's `value` evaluates to `unavailable` AND the cause is a `candidate.params.*` ref (i.e., the consideration's tracked `unknownCandidateParamRefs` set is non-empty for this candidate), apply `candidateParamFallback.onUnavailable`:

- `noContribution` → contribution 0; record `candidateParamFallbackFired[considerationId] += 1`.
- `{ constant: <number> }` → contribution = `<number>`; record `candidateParamFallbackFired[considerationId] += 1`.

Mixed-surface considerations (whose unavailable cause involves both `candidate.params.*` and preview/lookup refs) fire each relevant family's fallback per the existing mixed-surface convention (each family's fallback fires independently when its refs are unavailable; the consideration's overall contribution is determined by the existing arithmetic-with-fallbacks pipeline). No new policy here — extend the mixed-surface block uniformly.

### 5. Architectural-invariant test for trace propagation

`packages/engine/test/architecture/candidate-param-refs/candidate-params-trace-aggregation.test.ts` (new):

- Header: `// @test-class: architectural-invariant`.
- Construct a synthetic frontier with two candidates, one carrying the param, one not. Consideration declares `candidateParamFallback: { onUnavailable: noContribution }`.
- Assert: the candidate carrying the param produces a ready ref with `provenance: 'publishedCandidate'`; the candidate missing the param produces an `unknownCandidateParamRefs` entry AND `candidateParamFallbackFired[considerationId] === 1`.
- Assert: aggregated frontier-level `candidateParamFallbackFiredCount === 1`.
- Assert: `unknownPreviewRefs.size === 0` and `unknownLookupRefs.size === 0` (Foundation #20).

### 6. Determinism extension

Extend `candidate-params-determinism.test.ts` (introduced by ticket 004) with a sub-case that replays a frontier where one consideration's `candidateParamFallback` fires; assert byte-identical `candidateParamFallbackFired` map and count across replay runs.

## Files to Touch

- `packages/engine/src/agents/microturn-option-eval.ts` (modify)
- `packages/engine/src/agents/microturn-option-evaluator.ts` (modify)
- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-trace-aggregation.test.ts` (new)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-determinism.test.ts` (modify — add fallback-fired sub-case)

## Out of Scope

- FITL `event` action declaration and FITL-specific golden traces — owned by ticket 006.
- Cookbook documentation of the new trace surface — owned by ticket 007 (mentioned briefly there; the canonical surface description lives in the spec).
- Per-game analytics dashboards or runner-side visualization — out of repo scope.

## Acceptance Criteria

### Tests That Must Pass

1. `candidate-params-trace-aggregation.test.ts` — propagation + fallback-fired counting works end-to-end.
2. `candidate-params-determinism.test.ts` (extended) — `candidateParamFallbackFired` map is replay byte-identical.
3. Existing suite: `pnpm turbo test` — full pass; no regression in preview / lookup fallback-fired aggregation.

### Invariants

1. For every per-candidate trace block, exactly one of `{ ready resolution in considerations[].refs[] with provenance: 'publishedCandidate' }` OR `{ entry in unknownCandidateParamRefs with reason }` OR `{ ready ref with status: 'missing', resolvedValue: <constant> via onMissing constant }` is produced per evaluated `candidate.params.<name>` ref. No double-counting.
2. `candidateParamFallbackFired[considerationId]` increments by exactly 1 each time a consideration's `candidateParamFallback.onUnavailable` fires for a given candidate; aggregation across per-option tuples sums these counts deterministically (Foundation #8).
3. Mixed-surface considerations fire each family's fallback independently. A consideration with unavailable preview ref AND unavailable candidate-param ref bumps BOTH `previewFallbackFired[id]` AND `candidateParamFallbackFired[id]`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/candidate-param-refs/candidate-params-trace-aggregation.test.ts` — new, asserts per-candidate + frontier-level aggregation.
2. `packages/engine/test/architecture/candidate-param-refs/candidate-params-determinism.test.ts` — modify to add fallback-fired byte-identity sub-case.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test --test-name-pattern=candidate-params`
3. `pnpm turbo test`
4. `pnpm turbo lint`
5. `pnpm run check:ticket-deps`
