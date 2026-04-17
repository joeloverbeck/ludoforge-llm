# 132AGESTUVIA-006: Reconstruct seed-1000 historical draw-space artifact for Spec 132 I2

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None required by default — investigation artifact and/or narrow diagnostic helper only if needed
**Deps**: `archive/tickets/132AGESTUVIA-002.md`

## Problem

`132AGESTUVIA-002` completed the production contract split (`structurallyUnsatisfiable` vs `drawDeadEnd`), retry extension, schema migration, and seed-1002 smoke guard, but it did not separately deliver the exact historical Investigation I2 artifact promised in its `What to Change`: an exhaustive characterization of the seed-1000 NVA march template's first-choice draw space (`chooseN{min:1,max:1,options:29}`). The current repo contains summary campaign traces and the legacy diagnostic script, but not a committed reconstructable artifact that quantifies how many first-choice options lead to completion vs downstream dead end. Without that artifact, the 132 series lacks the exact historical evidence ticket 002 claimed to preserve.

## Assumption Reassessment (2026-04-17)

1. `archive/tickets/132AGESTUVIA-002.md` still names Investigation I2 as an explicit deliverable and asks for the distribution to be committed as test fixtures or documented comments — confirmed.
2. `campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs` still exists and is the named reproduction entrypoint for the historical seed-1000 stuck incident — confirmed.
3. The checked-in campaign traces under `campaigns/fitl-arvn-agent-evolution/traces/` and `last-trace.json` are summary artifacts (`totalMoves`, `evolvedMoves`, seat margins, stop reason) and do not expose the exact failing template state or the 29-option first-choice domain directly — confirmed.
4. Active tickets `132AGESTUVIA-003` through `005` do not currently own this historical artifact reconstruction; they own retry integration, simulator/union cleanup, and end-to-end seed regression gates respectively — confirmed.

## Architecture Check

1. Splitting the historical artifact reconstruction into its own ticket keeps `132AGESTUVIA-002` scoped to the delivered kernel/retry/schema contract change instead of reopening production code for an evidence-only remainder.
2. The artifact should come from repo-owned deterministic evidence (diagnostic script, narrow harness, fixture, or documented generated result), which aligns with Foundations #9 and #13 without adding game-specific production branching.
3. Keeping this as a separate investigation ticket avoids overlapping with `132AGESTUVIA-005`, whose boundary is end-to-end regression gating rather than reconstructing the original dead-end option distribution.

## What to Change

### 1. Reconstruct the exact seed-1000 choice surface

Use the existing diagnostic/reproduction path, or add the narrowest temporary deterministic helper needed, to isolate the historical seed-1000 NVA march template named in `132AGESTUVIA-002`. Enumerate the first-choice domain (`chooseN{min:1,max:1,options:29}`) exhaustively and classify each option outcome as:

- `completed`
- `stochasticUnresolved`
- downstream `illegal`
- `CHOICE_RUNTIME_VALIDATION_FAILED`
- budget `exceeded`

### 2. Commit a durable repo artifact

Record the resulting distribution in one of these owned forms:

- a focused test fixture checked into `packages/engine/test/fixtures/`
- a new targeted investigation test that documents the counts inline
- a documented comment block colocated with the new focused proof lane

The final artifact must be reconstructable from repo state alone and must name the exact counts found.

### 3. Close the series evidence gap cleanly

If the exact historical state cannot be reconstructed from repo-owned artifacts after bounded investigation, do not silently soften the deliverable. Update this ticket with the concrete blocker and either:

- mark it `BLOCKED` with the missing artifact/instrumentation clearly named, or
- rewrite the ticket to the strongest truthful indirect evidence boundary before closing it.

## Files to Touch

- `campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs` (modify only if a narrow deterministic helper is truly required)
- `packages/engine/test/integration/fitl-seed-1000-draw-space.test.ts` (new artifact/proof lane)
- `tickets/132AGESTUVIA-006.md` (update outcome/verification)

## Out of Scope

- Reopening the production contract split from `132AGESTUVIA-002`
- Simulator `agentStuck` cleanup — `132AGESTUVIA-004`
- End-to-end seed-1000/1002 regression gating — `132AGESTUVIA-005`

## Acceptance Criteria

### Tests That Must Pass

1. The new focused investigation proof/artifact deterministically reproduces the exact seed-1000 first-choice distribution or proves, with concrete evidence, why it is not reconstructable from current repo-owned artifacts.
2. Any new targeted proof lane added for the artifact passes.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The historical draw-space artifact is explicit and durable; it is not left implicit in a narrative closeout.
2. No game-specific production logic is added to the engine to obtain the artifact.
3. If reconstruction is impossible, the ticket closes truthfully as blocked or rewritten rather than silently claiming completion.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-seed-1000-draw-space.test.ts` — reconstructs the historical seed-1000 NVA free-operation march witness from live repo state, enumerates the 29 first-choice options, and recursively classifies the downstream bounded decision space until each first choice has a single historical outcome bucket.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/integration/fitl-seed-1000-draw-space.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Reconstructed the historical seed-1000 witness directly from repo-owned FITL production spec state via a focused integration proof at `packages/engine/test/integration/fitl-seed-1000-draw-space.test.ts`.
- Confirmed the exact historical stuck state remains reconstructable on current `HEAD`: `stateHash=6539610714732013105`, NVA free-operation `march`, `legalMoves.length=2`, and the first pending request is `chooseN{min:1,max:1}` with 29 options.
- Exhaustively classified the first-choice surface and recorded the exact counts inline in the proof:
  - `completed`: 3 first choices
  - `stochasticUnresolved`: 0
  - downstream `illegal`: 26
  - `CHOICE_RUNTIME_VALIDATION_FAILED`: 0
  - budget `exceeded`: 0
- Recorded the three completing first choices exactly: `an-loc:none`, `da-nang:none`, and `sihanoukville:none`.
- No production engine code or FITL-specific kernel branching was added; the ticket closed as an evidence-only artifact delivery.

## Verification

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/integration/fitl-seed-1000-draw-space.test.js`
3. `pnpm -F @ludoforge/engine test`
