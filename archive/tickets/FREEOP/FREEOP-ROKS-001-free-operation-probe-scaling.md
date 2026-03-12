# FREEOP-ROKS-001: Fix free-operation decision probing and move synthesis scaling for complex operation profiles

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel free-operation viability/probing, move decision-sequence resolution, focused integration/unit tests
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/free-operation-viability.ts`, `packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `packages/engine/src/kernel/move-decision-sequence.ts`, `packages/engine/src/kernel/move-enumeration-budgets.ts`, `packages/engine/src/kernel/legal-moves.ts`, `packages/engine/test/integration/fitl-events-roks.test.ts`, `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts`, `packages/engine/test/helpers/decision-param-helpers.ts`, `data/games/fire-in-the-lake/30-rules-actions.md`, `data/games/fire-in-the-lake/41-events/065-096.md`

## Problem

Card 70 (`ROKs`) still exposes an engine failure mode: a legal free-operation grant can compile successfully, pass broad free-operation regression suites, and yet drive the focused `ROKs` integration path into heap exhaustion when decision-sequence completion has to synthesize a richer free operation than the stock FITL profiles.

That is not acceptable architecture. A game-agnostic engine must either:

1. synthesize free-operation moves for complex profiles within bounded memory/time, or
2. reject unsupported shapes deterministically at a shared boundary.

Silently allowing authored `GameSpecDoc` content to compile and then crash runtime probing leaves the engine neither robust nor extensible.

## Assumption Reassessment (2026-03-12)

1. FITL production spec currently compiles with a non-null `gameDef` after the `ROKs` authored-data changes. Confirmed locally via the production-spec helpers used by `packages/engine/test/integration/fitl-events-roks.test.ts`.
2. Production-spec compilation assertions in `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` pass with the updated `ROKs` encoding. Confirmed locally on 2026-03-12.
3. Broad free-operation regression coverage already passes on the current branch, including `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` and `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts`. The engine already has a bounded-probe architecture in `free-operation-viability.ts`; this ticket must not re-solve that problem generically if the real bug is narrower.
4. The original heap OOM was real, but it was not the only discrepancy. `ROKs` also depended on authored mixed-US action-profile filters that never surfaced legal targets, and the integration test itself mixed bind names with raw `applyMove(...)` on internal-decision pipelines.
5. Therefore the real issue set was narrower and cleaner than the original ticket wording implied: close the shared free-operation probe blow-up, keep execute-as viability ownership separate from execution profile selection, and correct the authored `ROKs` operation-profile filters/tests that were invalid under the existing kernel contracts.

## Architecture Check

1. The existing architecture already moved generic free-operation viability into `free-operation-viability.ts` and related discovery-analysis helpers. That is directionally correct and should be preserved.
2. The clean fix is to close the remaining unbounded path inside the shared kernel decision-resolution contract, not to add FITL-specific `ROKs` exceptions and not to duplicate viability logic in tests/helpers.
3. The right end state remains game-agnostic: complex granted operations either terminate under shared budgets/ordering heuristics or fail deterministically through a shared kernel contract.
4. No backwards-compatibility shims should preserve the current unbounded path. Tighten the canonical contract instead of adding aliases or parallel codepaths.

## What to Change

### 1. Close the unbounded `ROKs` decision-resolution path at the shared kernel boundary

Trace the OOM to the current shared path used by `fitl-events-roks.test.ts`. Based on current code, that likely means `free-operation-viability.ts`, `move-decision-sequence.ts`, or the test helper path that completes decision sequences against the same kernel APIs.

Prefer one of:

- reusing existing move-enumeration budgets in the leaking decision-resolution branch,
- tightening choice ordering / pruning so the `ROKs` grant resolves without exhaustive tree growth,
- or returning a deterministic incomplete/unsupported result at the shared kernel boundary.

Do not add a `ROKs` special case.

### 2. Keep one canonical free-operation viability architecture

Do not fork logic between `legal-moves.ts`, `decision-param-helpers.ts`, and `free-operation-viability.ts`.

If the helper currently bypasses the intended bounded kernel path, route it back through the canonical path or make the shared primitive itself authoritative.

### 3. Make failure semantics explicit where the remaining path cannot terminate cheaply

If some decision profiles are still too expensive to complete automatically, surface a deterministic shared result or diagnostic rather than allowing heap exhaustion.

### 4. Add regression coverage for the exact high-complexity shape we now know is failing

Add integration and/or unit coverage proving that:

- the `ROKs` path terminates,
- existing free-operation grant suites stay green,
- and helper-based decision normalization does not bypass the same boundary again.

### 5. Preserve `ROKs` as a reevaluation client, not a one-off workaround

Do not bake card-70-specific escape hatches into the kernel. Track card-70 authored-data follow-up separately in `tickets/FITL70-001-reevaluate-roks-after-engine-rework.md`.

