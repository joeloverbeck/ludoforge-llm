# 199COMAVAROO-002: P2 — Proposer integration + trace fields

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents (plan proposer), kernel (plan-trace types)
**Deps**: `archive/tickets/199COMAVAROO-001.md`

## Problem

With the probe primitive available (ticket 001), the proposer (`plan-proposal.ts`) does not yet invoke it. The `compareAlternatives` ranking (`plan-proposal.ts:645-649`) chains three keys (priorityTier → score → stableKey); a `compoundUnavailable` candidate competes equally with a `compoundReady` candidate. The plan trace (`PolicyPlanTraceAlternative` at `kernel/types-plan-trace.ts:9-15`) has no per-candidate availability annotation, so contrastive trace consumers cannot see why one candidate beat another. This ticket wires the probe into proposal-time scoring, inserts the availability tiebreaker into `compareAlternatives`, and surfaces availability on the trace types.

## Assumption Reassessment (2026-05-26)

1. `plan-proposal.ts:122-162` iterates plan-template root candidates and assembles `score: priorityTier + roleScore + considerationScore + posture.scoreDelta` at line 152 — confirmed via Spec 199 reassessment.
2. `compareAlternatives` at `plan-proposal.ts:645-649` uses direct integer subtraction with three keys (priorityTier → score → stableKey); no epsilon math — confirmed. Scores are exact integers per Foundation #8.
3. `PolicyPlanTraceAlternative` (existing) is the per-alternative trace type at `kernel/types-plan-trace.ts:9-15`. The new field `compoundAvailability?: CompoundAvailability` extends this existing type rather than introducing a new `PlanRootCandidateTrace`.
4. `CompiledPlanRoot.compound` carries the metadata at `kernel/types-core.ts:1209`.
5. `PolicyPlanTrace.alternatives` array exists at `kernel/types-plan-trace.ts:87` — the selected candidate's status is reachable through this array without requiring a new top-level field on `PolicyPlanTrace`.

## Architecture Check

