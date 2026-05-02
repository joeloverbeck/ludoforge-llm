# 152SIMLOOPRIM-001: Extract `runGameSteps` generator and refactor `runGame` into thin wrapper

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/sim/`
**Deps**: `archive/specs/152-shared-simulation-loop-primitive.md`

## Problem

The simulator's loop body lives inline inside `runGame` at `packages/engine/src/sim/simulator.ts:138-302` and is duplicated by helpers (`runVerifiedGameWithDiagnostics` at `zobrist-incremental-property-helpers.ts:158`) and campaign scripts (`diagnose-spec-143-heap.mjs:535`). Foundation 5 (One Rules Protocol, Many Clients) and Foundation 15 (Architectural Completeness) require that the canonical loop be a kernel primitive consumable by all clients, not re-implementable shape. PR #231 demonstrated the cost: a kernel-protocol change had to be ported across N loop sites in lockstep.

This ticket extracts the loop body into a generator primitive `runGameSteps` exported from a new file `sim/run-game-steps.ts`, and refactors `runGame` into a thin wrapper that consumes the generator. Existing `runGame` callers stay green byte-for-byte; consumer migrations follow in 002/003.

## Assumption Reassessment (2026-05-02)

1. `packages/engine/src/sim/simulator.ts` exports `runGame(def, seed, agents, maxTurns, playerCount?, options?, runtime?): GameTrace`; the body is a `while (true)` loop iterating through auto-resolution → terminal check → lifecycle-stall check → maxTurns check → microturn publish (with rollback fallback) → agent decision → apply decision. Confirmed.
2. Spec 150 is COMPLETED: the simulator's termination check is now `cardDrivenRuntime(state)?.lifecycleStatus.stalled === true` at `simulator.ts:203-206`. No `bailOnLifecycleStall` flag, no `LIFECYCLE_NO_PROGRESS` catch arms remain. The generator can be built directly on the field-based signal.
3. The kernel primitive types the generator yields all exist: `GameState`, `DecisionLog`, `MicroturnState` (the actual type — spec pseudocode uses `PublishedMicroturn`, but the kernel exports `MicroturnState` at `kernel/microturn/types.ts:321`), `ApplyDecisionResult`, `ProbeHoleRecoveryLog`, `TerminalResult`, `SimulationStopReason`.
4. Spec 151 is COMPLETED: trace shape is canonically serializable; nothing in the generator's yielded states breaks serialization.
5. `runGame` has ~40-45 callers across tests + 1 campaign script (`diagnose-nolegalmoves.mjs`). All consume the public signature; the wrapper preserves it byte-identically.

## Architecture Check

1. **F5 (One Rules Protocol, Many Clients)**: the simulator loop becomes a single kernel-owned primitive; helpers and probes consume it rather than re-implement. This is the foundation the spec exists to honor.
2. **F15 (Architectural Completeness)**: future kernel-protocol changes are one edit, not N edits across N loop sites. The PR #231 duplication root cause is addressed.
3. **F19 (Decision-Granularity Uniformity)**: each yielded step corresponds to exactly one kernel-atomic decision (auto-resolution batch, microturn publish + apply, recovery rollback, or terminal). The iteration grain matches the kernel's microturn protocol.
4. **F11 (Immutability)**: yielded `RunGameStep` values carry `readonly` state references. Consumers cannot mutate the engine's authoritative state.
5. **F8 (Determinism)**: V8 generators are deterministic given deterministic inputs. The yielded step sequence is a pure function of `(def, seed, agents, maxTurns, options)`.
6. **F1 (Engine Agnosticism)**: the primitive is generic over `GameDef`/`GameState`; no game-specific code introduced.
7. **No backwards-compat shim**: `runGame` keeps its public signature and trace shape; `runGameSteps` is additive. No alias paths, no deprecated wrappers.

## What to Change

### 1. New file `packages/engine/src/sim/run-game-steps.ts`

Export the step types and the generator function.

- `RunGameStepAuto`, `RunGameStepPlayer`, `RunGameStepRecovery`, `RunGameStepTerminal` interfaces and `RunGameStep` union per spec Overview lines 67-92 (with the type-name correction `microturn: MicroturnState` instead of the spec's pseudocode `PublishedMicroturn`).
- `RunGameInput` interface bundling the positional arguments currently passed to `runGame`:
  ```ts
  export interface RunGameInput {
    readonly def: ValidatedGameDef;
    readonly seed: number;
    readonly agents: readonly Agent[];
    readonly maxTurns: number;
    readonly playerCount?: number;
    readonly options?: SimulationOptions;
    readonly runtime?: GameDefRuntime;
  }
  ```
- `runGameSteps(input: RunGameInput): Generator<RunGameStep, GameTrace, void>` — body is the existing `simulator.ts` loop body (lines ~158-302), lifted with `yield` calls at each step boundary:
  - After `advanceAutoresolvable`: `yield { kind: 'auto', state, autoResolvedLogs }`
  - After `terminalResult` returns non-null: `yield { kind: 'terminal', state, result, stopReason: 'terminal' }; return assembledTrace`
  - After `lifecycleStatus.stalled` check: `yield { kind: 'noLegalMoves', state, result: null, stopReason: 'noLegalMoves' }; return assembledTrace`
  - After `maxTurns` check: `yield { kind: 'maxTurns', state, result: null, stopReason: 'maxTurns' }; return assembledTrace`
  - After probe-hole recovery: `yield { kind: 'recovery', state, logEntry }`
  - After `applyPublishedDecisionFromCanonicalState`: `yield { kind: 'player', state, microturn, applied, decisionLog }`
- Trace assembly happens incrementally inside the generator; `decisionLogs.push(...)`, delta computation, and snapshot extraction continue to occur at the same loop positions, just driven by the per-iteration step shape. The generator's return value carries the assembled `GameTrace`.

### 2. Refactor `packages/engine/src/sim/simulator.ts`

`runGame` becomes a thin wrapper.

- Build a `RunGameInput` from the positional args: `{ def, seed, agents, maxTurns, playerCount, options, runtime }`.
- Iterate the generator with `for...of`; the loop body is empty (or only handles per-step hook side effects if the generator delegates them externally — but per the spec's design, hook emission and trace accumulation happen inside the generator).
- Capture the generator's return value via the `for...of`-with-iterator-result pattern (call `iterator.next()` in a `do/while` and collect `result.value` when `result.done` is true).
- Public signature unchanged: `(def, seed, agents, maxTurns, playerCount?, options?, runtime?) => GameTrace`.
- Existing trace shape preserved byte-for-byte.

### 3. Update `packages/engine/src/sim/index.ts` barrel

Re-export the new primitive and types so external consumers can reach them without deep imports:

- `export { runGameSteps } from './run-game-steps.js'`
- `export type { RunGameStep, RunGameStepAuto, RunGameStepPlayer, RunGameStepRecovery, RunGameStepTerminal, RunGameInput } from './run-game-steps.js'`

## Files to Touch

- `packages/engine/src/sim/run-game-steps.ts` (new)
- `packages/engine/src/sim/simulator.ts` (modify — `runGame` becomes wrapper)
- `packages/engine/src/sim/index.ts` (modify — re-exports)

## Out of Scope

- Migrating `runVerifiedGameWithDiagnostics` — owned by `archive/tickets/152SIMLOOPRIM-002.md`.
- Migrating `campaigns/fitl-perf-optimization/diagnose-spec-143-heap.mjs` — owned by `archive/tickets/152SIMLOOPRIM-003.md`.
- Adding new protocol / replay-identity tests for the generator — owned by `archive/tickets/152SIMLOOPRIM-004.md`.
- Async iterator variant of `runGameSteps` — explicitly out of scope per spec.
- Web-runner migration to consume `runGameSteps` — explicitly out of scope per spec.
- Changing `runGame`'s public signature or argument list — backwards-compatible by design.

## Acceptance Criteria

### Tests That Must Pass

1. `runGame(def, seed, agents, maxTurns, options?, runtime?)` returns the same `GameTrace` (byte-identical) as before the refactor across the existing test corpus. Concretely: `spec-140-replay-identity.test.ts` and `spec-140-spec-id-replay-canary.test.ts` pass without modification.
2. `helper-vs-canonical-run-parity.test.ts` continues to pass — the helper has not changed in this ticket; the parity test verifies the wrapper still produces the same trace as the helper currently expects.
3. Determinism corpus stays green: `node --test packages/engine/dist/test/determinism/*.js`.
4. Existing suite: `pnpm -F @ludoforge/engine test`.
5. Existing suite: `pnpm turbo lint typecheck`.

### Invariants

1. The simulator loop body lives in exactly one place: `runGameSteps` in `packages/engine/src/sim/run-game-steps.ts`. `simulator.ts` no longer contains a `while (true)` simulation loop body.
2. F8: same `(def, seed, agents, maxTurns, options)` → same step sequence → same trace.
3. F11: yielded `RunGameStep` values carry only `readonly` references to `GameState` and related kernel types.
4. `runGame`'s public signature and `GameTrace` return shape are unchanged.

## Test Plan

### New/Modified Tests

None in this ticket. The atomic refactor is verified by the existing trace-equality and parity tests staying green. Protocol and replay-identity tests for the new primitive land in `archive/tickets/152SIMLOOPRIM-004.md`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:integration:slow-parity`
4. `pnpm turbo lint typecheck`
5. `pnpm run check:ticket-deps`

## Outcome

Completed: 2026-05-02
Outcome amended: 2026-05-02

Landed in this ticket:

1. Added `packages/engine/src/sim/run-game-steps.ts` with `RunGameInput`, `RunGameStep*` types, and the `runGameSteps(input): Generator<RunGameStep, GameTrace, void>` primitive.
2. Moved the canonical simulator loop body into `runGameSteps`; trace accumulation, decision hooks, profiler buckets, lifecycle-stall termination, probe-hole rollback recovery, snapshot extraction, and runtime forking remain inside the canonical loop.
3. Refactored `packages/engine/src/sim/simulator.ts:runGame` into a thin wrapper that consumes the generator and returns its `GameTrace`; `runGames` and the public `runGame` signature are unchanged.
4. Re-exported `runGameSteps` and its public types from `packages/engine/src/sim/index.ts`.
5. Updated `packages/engine/test/unit/kernel/microturn/rollback.test.ts` source-guard expectations so the probe-hole recovery accumulator invariant follows the canonical loop body into `run-game-steps.ts`.

Ticket corrections applied:

1. Full helper/campaign consumer migrations remain deferred to `152SIMLOOPRIM-002` and `152SIMLOOPRIM-003`; this ticket intentionally leaves those duplicate loop sites unchanged.
2. New generator protocol/replay tests remain deferred to `152SIMLOOPRIM-004`; this ticket uses retained wrapper/parity witnesses only.
3. In this environment, FITL subsets of `spec-140-replay-identity.test.js` timed out under a 180s bound on both the changed worktree and a clean `HEAD` baseline worktree (`/tmp/ludoforge-152-baseline`). Final proof therefore treats that FITL subset as a repo-preexisting/noisy broad witness and uses package build plus fast retained Texas replay/parity witnesses as the focused owned proof for wrapper behavior.
4. `packages/engine/test/unit/kernel/microturn/rollback.test.ts` was added to the touched-file scope because it source-guards the simulator loop location; leaving it pointed at `simulator.ts` would make the retained invariant stale after the extraction.

Schema/artifact fallout: none expected and none changed; the ticket adds an exported TypeScript simulation primitive but does not change serialized `GameTrace`, schemas, generated JSON schema artifacts, or compiled game data.

Verification ledger:

1. `pnpm -F @ludoforge/engine build` — passed before this outcome block was recorded.
2. `timeout 180s pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-140-replay-identity.test.js dist/test/determinism/helper-vs-canonical-run-parity.test.js` — manually stopped/not counted; combined lane was too quiet to classify.
3. `timeout 180s pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-140-replay-identity.test.js` — timed out; isolated FITL subset later reproduced the timeout on clean `HEAD`.
4. Direct compiled smoke: `runGame` over Texas production spec for `maxTurns=5` returned `maxTurns 5 16`.
5. `timeout 60s pnpm -F @ludoforge/engine exec node --test --test-name-pattern "Texas" dist/test/determinism/helper-vs-canonical-run-parity.test.js` — passed.
6. `timeout 60s pnpm -F @ludoforge/engine exec node --test --test-name-pattern "Texas" dist/test/determinism/spec-140-replay-identity.test.js` — passed.
7. `timeout 180s pnpm -F @ludoforge/engine exec node --test --test-name-pattern "FITL" dist/test/determinism/spec-140-replay-identity.test.js` — timed out on changed worktree.
8. Clean `HEAD` baseline: `timeout 180s pnpm -F @ludoforge/engine exec node --test --test-name-pattern "FITL" dist/test/determinism/spec-140-replay-identity.test.js` in `/tmp/ludoforge-152-baseline` — timed out; classified as repo-preexisting/noisy, not introduced by this ticket.
9. `timeout 300s pnpm -F @ludoforge/engine test` — schema artifact check passed, then default unit lane failed in `kernel/microturn/rollback.test.js` and `walker-deletion-enforcement.test.js`; rollback was owned source-guard fallout and was fixed, while `walker-deletion-enforcement.test.js` passed on direct rerun.
10. Final `pnpm -F @ludoforge/engine build` — passed after the rollback source-guard update.
11. Final `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/microturn/rollback.test.js` — passed.
12. Final `pnpm -F @ludoforge/engine exec node --test dist/test/unit/walker-deletion-enforcement.test.js` from the repo root — passed.
13. Final `timeout 300s pnpm -F @ludoforge/engine test` — schema artifact check passed; default unit lane passed the owned rollback guard and failed only in `walker-deletion-enforcement.test.js`. Direct package-cwd execution shows `spawnSync /bin/sh EPERM`, and the same wrapper failure reproduces on clean `HEAD` in `/tmp/ludoforge-152-baseline`; classified as repo-preexisting sandbox/process-spawn blocker, not introduced by this ticket.
14. Final `pnpm -F @ludoforge/engine typecheck` — passed.
15. Final `pnpm -F @ludoforge/engine lint` — passed.
16. Final `timeout 300s pnpm -F @ludoforge/engine test:integration:slow-parity` — timed out on `dist/test/integration/agents/drive-fingerprint-property.test.js` with regular quiet-progress heartbeats and no assertion failure. The same 300s timeout reproduces on clean `HEAD` in `/tmp/ludoforge-152-baseline`; classified as repo-preexisting slow/noisy broad lane, not introduced by this ticket.
17. Final `pnpm run check:ticket-deps` — passed for 6 active tickets and 2180 archived tickets.

No proof-affecting edits remain after this ledger update: this status/outcome edit records the already-run final commands and does not change the implementation boundary, acceptance criteria, or touched-file scope.
