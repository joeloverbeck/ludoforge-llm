# Spec 140 Worker-Bridge Rewiring Checklist

This checklist audits the current runner-side consumers of the bridge APIs that Spec 140 retires:

- `enumerateLegalMoves` / `legalMoves`
- `legalChoices`
- `advanceChooseN`
- `applyMove` / `applyTrustedMove` / `applyTemplateMove`
- `ChooseNTemplate`, `ChooseNSession`, `advanceChooseNWithSession`, `isChooseNSessionEligible`, `isSessionValid`, `createChooseNSession`
- worker-facing `certificateIndex` handling

The live source of truth is `packages/runner/src/worker/game-worker-api.ts` plus all runner source and test references found by grep on 2026-04-20.

## Current Surface Summary

- The bridge still owns the full legacy move/template pipeline in [game-worker-api.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/worker/game-worker-api.ts).
- Direct source consumers live in:
  - [game-store.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/store/game-store.ts)
  - [replay-runtime.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/session/replay-runtime.ts)
  - [replay-controller.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/replay/replay-controller.ts)
- The test suite has broad direct coupling to the retired API family:
  - worker API tests
  - clone-compat structured-clone coverage
  - game-store unit tests and async-serialization tests
  - replay-controller tests
- `packages/runner/test/worker/choose-n-session-integration.test.ts` is the primary direct witness for the `ChooseNSession` path and should delete outright in ticket `010`.

## Rewiring Rules

- `enumerateLegalMoves` / `legalMoves` consumers rewrite to `publishMicroturn()` plus `microturn.legalActions`.
- `legalChoices` consumers stop constructing partial moves. They read the currently published `MicroturnState` and branch on `decisionContext.kind`.
- `advanceChooseN` consumers rewrite to `applyDecision({ kind: 'chooseNStep', command, value? })`.
- `applyMove`, `applyTrustedMove`, and `applyTemplateMove` consumers rewrite to `applyDecision(...)`, followed by `advanceAutoresolvable()` whenever the next published state is kernel-owned.
- `ChooseNSession` and related helpers delete. The authoritative in-flight state becomes the serialized decision stack in kernel state, not worker-local session caches.
- Replay flows stop thinking in `Move[]` once ticket `006` lands. They step through `DecisionLog[]` / `Decision[]` plus `advanceAutoresolvable`.

## Source Migration Checklist

| Legacy surface | Current source consumer | Current role | Microturn-native replacement |
| --- | --- | --- | --- |
| `enumerateLegalMoves` | `packages/runner/src/store/game-store.ts` | Bootstraps `legalMoveResult`, computes action availability, feeds AI turn resolution, refreshes state after mutations. | Replace store-owned `legalMoveResult` refresh with `publishMicroturn()`. For action-selection toolbars, derive availability from `currentMicroturn.decisionContext.kind === 'actionSelection'` and `currentMicroturn.legalActions`. AI handoff should consume the same published microturn instead of a classified move list. |
| `legalChoices` | `packages/runner/src/store/game-store.ts` | Builds `choicePending`, `partialMove`, and `choiceStack` after `selectAction`, `chooseOne`, and rewind. | Delete partial-move reconstruction. `currentMicroturn` becomes the single source of truth; `chooseOne` UI submits `applyDecision` directly and then republishes the next microturn. |
| `advanceChooseN` | `packages/runner/src/store/game-store.ts` | Advances worker-managed `chooseN` session state and folds the finalized value back into `choiceStack`. | Replace with `applyDecision({ kind: 'chooseNStep', command: 'add' | 'remove' | 'confirm', value? })`. Selected values stay in kernel state and republish through `currentMicroturn`. |
| `applyMove` | `packages/runner/src/store/game-store.ts` | Confirms the fully-built player move. | Replace with a final player `applyDecision(...)`, then `advanceAutoresolvable()` until the next player-visible microturn or terminal state. |
| `applyTrustedMove` | `packages/runner/src/store/game-store.ts` | Executes agent-selected trusted moves from `agentTurnOrchestrator`. | Replace the orchestrator contract with trusted `Decision` selection against `publishMicroturn()`, then execute via `applyDecision(...)` plus `advanceAutoresolvable()`. |
| `enumerateLegalMoves` | `packages/runner/src/session/replay-runtime.ts` | Hydrates replay projection with a legal-move snapshot after each replay step. | Replace with `publishMicroturn()` and terminal state. Replay hydration should project `currentMicroturn` instead of a `LegalMoveEnumerationResult`. |
| `applyMove` | `packages/runner/src/replay/replay-controller.ts` | Replays historical move history one move at a time with trace capture. | After ticket `006`, replay iterates `DecisionLog[]` / serialized decisions, not `Move[]`. Each playback step becomes `applyDecision(...)`, with `advanceAutoresolvable()` covering chance/kernel spans. |
| `playSequence` (adjacent legacy helper) | `packages/runner/src/replay/replay-controller.ts` | Fast-forwards replay prefixes using legacy move history. | Replace with decision-prefix replay once the trace protocol migrates; keep this paired with the `applyMove` rewrite so replay is internally consistent. |
| `enumerateLegalMoves` | `packages/runner/src/store/agent-turn-orchestrator.ts` via `game-store.ts` | Supplies legal classified moves to AI selection. | Replace the orchestrator input with the published `MicroturnState`; AI chooses one `Decision` from `microturn.legalActions`. |

## Session-State Retirement Checklist

The current runner store and worker bridge still encode speculative move state that Spec 140 deletes:

