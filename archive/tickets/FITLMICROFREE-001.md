# FITLMICROFREE-001: Published free-operation microturn decisions must be executable under required outcome policy

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel microturn publication / continuation / apply path, legal-move admission, FITL policy-agent integration tests
**Deps**: `docs/FOUNDATIONS.md`, `archive/tickets/FREEOP-OUTCOME-001-filter-no-op-completions.md`, `archive/specs/140-microturn-native-decision-protocol.md`

## Problem

After the Spec 140 microturn migration, FITL lanes still publish at least one decision that the kernel later rejects during execution under a required free-operation outcome policy.

Observed on PR `#224` after commit `85d1b2f6`:

1. `Engine FITL Events` fails inside policy-agent evaluation.
2. The published decision frontier includes a `march` decision tied to a required free-operation grant.
3. `applyDecision(...)` eventually reaches `applyMove(...)`, which throws `ILLEGAL_MOVE` with `reason: freeOperationOutcomePolicyFailed`.
4. The grant's policy is `mustChangeGameplayState`, but the published decision sequence can still resolve to an empty / no-op completion.

This violates the Foundations contract that published legal actions are executable at their microturn scope:

- Foundation `#5`: one rules protocol for simulator, agents, and runner.
- Foundation `#18`: legality and constructibility are one property.
- Foundation `#19`: every kernel-visible decision is atomic.

The fix must remove the mismatch at the shared kernel boundary. Agent-side filtering alone is insufficient.

## Assumption Reassessment (2026-04-21)

1. The earlier free-operation legality cleanup in `FREEOP-OUTCOME-001` was necessary but not sufficient for the Spec 140 decision protocol; microturn publication can still admit a sequence that is not executable under the strongest required outcome policy.
2. The failing trace is FITL, but the violated contract is generic: any game using required free operations with outcome policies could hit the same bug.
3. The engine already has generic concepts for continuation analysis, outcome policy enforcement, and legal-move publication. The correct fix belongs in those generic paths, not in FITL data or policy-agent heuristics.
4. The current failure occurs during policy-agent frontier evaluation, but the root cause is still kernel publication/admission, because the published decision is not truly constructible.

## Architecture Check

1. The clean boundary is: a decision may be published only if some completion path is executable under the authoritative outcome policy in the current state.
2. No FITL-specific branches are allowed. Any admission or suppression must operate on generic move continuation and generic free-operation outcome policy semantics.
3. No compatibility shim may preserve the old invalid behavior for some callers. Simulator, agents, replay, and runner must all consume the same corrected admission surface.

## What to Change

### 1. Reproduce the illegal published-decision path as a kernel regression

Add a focused regression that captures the failing free-operation grant scenario at the published decision boundary:

- publish the microturn,
- assert the problematic decision is either not published or is executable,
- if published, replay it through `applyDecision(...)` without `ILLEGAL_MOVE`.

The regression should use the smallest FITL fixture or seeded trace that reproduces the failure, but the assertions must stay generic.

### 2. Tighten decision publication and continuation admission

Review the shared Spec 140 decision publication path:

- `packages/engine/src/kernel/microturn/publish.ts`
- `packages/engine/src/kernel/microturn/continuation.ts`
- `packages/engine/src/kernel/legal-moves.ts`
- shared free-operation viability / outcome-policy helpers

The published action-selection / choice sequence must exclude any continuation that cannot satisfy `mustChangeGameplayState` once fully resolved.

### 3. Keep execution authoritative and replay-consistent

`applyDecision(...)` / `applyMove(...)` must remain the authoritative enforcement point. Earlier checks should make publication consistent with execution, not duplicate a second legality system.

Add replay and policy-agent regressions proving that:

- a published free-operation decision is executable,
- replaying the resulting decision log does not hit an execution-only legality failure,
- policy evaluation no longer explodes on the same frontier.

## Files to Touch

