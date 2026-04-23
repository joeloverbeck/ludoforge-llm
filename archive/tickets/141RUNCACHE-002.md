# 141RUNCACHE-002: Run-like helper API surface audit and contract normalization

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/sim/simulator.ts` (JSDoc), helper files (JSDoc, possibly assertions)
**Deps**: `archive/tickets/141RUNCACHE-001.md`

## Problem

Spec 141 Design §2 and §5 require every run-like helper that accepts a `GameDefRuntime` to honor the same boundary contract as `runGame(...)` — fork internally, or require a pre-forked runtime with an explicit assertion. Today:

- `runGame` (`packages/engine/src/sim/simulator.ts:86-88`) forks correctly.
- `runVerifiedGame` (`packages/engine/test/helpers/zobrist-incremental-property-helpers.ts:102`) forks correctly.

Both helpers do the right thing. The problem is that the contract is inherited by imitation, not declared. Future helpers authored by anyone (including subagents and evolved campaigns) cannot verify compliance from the existing JSDoc or types. Foundation 5 (one rules protocol, many clients) demands the contract be explicit so every client exercises the same authoritative path.

Additionally, the spec requires an audit of helper-local mutable state — closure-captured state, module-scoped counters, Maps accumulated outside the runtime object — that could survive across runs and change which authoritative path is exercised. MICROPERFBOUND-001 (archived) showed that non-runtime mutable state can create repeated-run pathologies just as real as runtime cache retention.

## Assumption Reassessment (2026-04-22)

1. `runGame` signature and fork behavior verified at `packages/engine/src/sim/simulator.ts:74-88` during Spec 141 reassessment.
2. `runVerifiedGame` signature and fork behavior verified at `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts:91-160` during Spec 141 reassessment.
3. The public run-like helper surface is `runGame`, `runGames`, and `runVerifiedGame`. `runGames` also accepts `GameDefRuntime` and advances state transitively through `runGame`, so it inherits the same contract and requires the same JSDoc coverage.
4. This ticket's JSDoc and assertions build on the ownership-class vocabulary introduced in 141RUNCACHE-001 — references to `sharedStructural` / `runLocal` in the contract docs must match the classification from ticket 001.

## Architecture Check

1. Declaring the contract explicitly closes the Foundation 5 gap — no helper can drift without visibly violating a documented invariant.
2. The audit is generic (runtime-ownership-level, not game-specific); Foundation 1 holds.
3. No backwards-compatibility shims. If a helper currently violates the contract, this ticket fixes it directly rather than adding a compatibility wrapper.
4. Foundation 15 (architectural completeness): the audit covers non-runtime mutable state as well, addressing the lesson from MICROPERFBOUND-001 that "not every repeated-run boundedness failure is a pure cache-growth bug".

## What to Change

### 1. Audit all public helpers that accept `GameDefRuntime`

Enumerate every public export (src and test/helpers) that receives a `GameDefRuntime` and advances state. For each, record:

- Current runtime-boundary behavior (forks internally? requires forked runtime? shares unchanged?)
- Whether it bypasses `runGame` and calls kernel primitives directly
- Any helper-local mutable state (closure-captured Maps, module-scoped counters, arrays accumulating across calls)

Seed list (confirmed during Spec 141 reassessment; audit may surface more):

- `runGame` — `packages/engine/src/sim/simulator.ts:74`
- `runGames` — `packages/engine/src/sim/simulator.ts:222`
- `runVerifiedGame` — `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts:91`
- `createFitlRuntime`, `createTexasRuntime` — same helper file (construct, do not advance)

### 2. Add a canonical contract JSDoc to `runGame`

Above `runGame` in `packages/engine/src/sim/simulator.ts`, add a block JSDoc declaring the contract in full:

> **Run-boundary contract**: Callers may pass a shared `GameDefRuntime` reused across many `runGame` invocations. `runGame` internally forks the runtime via `forkGameDefRuntimeForRun(...)` before execution. `runLocal` members are reset to their declared initial state (see 141RUNCACHE-001); `sharedStructural` members are reused by reference. The caller's runtime is never mutated by `runGame`. Any helper that advances state with a caller-supplied runtime MUST honor the same contract — fork internally, or require a pre-forked runtime with an explicit assertion.

### 3. Mirror the contract JSDoc on `runVerifiedGame`

Add the same contract declaration to `runVerifiedGame`, pointing back to `runGame` as the canonical reference. Note explicitly that `runVerifiedGame` bypasses `runGame` and advances via `publishMicroturn` + `applyPublishedDecision` directly, and that this bypass inherits the fork contract.

### 4. Audit helper-local mutable state

Search for module-scoped mutable state in `packages/engine/src/sim/`, `packages/engine/src/kernel/`, and `packages/engine/test/helpers/` that could persist across runs:

- Module-scoped `Map`, `Set`, arrays, counters
- Closure-captured mutable references exposed via factory helpers
- Caches defined outside `GameDefRuntime`

For each finding, either (a) relocate the state onto `GameDefRuntime` with a declared class, (b) confirm it is build-time constant and document why it is safe, or (c) document why it is run-scoped and reset correctly.

### 5. Add optional assertion pattern

For helpers that require an already-forked runtime (if any exist or are added in future work), establish a small helper or marker to assert the runtime has been forked. This can be a no-op brand or a debug-only check — but the pattern should be available so future helpers can opt into "require forked input" cleanly rather than inventing their own convention.

## Files to Touch

- `packages/engine/src/sim/simulator.ts` (modify — JSDoc block on `runGame`)
- `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts` (modify — JSDoc block on `runVerifiedGame`)
- Additional files discovered during audit (document in the ticket's outcome on archival)

## Out of Scope

- Per-member ownership classification — owned by 141RUNCACHE-001.
- Forked-vs-fresh observable-equivalence test — owned by 141RUNCACHE-003.
- Helper vs canonical path equivalence witness — owned by 141RUNCACHE-004.
- Removing/rewriting `runVerifiedGame` — the helper is correct today; this ticket only documents the contract.

## Acceptance Criteria

### Tests That Must Pass

1. Existing test suite remains green: `pnpm turbo test`.
2. No new helper violates the contract (enforced by audit + JSDoc; no automated test required unless assertion pattern is added).

### Invariants

1. Every public helper accepting `GameDefRuntime` carries a JSDoc declaring its run-boundary behavior.
2. No helper-local mutable state survives across runs in a way that changes authoritative behavior; the audit found only structural module caches or per-call locals in the owned surface.
3. `runGame` and `runVerifiedGame` cite the same canonical contract language; any future helper that accepts a runtime either mirrors the JSDoc or asserts pre-forked input.

## Test Plan

### New/Modified Tests

1. No new tests in this ticket — the audit deliverables are JSDoc and (where needed) documentation of non-runtime state. Behavioral verification lives in 141RUNCACHE-003 (forked-vs-fresh) and 141RUNCACHE-004 (helper-vs-canonical).

### Commands

1. `pnpm turbo lint` (JSDoc must not trigger linter warnings)
2. `pnpm turbo typecheck`
3. `pnpm turbo test` (sanity — no behavioral change expected)

## Outcome

Completion date: 2026-04-22

- `ticket corrections applied`: public helper surface `runGame` + `runVerifiedGame` -> `runGame` + `runGames` + `runVerifiedGame`; `pnpm turbo lint` / `typecheck` / `test` -> package-local engine `build`, focused simulator witness, focused `runVerifiedGame` determinism witness, engine `lint`, and engine `typecheck` for the owned engine slice.
- `audit findings`: `packages/engine/src/kernel` and `packages/engine/src/sim` retain only structural module caches (`WeakMap` / lookup memo tables such as adjacency, selector, and dispatch caches) or per-call locals in the owned boundary; no helper-local run state outside `GameDefRuntime` required relocation.
- `verification set`: `pnpm -F @ludoforge/engine build`; `pnpm -F @ludoforge/engine exec node --test dist/test/unit/sim/simulator.test.js`; `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/zobrist-incremental-property-texas.test.js`; `pnpm -F @ludoforge/engine lint`; `pnpm -F @ludoforge/engine typecheck`
- `proof gaps`: none

Implemented the Spec 141 run-boundary contract normalization for the live public helper surface:

- added canonical run-boundary JSDoc to `runGame`
- documented `runGames` as the batch helper that inherits `runGame`'s fork-per-run contract
- mirrored the same contract on `runVerifiedGame`, including its direct `publishMicroturn` + `applyPublishedDecision` bypass
- added a reusable `ForkedGameDefRuntimeForRun` marker plus `assertGameDefRuntimeForkedForRun(...)` pattern for future helpers that want to require pre-forked runtimes explicitly