| Legacy state | Current location | Current role | Replacement |
| --- | --- | --- | --- |
| `chooseNSession` + `revision` | `packages/runner/src/worker/game-worker-api.ts` | Worker-local cache for repeated `advanceChooseN` calls. | Delete entirely. Decision-stack serialization is authoritative; stale request invalidation stays on `OperationStamp`. |
| `selectedAction` | `packages/runner/src/store/game-store.ts` | Top-level selected action for partial move construction. | Derive from `currentMicroturn.compoundTurnTrace[0]` when the active turn has already chosen an action; otherwise derive from the action-selection microturn itself. |
| `partialMove` | `packages/runner/src/store/game-store.ts` | Mutable client-side move under construction. | Delete entirely. The kernel owns in-progress decision state. |
| `choiceStack` | `packages/runner/src/store/game-store.ts` | Breadcrumb trail for previous choice binds. | Derive from `currentMicroturn.compoundTurnTrace`. |
| `choicePending` | `packages/runner/src/store/game-store.ts` | Current `ChoiceRequest` from `legalChoices`. | Replace with `currentMicroturn: MicroturnState | null`. |
| `legalMoveResult` | `packages/runner/src/store/game-store.ts` and replay store | Cached move enumeration result. | Replace with `currentMicroturn` and any derived action availability computed from `microturn.legalActions`. |
| `actionAvailabilityById` | `packages/runner/src/store/game-store.ts` | UI helper built from `enumerateLegalMoves`. | Recompute only for `actionSelection` microturns from published legal decisions. |

## Worker-API Internal Rewrite Checklist

| Legacy symbol | Current live use in `game-worker-api.ts` | Replacement in ticket `010` |
| --- | --- | --- |
| `enumerateLegalMoves` | Imported, exposed on `GameWorkerAPI`, used to build worker-safe `LegalMoveEnumerationResult`. | Delete. Add `publishMicroturn(): Promise<MicroturnState>`. |
| `legalChoicesEvaluate` | Builds `ChoiceRequest` and captures `ChooseNTemplate`. | Delete. Publication is kernel-owned. |
| `advanceChooseN` | Stateless `chooseN` stepping fallback. | Delete. `applyDecision` handles atomic choose-N step decisions. |
| `advanceChooseNWithSession` | Fast path for worker-local `ChooseNSession`. | Delete with session state. |
| `createChooseNSession` | Creates cached `ChooseNSession`. | Delete with session state. |
| `isChooseNSessionEligible` | Gates session creation. | Delete with session state. |
| `isSessionValid` | Checks worker-local revision against the session. | Delete with session state. |
| `ChooseNTemplate` / `ChooseNSession` | Imported types and local state. | Delete; no bridge-owned session model remains. |
| `applyMove` / `applyTrustedMove` / `applyTemplateMove` | Mutation entry points and history replay helpers. | Replace with `applyDecision`, `advanceAutoresolvable`, and `rewindToTurnBoundary`. |
| `certificateIndex` stripping | Removes non-cloneable certificate data from worker-facing enumeration results. | Delete with `LegalMoveEnumerationResult`; no certificate-bearing surface survives. |

## Test Migration Checklist

| Legacy surface | Current test consumer(s) | Required migration |
| --- | --- | --- |
| `ChooseNSession`, `advanceChooseNWithSession`, `isChooseNSessionEligible` | `packages/runner/test/worker/choose-n-session-integration.test.ts` | Delete the file entirely. Replace it with a fresh `microturn-session-integration.test.ts` that proves published microturns, sequential `applyDecision`, auto-resolve, rewind, and stale-stamp rejection. |
| `enumerateLegalMoves`, `legalChoices`, `advanceChooseN`, `applyMove`, `applyTemplateMove`, `certificateIndex` | `packages/runner/test/worker/clone-compat.test.ts` | Rewrite structured-clone coverage around `MicroturnState`, `ApplyDecisionResult`, `advanceAutoresolvable` results, and the absence of certificate payloads. |
| `enumerateLegalMoves`, `legalChoices`, `advanceChooseN`, `applyMove`, `applyTemplateMove` | `packages/runner/test/worker/game-worker.test.ts` | Rewrite worker contract tests around the new bridge surface. |
| `applyMove` | `packages/runner/test/replay/replay-controller.test.ts` | Rewrite replay controller tests to assert `applyDecision` / `advanceAutoresolvable` sequencing. |
| `legalChoices`, `advanceChooseN`, `applyMove` | `packages/runner/test/store/game-store-async-serialization.test.ts` | Update serialization/race tests to mock `publishMicroturn`, `applyDecision`, and `advanceAutoresolvable`. |
| `enumerateLegalMoves`, `legalChoices`, `advanceChooseN`, `applyMove`, `applyTrustedMove`, `applyTemplateMove` | `packages/runner/test/store/game-store.test.ts` | Rewrite the bridge test doubles and store expectations around `currentMicroturn` instead of partial-move state. |
| `enumerateLegalMoves` bridge mocks in store-adjacent tests | `packages/runner/test/session/replay-runtime.test.tsx`, `packages/runner/test/store/agent-turn-orchestrator.test.ts`, `packages/runner/test/store/ai-move-policy.test.ts`, `packages/runner/test/store/game-store.test.ts` | Replace bridge mocks and trusted-move provenance assumptions with microturn publication / decision selection fixtures. |

## Ticket 010 Execution Notes

- The source rewrite is concentrated in `game-worker-api.ts`, `game-store.ts`, replay helpers, and the worker/store/replay tests.
- `ChoicePanel`, `ActionToolbar`, and `InterruptBanner` are not bridge-call owners today; they are downstream consumers of store state. Their user-facing refactor remains ticket `011`, but ticket `010` must leave them compiling against the new store plumbing.
- No live runner source currently consumes `bridge.legalMoves()` directly; the meaningful move-enumeration owner is `enumerateLegalMoves()`.
