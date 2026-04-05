# 109AGEPREAUD-005: Integration tests — FITL production proof for event preview contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — test files only
**Deps**: `archive/tickets/109AGEPREAUD-002.md`

## Problem

Ticket 002 no longer landed as a runtime preview fix. After reassessment, it completed as proof/regression coverage on the existing trusted preview path. We still lack production-spec proof that FITL event preview contracts hold end to end in real agent traces, especially for:

- materially different event sides when immediate projected state should differ
- capability and momentum cards that should remain `ready` without artificial margin inflation
- multi-branch event candidates that must remain independently previewed

## Assumption Reassessment (2026-04-05)

1. FITL production spec compiles and runs — confirmed (used in fitl-vc-agent-evolution campaign).
2. Ticket 001's audit disproved the broad hypothesis that event moves generally fail out of trusted preparation, and ticket 002 added synthetic proof coverage instead of a runtime fix.
3. `PolicyAgent` with `traceLevel: 'verbose'` exposes per-candidate `scoreContributions` and `previewOutcome` — confirmed.
4. Earlier example cards such as `card-116` and `card-15` are not reliable "different immediate margin" reproducers because they are capability/momentum-style cards. Integration tests must choose production cards whose authored immediate effects actually justify the asserted invariant.

## Architecture Check

1. Integration tests use the production FITL spec — they verify real game behavior, not synthetic edge cases (Foundation 16: Testing as Proof).
2. Tests are game-specific (FITL) but that's appropriate for integration tests — unit tests in ticket 002 already cover the game-agnostic trusted-preview contract.
3. Tests must use authored cards whose live semantics actually support the asserted invariant, so the production proof does not depend on stale or misclassified examples.

## What to Change

### 1. FITL event preview differentiation test

Create a test that:
1. Compiles the FITL production spec
2. Advances to a game state where both shaded and unshaded event candidates are available for the active player
3. Runs `PolicyAgent.chooseMove` with `traceLevel: 'verbose'`
4. Finds the event candidates in the trace
5. Asserts: shaded and unshaded candidates have DIFFERENT `preferProjectedSelfMargin` contributions when the authored immediate effects genuinely differ

### 2. Capability or momentum preview honesty test

Find a FITL capability or momentum card and verify:
1. Both shaded and unshaded preview complete (not `unknown`)
2. The preview returns a valid projected state
3. Equal immediate projected margin is accepted when the authored effect is long-term rather than immediate

### 3. Multi-branch event preview test

Find a FITL event card with multiple branches on one side and verify:
1. Each branch is a separate candidate
2. Each branch gets its own preview evaluation

### 4. Regression test: non-event preview unchanged

Run a PolicyAgent evaluation on a state with Rally/Terror/Attack candidates and verify:
1. Preview produces different margins for different action types (existing behavior)
2. No performance regression compared to baseline

## Files to Touch

- `packages/engine/test/integration/event-preview-differentiation.test.ts` (new) — FITL event preview tests
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify) — add regression assertion if appropriate

## Out of Scope

- Fixing preview (ticket 002) — this ticket only tests
- Synthetic unit tests (ticket 002's test plan)
- Non-FITL game tests

## Acceptance Criteria

### Tests That Must Pass

1. Shaded and unshaded event candidates produce different `preferProjectedSelfMargin` contributions for production cards with materially different immediate effects
2. Capability or momentum card preview completes (not `unknown`) without requiring artificial score separation
3. Multi-branch event candidates are previewed independently
4. Non-event preview is unchanged (regression check)
5. Existing suite: `pnpm turbo test`

### Invariants

1. Tests use the production FITL spec — no synthetic game specs
2. Tests assert structural properties (different margins or honest equal margins) rather than brittle exact values
3. Tests are deterministic (fixed seed)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/event-preview-differentiation.test.ts` (new) — comprehensive event preview integration tests

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`

## Outcome

Completed: 2026-04-05

- Added [event-preview-differentiation.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/event-preview-differentiation.test.ts) as the production FITL proof surface for event preview contracts.
- Extended [fitl-policy-agent.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-policy-agent.test.ts) with a non-event regression check on the existing policy trace surface.
- Used current deterministic production reproducers instead of the stale motivating examples:
  - seed `1`, ply `2`: `card-68` (`Green Berets`) proves side-specific projected-margin differentiation and independently previewed branches
  - seed `1`, ply `8`: `card-116` (`Cadres`) proves capability previews stay `ready` even when immediate projected margin remains equal
  - seed `1`, ply `1`: VC `rally` / `terror` / `attack` candidates retain differentiated preview-backed scoring
- Deviation from original plan: no standalone performance baseline harness was added. The ticket stayed a test-only proof ticket and used the existing regression suites as the authoritative non-event guardrail.

Verification:

- `pnpm -F @ludoforge/engine build`
- `node --test dist/test/integration/event-preview-differentiation.test.js dist/test/integration/fitl-policy-agent.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo test`
