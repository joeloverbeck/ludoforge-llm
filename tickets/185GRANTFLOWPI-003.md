# 185GRANTFLOWPI-003: Phase 2 — Generalized grant-flow continuation drive

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents/policy-preview.ts` (continuation drive); possibly `packages/engine/src/kernel/legal-moves.ts` / `kernel/microturn/*` (generic grant-authorization helpers / published-action metadata)
**Deps**: `archive/tickets/185GRANTFLOWPI-001.md`, `tickets/185GRANTFLOWPI-002.md`

## Problem

The current `outcomeGrantContinuation` continuation in `driveSyntheticCompletion` (`policy-preview.ts:902-1133`) advances only while the top decision context is `outcomeGrantResolve`, which merely marks the grant `offered` (`microturn/apply.ts:746-770`). On the next iteration the top frame is a fresh `actionSelection` containing the `freeOperation: true` move, which the driver treats as a turn boundary and finalizes `completed` (`policy-preview.ts:1020-1033`) — **before** the granted operation's effects execute (effects run in `apply-move.ts:1417-1462` via `executeMoveAction` → `applyEffects`). This is the substantive engine change: continue, bounded and deterministically, through the `freeOperation: true` action-selection (and any inner choices) that actually executes the granted effect, so preview refs see the post-effect state.

## Assumption Reassessment (2026-05-20)

1. `legalMoves` already enumerates pending free-operation grants into `freeOperation: true` moves via `enumeratePendingFreeOperationMoves` (`legal-moves.ts:766-1271`) with authorization through `free-operation-grant-authorization.ts`; `applyMoveCore` executes effects then consumes the grant (`apply-move.ts:1417-1462`) — verified this session. The authorization machinery exists; this ticket consumes it and adds only a thin generic predicate ("is this move's grant part of the origin candidate's chain?") if the existing APIs cannot answer it.
2. Ticket 001 supplies the `grantFlowPartial` finalization status; ticket 002 supplies the generalized config shape + `grantFlow` cap-class budgets this drive reads. Both are hard prerequisites.
3. The drive must reuse the existing deterministic inner-preview completion policy applied to the grant-authorized move set — no new selection algorithm.

## Architecture Check

1. Continuation uses the real one-rules protocol (publish microturn → choose deterministic legal move → `applyMove`) with no preview-only effect shortcut, so preview state equals what runtime would produce (Foundation #5, #8).
2. The consequence-chain boundary (§5.1) is expressed purely over generic kernel metadata — origin seat/turn, pending-grant authorization, `move.freeOperation`, decision-context kind — never FITL identifiers (Foundation #1).
3. Bounded by the `grantFlow` cap classes from ticket 002; deterministic selection yields identical trajectory and trace for a given candidate stable key (Foundation #8, #10).
4. Any new kernel helper is a generic question over grant authorization, added to `legal-moves.ts`, not a FITL branch (Foundation #1, #15).

## What to Change

### 1. Define and enforce the consequence-chain boundary (§5.1)

Continue through a frame iff: the frame's seat == origin candidate's seat AND turn == origin candidate's turn; AND the frame is either an `outcomeGrantResolve` for a grant created by/chained from the origin candidate's application, or an `actionSelection` whose only continuation-eligible legal moves are `freeOperation: true` moves authorized by such a grant (or inner `chooseOne`/`chooseNStep` required to complete such a move). Stop (finalize) at: a fresh `actionSelection` offering non-grant ordinary moves; a non-origin seat/turn frame; `turnRetirement`; cap exhaustion (→ `postGrantCap`/`freeOperationCap`); a stochastic/hidden decision (existing handling); or application failure (→ `failed`).

### 2. Continuation mechanics (§5.2)

Publish the microturn, choose a deterministic legal grant/free-operation move under the configured completion policy, apply via the same `applyMove` path as runtime, continue through inner choices, loop until a §5.1 stop condition. No preview-only behavior in `apply-move.ts`.

### 3. Selection policy + determinism (§5.3)

Reuse the deterministic inner-preview completion policy on the grant-authorized move set. Same candidate stable move key ⇒ identical trajectory ⇒ identical trace. RNG state unchanged except where a stochastic decision is explicitly reached (then exit `stochastic`).

### 4. Generic kernel helpers (only if needed)

If `legalMoves`/microturn publication does not expose enough to answer "is this `freeOperation` move authorized by a grant in the origin candidate's chain?", add generic helpers (e.g., `isMoveGrantAuthorized`, `canonicalGrantForMove`, `isGrantRequired`) in `legal-moves.ts` and/or generic metadata on published legal actions in `microturn/*`. Keep decision-stack identity deterministic.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify — generalized continuation drive)
- `packages/engine/src/kernel/legal-moves.ts` (modify — generic grant-authorization helpers, if needed)
- `packages/engine/src/kernel/microturn/` (modify — generic published-action metadata, if needed)
- `packages/engine/test/architecture/preview-post-grant/post-grant-free-operation-continuation.test.ts` (new)
- `packages/engine/test/architecture/preview-post-grant/grant-flow-consequence-chain-boundary.test.ts` (new)

## Out of Scope

- Exit-reason taxonomy detail + ordered trace segments + populating summary counters (ticket 004).
- WASM parity (ticket 005).
- The FITL ARVN witness and FITL-like ordered fixture (ticket 006).
- Cap-class registry/budget definitions (ticket 002).

## Acceptance Criteria

### Tests That Must Pass

1. New free-operation continuation fixture (failing-first / TDD): opt-out / pre-fix stops at grant `offered` with the target value unchanged and refs non-`ready`; generalized continuation executes the granted operation and the projected value changes.
2. Boundary test: continuation never advances into a non-origin seat/turn or a fresh independent `actionSelection`.
3. Determinism: same candidate stable key ⇒ identical continuation trajectory and trace across repeated runs.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Preview continuation applies the same real move path as runtime; no preview-only effect path (Foundation #5).
2. Continuation is bounded by a named cap class and deterministic (Foundation #8, #10).
3. Replay identity is unchanged for games that do not use free-operation grants.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-post-grant/post-grant-free-operation-continuation.test.ts` — tiny generic card-driven game; root action creates a pending free-operation grant; the only effectful change occurs when the offered `freeOperation: true` move executes. `// @test-class: architectural-invariant`.
2. `packages/engine/test/architecture/preview-post-grant/grant-flow-consequence-chain-boundary.test.ts` — proves the §5.1 stop conditions. `// @test-class: architectural-invariant`.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/architecture/preview-post-grant/post-grant-free-operation-continuation.test.js`
2. `pnpm turbo lint && pnpm turbo typecheck && pnpm -F @ludoforge/engine test:all`