1. Tiebreaker is a *terminal-class* lex key — fires only when priorityTier and score tie. Existing `stableKey` remains the deterministic final fallback, preserving replay byte-identity (Foundation #8 + Foundation #16 testing as proof).
2. The probe is best-effort advisory per Foundation #18 — the controller fallback ladder (`plan-controller.ts:28-76`: `exact → reselected → primitiveConsiderationPolicy → stableFrontierTieBreak`) remains the runtime safety net. The proposer does not enforce constructibility; it only ranks against advisory probe output.
3. Engine-agnostic — the per-alternative `compoundAvailability` field is generic; no game-specific branches (Foundation #1).
4. No backwards-compat shims — `compoundAvailability` is an optional field on the existing `PolicyPlanTraceAlternative`; existing trace consumers ignore it. This is the canonical extension shape, not a deprecated-alias path (Foundation #14).
5. Foundation #20 (preview signal integrity) — the trace exposes explicit availability status with provenance via `CompoundAvailability` (from ticket 001); rejected alternatives' statuses are recorded so contrastive trace consumers see why a `compoundReady` candidate beat a higher-scored `compoundUnavailable` one when the tiebreaker fires.

## What to Change

### 1. Invoke the probe in `plan-proposal.ts`

After the existing scoring assembly at `plan-proposal.ts:122-162`, for each candidate whose `template.root.compound` is defined, invoke `probeCompoundAvailability(input.def, input.state, input.seatId, rootDecision, template.root.compound)` and annotate the in-memory `PlanProposalAlternative` with the result. Extend the `PlanProposalAlternative` interface so `compoundAvailability?: CompoundAvailability` is carryable through the ranking pipeline.

When no candidate is `ready` but some are `provisional`, the proposer selects the highest-ranked `provisional` candidate (the controller's fallback ladder handles unavailability at runtime per Foundation #18).

### 2. Insert availability tiebreaker into `compareAlternatives`

Modify the function at `plan-proposal.ts:645-649` to insert the new key between `score` and `stableKey`:

```ts
function compareAlternatives(left: PlanProposalAlternative, right: PlanProposalAlternative): number {
  return right.priorityTier - left.priorityTier
    || right.score - left.score
    || compareCompoundAvailability(left.compoundAvailability, right.compoundAvailability)
    || compareStable(left.stableKey, right.stableKey);
}
```

Define `compareCompoundAvailability` as a deterministic integer comparator using the ordering `ready` (0) > `provisional` (1) > `unavailable` (2) > undefined (3 — non-compound candidates sort neutrally, after compound-tagged candidates only when score ties). Returns positive when left should win, mirroring the sign convention of the existing subtraction-based keys.

### 3. Extend `PolicyPlanTraceAlternative` in `kernel/types-plan-trace.ts`

Add `readonly compoundAvailability?: CompoundAvailability` to `PolicyPlanTraceAlternative` (currently at lines 9-15). The selected candidate's status is reachable through the existing `PolicyPlanTrace.alternatives` array — no separate top-level `selectedCompoundAvailability` field is required unless review feedback prefers explicit surfacing.

### 4. Populate the trace in the proposer

Pipe each candidate's `compoundAvailability` through the alternatives serialization path so `PolicyPlanTraceAlternative` entries carry the field in the emitted trace, including for rejected alternatives.

## Files to Touch

- `packages/engine/src/agents/plan-proposal.ts` (modify — invoke probe in iteration loop, extend `PlanProposalAlternative`, insert tiebreaker, populate trace)
- `packages/engine/src/kernel/types-plan-trace.ts` (modify — extend `PolicyPlanTraceAlternative` with optional `compoundAvailability`)

## Out of Scope

- The probe primitive itself — owned by ticket 001.
- New tests (probe purity, tiebreaker behavior, trace integrity, FITL witness, predict-fallback correspondence) — owned by ticket 003 per spec's P3 bundling.
- Compile-time grant-vocabulary check (P4) — owned by ticket 004.
- Removing or weakening the controller fallback ladder — Foundation #18 mandates the runtime safety net regardless; out of scope per spec §2 Non-Goals.
- A new top-level `selectedCompoundAvailability` field on `PolicyPlanTrace` — defer until review feedback indicates the array-only path is insufficient.

## Acceptance Criteria

### Tests That Must Pass

1. Existing plan-proposal tests pass: `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/plan-proposal*.test.js`.
2. Existing plan-controller architectural invariants pass: `node --test dist/test/architecture/plan-controller-legality-frontier.test.js`.
3. Existing replay / determinism suite byte-identity preserved: `pnpm -F @ludoforge/engine test`.
4. Full suite: `pnpm turbo test`.

### Invariants

1. Existing tier-then-score ordering preserved — availability fires only as a *terminal-class* tiebreaker after exact-integer score equality (Foundation #8).
2. Replay byte-identity preserved — the new optional trace field does not alter trace output for plans whose roots have no `compound` metadata (Foundation #16).
3. Controller fallback ladder (`exact → reselected → primitiveConsiderationPolicy → stableFrontierTieBreak`) is unchanged — Foundation #18 runtime safety net preserved.
4. Engine-agnostic — `compoundAvailability` is a generic per-alternative field; no game-specific branches (Foundation #1).

## Test Plan

### New/Modified Tests

All new tests authored in ticket 003 per the spec's P3 bundling. This ticket modifies source only.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/plan-proposal*.test.js`
2. `node --test dist/test/architecture/plan-controller-legality-frontier.test.js`
3. `pnpm turbo typecheck && pnpm turbo build && pnpm turbo test`

## Outcome (2026-05-26)

Implemented the proposer-side compound availability integration. Plan alternatives now carry optional `compoundAvailability` when their root template has compound metadata, the proposer uses the ticketed `ready > provisional > unavailable > undefined` ordering between exact score and stable-key ordering, and emitted plan traces include the per-alternative field for selected and rejected alternatives.

Implementation details:

- Added `packages/engine/src/agents/plan-proposal-compound-availability.ts` to hold the cap-class helper, root probe adapter, and deterministic availability comparator.
- Updated `packages/engine/src/agents/plan-proposal.ts` to invoke `probeCompoundAvailability` via the helper for compound roots, carry availability through `PlanProposalAlternative`, and rank by tier, score, availability, then stable key.
- Updated `packages/engine/src/agents/plan-trace.ts` to serialize `compoundAvailability` only when present.
- Updated `packages/engine/src/kernel/types-plan-trace.ts` to extend `PolicyPlanTraceAlternative` with optional `compoundAvailability?: CompoundAvailability`.

Deliverable notes and deviations:

- `plan-trace.ts` was touched even though the file list only named proposer and trace type files, because the existing trace builder is the actual serialization owner for `PolicyPlanTraceAlternative` entries.
- The new helper module was added to keep `plan-proposal.ts` below the repository source-size cap while avoiding duplicate cap/probe/ranking helpers.
- No ticket-003 tests were added; P3 coverage remains intentionally owned by `tickets/199COMAVAROO-003.md`.
- No compile-time grant vocabulary changes were made; P4 remains owned by `tickets/199COMAVAROO-004.md`.
- No controller fallback behavior changed.

Source-size ledger:

- `packages/engine/src/agents/plan-proposal.ts`: 796 lines before, 794 lines after, active growth -2, crossed cap: no. Extraction rationale: moved cap-limit and availability comparator/probe adapter helpers out of the already-near-cap proposer.
- `packages/engine/src/agents/plan-proposal-compound-availability.ts`: new 59-line helper, crossed cap: no.
- `packages/engine/src/agents/plan-trace.ts`: 44 lines after, crossed cap: no.
- `packages/engine/src/kernel/types-plan-trace.ts`: 93 lines after, crossed cap: no.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test dist/test/unit/agents/plan-proposal*.test.js` from `packages/engine` — passed, 13 tests.
- `node --test dist/test/architecture/plan-controller-legality-frontier.test.js` from `packages/engine` — passed, 3 tests.
- `pnpm -F @ludoforge/engine test` — passed, 176/176 files.
- `pnpm turbo typecheck` — passed, 3/3 tasks.
- `pnpm turbo build` — passed, 3/3 tasks; runner build emitted existing chunk-size warnings only.
- `pnpm turbo test` — passed, 5/5 tasks; engine default suite passed 176/176 files.

Command substitutions:

- Ticket command 1 was split into a serial build followed by the compiled Node test invocation so the Node test used fresh `dist/` output.
- Ticket command 3 was run as separate serial commands (`pnpm turbo typecheck`, `pnpm turbo build`, `pnpm turbo test`) to isolate failures and preserve clear proof evidence.

Generated artifact fallout: none committed. Build/test output stayed in ignored generated locations.
