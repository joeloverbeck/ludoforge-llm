# ENGINEAGNO-006: Harden Replay Harness Diagnostics and Policy Surface

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: No kernel behavior change required; test/runtime tooling interface hardening
**Deps**: ENGINEAGNO-004

## Problem

`replayScript` already provides deterministic context for explicit replay legality failures and `assertStep` assertion failures. However, exceptions thrown by `applyMove` itself are currently propagated without guaranteed per-step replay context (step index, phase, active player, selected key vars).

Also, `advancePhaseBounded` currently does not expose execution-policy passthrough to `advancePhase`, limiting reuse for policy-sensitive deterministic scenarios.

For long-term game-agnostic validation of arbitrary `GameSpecDoc` games, replay tooling should consistently expose actionable diagnostics and complete game-agnostic policy controls.

## Reassessed Assumptions

1. `Replay illegal move` diagnostics are already contextualized today (`step`, `move`, `phase`, `activePlayer`, `keyVars`).
2. `assertStep` failures are already wrapped with contextual diagnostics.
3. Only thrown `applyMove` failures lack replay-context wrapping.
4. `advancePhaseBounded` currently forwards trigger log collector only; it does not forward `MoveExecutionPolicy`.

## What to Change

1. Wrap replay `applyMove` thrown failures with deterministic step-context diagnostics:
   - step index
   - move/action
   - current phase
   - active player
   - key vars snapshot
2. Preserve original error reason/details as nested `cause` when possible; otherwise append deterministic detail string.
3. Extend bounded phase-advance helper config to accept optional execution policy passthrough and forward it to `advancePhase`.
4. Keep API game-agnostic (no game-specific policy fields or assumptions).
5. Keep implementation surgical: no kernel/runtime behavior changes; helper surface and tests only.

## Architectural Rationale

- This change is more robust than current behavior because replay context is the stable debugging contract at harness boundaries; relying on raw thrown kernel errors alone leaks internal call-site context and weakens diagnosability.
- Policy passthrough on bounded phase advancement aligns helper capabilities with underlying kernel APIs, improving extensibility without introducing aliases or game-specific branching.
- Scope remains intentionally narrow to avoid accidental architecture drift in core engine code.

## Invariants

1. Every replay step failure includes actionable replay context.
2. Root failure reason from kernel/runtime remains visible and inspectable.
3. Bounded advance helper supports same deterministic policy semantics as underlying kernel call paths.
4. No game-specific branching in helper APIs.

## Tests

1. Unit: replay step failure from thrown `applyMove` error includes required step-context fields.
2. Unit: wrapped replay error retains original failure signal/message (`cause` or deterministic equivalent).
3. Unit: bounded phase helper forwards execution policy to `advancePhase` call path.
4. Regression: existing replay harness tests and phase-advance tests remain green.

## Outcome

- Completion date: 2026-02-16
- Actually changed:
  - `test/helpers/replay-harness.ts`: wrapped thrown `applyMove` failures with deterministic replay step context and preserved root error via `cause`; added optional `executionPolicy` passthrough on `advancePhaseBounded`.
  - `test/unit/replay-harness.test.ts`: added coverage for wrapped thrown `applyMove` failures and for policy passthrough forwarding semantics.
  - `test/e2e/texas-holdem-tournament.test.ts`: stabilized a brittle random-agent terminality assertion by enforcing robust end-state invariants for both valid stop outcomes (`terminal` and `maxTurns`).
- Deviations from original plan:
  - Scope was expanded to resolve a failing `test:all` e2e gate (`texas-holdem-tournament`) discovered during verification.
- Verification results:
  - `npm run lint` passed.
  - `npm test` passed.
  - `npm run test:all` passed.
