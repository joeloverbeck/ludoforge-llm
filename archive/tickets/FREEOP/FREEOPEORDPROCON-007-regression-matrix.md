# FREEOPEORDPROCON-007: Regression Matrix — Cross-Cutting Progression Coverage

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: No planned production changes — reassess only if a test exposes a real architectural defect
**Deps**: archive/tickets/FREEOP/FREEOPEORDPROCON-004-sequence-readiness-engine.md, archive/tickets/FREEOPEORDPROCON-005-emission-time-skip-evaluation.md, archive/tickets/FREEOPEORDPROCON-006-macv-data-rework.md

## Problem

Spec 60 requires cross-cutting regression coverage for ordered free-operation progression across emission, readiness, discovery, apply-time, and diagnostics. Several of those regressions already exist across the current generic integration harness and FITL production-card tests, but the coverage is fragmented and a few matrix expectations are still implicit rather than asserted directly. This ticket covers only the remaining integration-level gaps and any needed consolidation inside the existing test architecture.

## Assumption Reassessment (2026-03-12)

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` is already a generic `GameDef` integration harness despite its FITL-prefixed filename. It already covers multiple non-FITL ordered free-operation cases, including strict ordering, sequence-context capture, event/effect issue paths, and `implementWhatCanInOrder` batch-state parity.
2. `packages/engine/test/unit/effects-turn-flow.test.ts` already covers effect-level `implementWhatCanInOrder` skip recording and `strictInOrder` suppression; this ticket should not duplicate that unit-level surface unless an integration-only invariant is missing.
3. `packages/engine/test/integration/fitl-events-macv.test.ts` already covers the production FITL MACV regression, including the `implementWhatCanInOrder` skip behavior and empty captured context.
4. The primary remaining gap is explicit integration coverage for discovery/apply parity and any integration-only sequence invariants that are still only indirectly implied by existing tests.

## Architecture Check

1. Prefer extending the existing generic integration harness in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` over creating a second matrix file with overlapping fixture builders.
2. Generic (non-FITL) fixtures remain the right architecture for progression-contract tests because they keep the kernel contract game-agnostic.
3. FITL production-card regression should stay in the production-card tests that already own those cards. This ticket should add only the minimum production-FITL assertions needed to prove no regression in authored ordered-sequence cards.
4. Production code should change only if a new test reveals a real contract mismatch between discovery and apply or another sequence invariant bug. If that happens, fix the architecture directly rather than adding compatibility aliases or bypasses.

## What to Change

### 1. Use the existing generic progression harness

Reuse and extend the existing generic fixture builders in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`. Do not create a new parallel integration file unless the current harness becomes structurally unmaintainable.

### 2. Add only the missing matrix assertions

Add or strengthen the following regression cases where they are not already asserted directly:

#### Required Regression Cases (from Spec 60)

1. **Earlier step implementable, later step blocked until consumption** — already covered generically; keep if strengthening is useful, but do not duplicate without new signal.
2. **Earlier step unimplementable, later step proceeds under `implementWhatCanInOrder`** — already covered generically and in MACV; only strengthen if needed for discovery/apply parity.
3. **Earlier step unimplementable, later step blocked under `strictInOrder`** — add an integration assertion if the current suite still lacks this at the `legalMoves`/`applyMove` surface.
4. **Skipped step does not capture sequence context** — already covered by batch-context assertions; do not restate unless a stronger end-to-end assertion adds value.
5. **Required context from skipped step is rejected for a full GameDef** — if missing, add a complete integration-level validation failure using `initialState`/compiled `GameDef`, not just a lower-level helper.
6. **Event-issued and effect-issued contracts stay aligned** — keep this as parity on observable runtime behavior, not merely on fixture structure.
7. **Discovery/apply parity holds** — explicitly enumerate surfaced free-operation moves and prove each legal surfaced move applies successfully in the corresponding parity fixture(s).
8. **MACV uses the generic contract without card-specific kernel behavior** — already covered by production FITL tests; cross-reference only.

### 3. Existing ordered-sequence regression

Verify that existing authored ordered-sequence FITL cards still compile and expose their intended sequence contracts. Prefer targeted production-card assertions in existing card tests over a broad multi-turn smoke test unless a smoke test adds unique protection.

## Files to Touch

- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — extend the existing generic regression harness
- `packages/engine/test/integration/fitl-events-*.test.ts` (only if a production-card regression assertion is genuinely missing)

## Out of Scope

- New parallel generic integration harnesses that duplicate the existing fixture builders.
- MACV-specific tests — those are in FREEOPEORDPROCON-006.
- Repeating unit-only invariants that are already adequately covered in `effects-turn-flow.test.ts`.
- Broad FITL smoke tests that do not add stronger protection than targeted production-card assertions.

## Acceptance Criteria

### Tests That Must Pass

1. Any newly added test covers a regression case not already directly asserted by the existing generic harness or production-card tests.
2. Explicit discovery/apply parity is asserted for the chosen generic progression fixture(s).
3. `strictInOrder` suppression for an earlier unusable step is covered at integration level if it was previously missing.
4. Event-issued and effect-issued parity remains aligned on observable runtime behavior for the selected sequence contract.
5. If added, the skipped-step sequence-context validation test fails at full-GameDef validation/init time rather than only at a helper/unit surface.
6. Existing relevant engine suites and the required broader suite pass.

### Invariants

1. All regression tests use generic (non-FITL) fixtures except for the existing-card regression check.
2. Prefer no production code changes; if a real kernel defect is exposed, fix it directly with tests rather than weakening the assertions.
3. Discovery/apply parity is verified programmatically by enumerating surfaced free-operation moves and proving they can be applied without rejection.
4. No new aliasing, compatibility shims, or game-specific kernel branches are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify) — extend the existing generic harness with only the missing regression assertions
2. Existing FITL production-card integration tests (modify only if a targeted regression assertion is truly missing)

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-12
- What actually changed:
  - Reassessed the ticket against the live codebase and corrected its stale assumptions before implementation.
  - Kept the architecture centered on the existing generic harness in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` instead of creating a duplicate matrix file.
  - Added explicit integration coverage for event-issued `strictInOrder` suppression when an earlier step is currently unusable.
  - Added explicit discovery/apply parity coverage for event-issued and effect-issued `implementWhatCanInOrder` fixtures by enumerating surfaced free-operation moves and proving each applies successfully.
  - No production code changes were required.
- Deviations from original plan:
  - Did not create `packages/engine/test/integration/free-operation-progression-contract.test.ts` because that would have duplicated an already-existing generic integration harness.
  - Did not add broad FITL smoke coverage or new production-card assertions because the existing production-card tests already cover the relevant authored-sequence behavior, and the remaining real gap was in the generic harness.
  - Did not add a full-GameDef skipped-sequence-context validation test because the reassessment showed the highest-value missing coverage was runtime parity and integration-level strict suppression, while the validation surface already has dedicated lower-level coverage.
- Verification results:
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine test:e2e`
  - `pnpm turbo test`
  - `pnpm turbo lint` completed successfully with pre-existing warnings only and no errors.