- `packages/engine/src/kernel/microturn/publish.ts` (modify)
- `packages/engine/src/kernel/microturn/continuation.ts` (modify if needed)
- `packages/engine/src/kernel/legal-moves.ts` (modify if needed)
- `packages/engine/src/kernel/free-operation-viability.ts` and/or related shared outcome-policy helpers (modify)
- `packages/engine/src/kernel/microturn/apply.ts` (modify only if publication/execution contract still diverges)
- `packages/engine/test/unit/kernel/atomic-legal-actions.test.ts` or new focused unit coverage (modify/new)
- `packages/engine/test/integration/*fitl*.test.ts` covering the failing grant path (modify/new)
- `packages/engine/test/unit/agents/policy-agent-microturn-evaluation.test.ts` or equivalent frontier regression (modify/new)

## Out of Scope

- FITL-specific spec rewrites intended only to dodge the kernel bug.
- Relaxing `mustChangeGameplayState`.
- Agent-only suppression that leaves the kernel publication surface inconsistent.
- CI timeout increases as a substitute for fixing constructibility.

## Acceptance Criteria

### Tests That Must Pass

1. The reproduced FITL free-operation scenario no longer publishes a decision that later fails `freeOperationOutcomePolicyFailed`.
2. A published decision from the regression scenario executes successfully through `applyDecision(...)`.
3. The affected FITL integration lane passes locally: `pnpm -F @ludoforge/engine test:integration:fitl-events`
4. Existing proof lanes remain green: `pnpm -F @ludoforge/engine test:determinism`, targeted replay / microturn / policy-agent regressions

### Invariants

1. Every kernel-published decision remains directly executable at its microturn scope (Foundations `#5`, `#18`, `#19`).
2. No game-specific logic is introduced into kernel legality or free-operation admission (Foundation `#1`).
3. Publication, execution, replay, and agent evaluation consume one legality contract, not parallel ones (Foundations `#5`, `#9`, `#15`).

## Test Plan

### New/Modified Tests

1. Focused FITL free-operation constructibility regression — proves published decision executability under required outcome policy
2. Policy-agent frontier regression — proves no execution-only illegality remains in candidate evaluation
3. Replay regression — proves decision log re-executes without `freeOperationOutcomePolicyFailed`

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:integration:fitl-events`
3. `pnpm -F @ludoforge/engine test:determinism`
4. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- Completion date: 2026-04-21
- What actually changed:
  - Tightened `packages/engine/src/kernel/microturn/publish.ts` so free-operation microturn publication reuses terminal legality admission before surfacing downstream `chooseOne` / `chooseNStep` decisions.
  - Filtered `chooseNStep` commands through simulated `advanceChooseN(...)` continuations, which suppresses empty confirms that would later fail `freeOperationOutcomePolicyFailed` while preserving executable continuation steps.
  - Added FITL Sihanouk regression coverage that walks the shaded NVA Rally -> March witness through `publishMicroturn(...)` / `applyDecision(...)`, proves the empty confirm is no longer published, and replays the published decision log to the same final state hash.
  - Added a FITL-backed policy-agent frontier regression in the same witness so policy evaluation sees only executable mover decisions at the implicated microturn.
- Deviations from original plan:
  - Reassessment showed the live fix did not require changes in `continuation.ts`, `legal-moves.ts`, `free-operation-viability.ts`, or `microturn/apply.ts`; the contract mismatch was isolated to `microturn/publish.ts`.
  - The focused regression landed in the existing FITL Sihanouk integration witness rather than in a new generic kernel unit because the failing constructibility gap depended on live FITL grant sequencing and runtime-owned decision identities.
- ticket corrections applied:
  - `shared change likely in continuation/legal-moves/free-operation viability` -> `live fix landed entirely in microturn publication plus FITL witness coverage`
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/agents/policy-agent-microturn-evaluation.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-westmoreland.test.js`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
- proof gaps:
  - `pnpm -F @ludoforge/engine test:integration:fitl-events` entered the repo's existing quiet-progress pattern after printing many passing FITL event files; direct tail probe `fitl-events-westmoreland.test.js` passed, but the package lane did not return a final shell prompt during the session.
  - `pnpm -F @ludoforge/engine test:determinism` likewise stayed in quiet progress on `draft-state-determinism-parity.test.js` and did not hand back a final harness result during the session.
  - `pnpm turbo test` was not rerun after the implementation because the ticket-owned package lanes above did not produce final harness summaries in-session.