## Files to Touch

- `tickets/FREEOP-ROKS-001-free-operation-probe-scaling.md` (new)
- `packages/engine/src/kernel/free-operation-viability.ts` (likely modify)
- `packages/engine/src/kernel/free-operation-discovery-analysis.ts` (modify only if the shared grant-analysis contract is missing a needed bounded signal)
- `packages/engine/src/kernel/move-decision-sequence.ts` (likely modify if decision completion itself is the unbounded branch)
- `packages/engine/src/kernel/move-enumeration-budgets.ts` (modify only if current budgets need a shared explicit variant)
- `packages/engine/src/kernel/legal-moves.ts` (modify only if canonical probing must align with the fixed boundary)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify only if a generic high-complexity regression belongs there)
- `packages/engine/test/integration/fitl-production-data-compilation.test.ts` (modify to reflect authored mixed-US operation profiles now present in production)
- `packages/engine/test/integration/fitl-events-roks.test.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts` (modify if the canonical architectural route changes)
- `packages/engine/test/unit/kernel/free-operation-viability.test.ts` (new focused regression)
- `packages/engine/test/helpers/decision-param-helpers.ts` (modify only if the helper currently bypasses the shared bounded contract)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify mixed-US sweep/assault authored filters to canonical zone-id membership checks)
- `data/games/fire-in-the-lake/41-events/065-096.md` (keep `ROKs` first grant on the stronger shared viability contract after the authored profile fix)

## Out of Scope

- Final FITL card-70 authored-data shape
- Visual presentation changes in `visual-config.yaml`
- FITL-specific kernel branches or special cases
- Backwards-compatibility flags preserving unbounded probe behavior

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-events-roks.test.ts` passes without heap exhaustion.
2. Existing free-operation coverage continues to pass, including `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` and `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts`.
3. If the engine must decline automatic completion for some unsupported high-complexity shape, it does so deterministically through a shared kernel result/diagnostic rather than OOM.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Free-operation discovery remains game-agnostic and does not branch on FITL identifiers, card ids, factions, or map spaces.
2. `GameSpecDoc` remains the place where game-specific granted-operation content is authored; the engine only provides generic bounded execution semantics.
3. No backwards-compatibility alias path preserves the old unbounded probing contract.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-roks.test.ts` — prove the live `ROKs` grant path terminates under the shared kernel boundary.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add or adjust only if a generic regression is needed beyond `ROKs`.
3. `packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts` and/or a focused unit test under the touched kernel area — pin the architectural route and any new budget/termination semantics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-roks.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/free-operation-probe-boundary-guard.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`

## Outcome

Completion date: 2026-03-12

What actually changed:
- Replaced eager free-operation `chooseN` probe materialization with lazy bounded visitation in `packages/engine/src/kernel/free-operation-viability.ts`, so high-cardinality free-operation probes terminate without heap blow-up.
- Corrected execute-as viability probing to keep grant ownership on the grant seat while still evaluating action applicability on the overridden execution profile.
- Added a focused unit regression for bounded high-cardinality free-operation probing.
- Added execute-as free-operation regressions covering `requireUsableForEventPlay` and move-zone-binding viability on overridden profiles.
- Corrected the authored `ROKs` mixed-US sweep and assault profile zone-membership filters in `data/games/fire-in-the-lake/30-rules-actions.md` to use canonical zone-id membership expressions, which restored legal target discovery without engine special cases.
- Restored `ROKs` first-grant viability to the stronger `requireUsableForEventPlay` contract after the authored profile fix made the probe correctly discover legal moves.
- Corrected the `ROKs` integration test to resolve internal decision ids through the shared helper instead of passing bind names directly to raw `applyMove(...)`.
- Updated the production compilation invariant test to include the authored mixed-US `sweep` and `assault` profiles now present in the FITL production `GameSpecDoc`.

Deviations from original plan:
- The ticket started as a pure kernel scalability fix. During reassessment, the live failure turned out to include two additional discrepancies outside the original wording: invalid authored mixed-US action-profile filters and a stale integration-test assumption about internal decision ids.
- No FITL-specific engine branch was added. The clean architecture remained a shared kernel probe fix plus authored-data/test corrections in FITL data.

Verification results:
- Targeted regressions passed:
  - `packages/engine/dist/test/unit/kernel/free-operation-viability.test.js`
  - `packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
  - `packages/engine/dist/test/integration/fitl-events-1965-arvn.test.js`
  - `packages/engine/dist/test/integration/fitl-events-roks.test.js`
  - `packages/engine/dist/test/integration/fitl-production-data-compilation.test.js`
- `pnpm turbo lint` completed with exit code 0. The workspace still has pre-existing lint warnings in `packages/engine` and `packages/runner`, but no lint errors.
- `pnpm turbo test` completed with exit code 0.
