# DECINSARC-008: Full-suite green verification, gap cleanup, and archival

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Verification-first; fix only real regressions or uncovered edge cases discovered during full-suite validation
**Deps**: DECINSARC-001, DECINSARC-002, DECINSARC-003, DECINSARC-004, DECINSARC-005, DECINSARC-006, DECINSARC-007

## Problem

Spec 60's decision-instance architecture has already been landed across engine and runner. The remaining work is to verify the integrated architecture end-to-end, fix any actual failures or weakly-covered invariants exposed by full-suite execution, and archive the ticket/spec with an accurate outcome. This ticket is the final verification and closure gate, not the primary migration vehicle.

## Assumption Reassessment (2026-03-13)

1. The core architecture described by Spec 60 is already present in source: `packages/engine/src/kernel/decision-scope.ts`, required `decisionScope` in effect contexts, `ChoicePendingRequest.decisionKey`, and runner-side `PartialChoice.decisionKey` are implemented.
2. Runner tests are already predominantly migrated to `decisionKey`; this ticket should not assume a bulk rename remains.
3. `pnpm turbo test` is the canonical cross-workspace verification command, but root `pnpm test` also runs ticket-dependency and other repo-level guards before Turbo tests. Final closure should account for those repo-level checks as well.
4. `pnpm turbo schema:artifacts` is still required because engine schema artifacts are part of the acceptance surface and may drift from runtime types.
5. Current local repo metadata (`CLAUDE.md`, AGENTS guidance) still says there are no active tickets, which is stale relative to this ticket. That mismatch is documentation debt, not a blocker for this ticket.

## Architecture Check

1. The architecture is directionally correct and cleaner than the prior occurrence/alias model: `DecisionKey` plus immutable `DecisionScope` is simpler, more robust under nesting/stochastic branching, and more extensible than the legacy design.
2. This ticket should preserve that architecture and avoid reintroducing aliases, compatibility shims, or duplicate identity paths.
3. Source changes are allowed only if the verification battery exposes a real regression, invariant hole, or brittle edge case that materially weakens the landed architecture.
4. Full-stack green verification is the gate condition for considering Spec 60 complete and ready for archival.

## What to Change

### 1. Validate the landed architecture against the current codebase

- Confirm the ticket assumptions match the code and tests before any implementation
- Confirm no active source/test code still depends on deleted decision-occurrence identity paths
- Confirm Spec 60's intended architecture remains the dominant implementation, not a half-migrated hybrid

### 2. Fix any remaining failures or invariant gaps discovered by verification

- Run the relevant targeted suites first, then the full verification battery
- If failures appear, fix the minimal runtime/test surface needed
- If a failure exposes an invariant or edge case with weak coverage, add or strengthen tests before final verification

### 3. Verify schema artifacts and repo-wide gates

- Run `pnpm turbo schema:artifacts`
- Run the full workspace verification commands required by Spec 60 and this repo
- Ensure any generated artifacts and guard scripts remain green

### 4. Finalize and archive

- Mark this ticket completed with an accurate `Outcome` section
- Archive this ticket via the canonical archival workflow
- Once all verification passes, archive `specs/60-decision-instance-architecture.md` with an accurate `Outcome`

## Files to Touch

- `tickets/DECINSARC-008.md` — reassess assumptions, record final outcome, mark complete
- `packages/engine/test/**/*` — only if verification exposes a real gap (modify)
- `packages/runner/test/**/*` — only if verification exposes a real gap (modify)
- `packages/engine/src/**/*` or `packages/runner/src/**/*` — only if verification exposes a real regression (modify)
- `packages/engine/schemas/` — if schema artifacts regenerate or drift is corrected (modify)
- `archive/tickets/` — archive destination
- `archive/specs/` — archive destination for Spec 60

## Out of Scope

- New architecture work beyond Spec 60's landed design
- Reintroducing backwards compatibility, aliasing, or parallel identity formats
- Game-specific runtime logic or data-shape changes
- Broad refactors unrelated to concrete failures revealed by verification

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — zero errors
2. `pnpm turbo typecheck` — zero errors
3. `pnpm turbo lint` — zero errors
4. `pnpm turbo test` — all engine + runner tests green
5. `pnpm turbo schema:artifacts` — generates without error
6. `pnpm -F @ludoforge/engine test:all` — full engine suite green (unit + integration + e2e)
7. `pnpm -F @ludoforge/runner test` — full runner suite green
8. `pnpm test` — repo-level guards plus workspace tests green
9. Ticket and Spec 60 are marked completed and archived per `docs/archival-workflow.md`

### Invariants

1. `DecisionKey` remains the sole authoritative decision identity on the move/pending-choice path.
2. `DecisionScope` remains immutable and is threaded consistently enough to preserve deterministic nested/stochastic behavior.
3. Codec helpers remain the canonical identity path; no compatibility alias layer is introduced.
4. `ChoicePendingRequest` exposes `decisionKey` on the active runtime/test surface; no legacy occurrence-field dependency remains in active behavior.
5. `EffectContextBase.decisionScope` remains required on the active runtime path, with top-level helpers supplying `emptyScope()` as needed.
6. No active imports of deleted decision identity modules remain.
7. No game-specific logic is added to kernel, simulation, compiler, or runner to satisfy this ticket.
8. Canonical serialized move shape stays deterministic and minimal.
9. Existing engine FITL/event and runner progressive-choice coverage stays green after verification.
10. Any bug or edge case discovered during this ticket is captured by a dedicated or strengthened automated test.

## Test Plan

### New/Modified Tests

1. Failure-driven tests only: add or strengthen engine/runner tests for any real invariant hole found during verification
2. Update existing tests only where current behavior or architecture guarantees are incorrectly asserted

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm turbo test`
5. `pnpm turbo schema:artifacts`
6. `pnpm -F @ludoforge/engine test:all`
7. `pnpm -F @ludoforge/runner test`
8. `pnpm test`

## Outcome

- Completion date: 2026-03-13
- What actually changed: reassessed the ticket against the current codebase, corrected its assumptions and scope to reflect that the `DecisionKey`/`DecisionScope` architecture was already landed, then ran the full verification battery and repo guard checks.
- Deviations from original plan: no engine, runner, schema, or test-source changes were required because the migrated architecture and its existing regression coverage were already green. The only failure encountered was a repo guard triggered by incidental guidance-doc header counter churn in `AGENTS.md` and `CLAUDE.md`; those incidental counter-only changes were removed.
- Verification results:
  - `pnpm turbo build`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo schema:artifacts`
  - `pnpm -F @ludoforge/engine test:all`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm turbo test`
  - `pnpm test`
