# 185GRANTFLOWPI-003: Phase 2 — Generalized grant-flow continuation drive

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents/policy-preview.ts` (continuation drive); possibly `packages/engine/src/kernel/legal-moves.ts` / `kernel/microturn/*` (generic grant-authorization helpers / published-action metadata)
**Deps**: `archive/tickets/185GRANTFLOWPI-001.md`, `archive/tickets/185GRANTFLOWPI-002.md`

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

## Outcome

Completed on 2026-05-20.

What landed:

- `driveSyntheticCompletion` now continues an enabled grant-flow preview through the real published `freeOperation: true` action-selection move for the same origin seat/turn, using the existing deterministic move key ordering and real `applyMove` path. Opt-out behavior still stops at the offered grant.
- Added a distinct free-operation segment budget and `freeOperationCap` exit so exhausted free-operation continuation is visible instead of collapsing into a generic completion or depth cap.
- Added the required architecture tests:
  - `packages/engine/test/architecture/preview-post-grant/post-grant-free-operation-continuation.test.ts`
  - `packages/engine/test/architecture/preview-post-grant/grant-flow-consequence-chain-boundary.test.ts`
- Updated the generic post-grant fixture so the granted operation mutates an observable global value only when the free operation executes.
- Updated the grant-flow status/trace tests, `Trace.schema.json`, and legacy preview golden fixtures to reflect the newly reachable grant-flow outcome counters and the corrected ready/differentiating behavior for affected ARVN parity seeds.

Scope notes:

- No new `legal-moves.ts` or `microturn/*` helper was needed. The live `move.freeOperation` flag plus same origin seat/turn boundary was sufficient for this ticket's generic consequence-chain guard.
- Rich ordered trace segments and full taxonomy presentation remain ticket 004. This ticket added only the minimal `freeOperationCap` enum/counter plumbing required because 003 makes that exit reachable.
- WASM parity remains ticket 005. FITL ARVN profile-quality witnesses remain ticket 006.
- The first `test:all` run exposed stale compiled `dist` files for the retired `preview-config-back-compat` tests. I cleaned `packages/engine/dist`, rebuilt, refreshed the ticket-owned golden fixtures, and reran the broad lane green.

Source-size hard-gate ledger:

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor |
| --- | ---: | ---: | --- | ---: | --- | --- |
| `packages/engine/src/agents/policy-preview.ts` | 1410 | 1498 | no; preexisting over 800 | +88 | User-approved 2026-05-20 Spec 185 Option 1 minimal-touch deferral; extraction would widen the grant-flow drive while the change stays local to the existing preview driver. | none for 003 |
| `packages/engine/src/agents/policy-eval.ts` | 1724 | 1730 | no; preexisting over 800 | +6 | User-approved 2026-05-20 Spec 185 Option 1 minimal-touch deferral; only outcome-count plumbing was added. | none for 003 |
| `packages/engine/src/kernel/types-core.ts` | 2749 | 2750 | no; preexisting over 800 | +1 | User-approved 2026-05-20 Spec 185 Option 1 minimal-touch deferral; only the trace/status union was extended. | none for 003 |
| `packages/engine/src/kernel/schemas-core.ts` | 3037 | 3038 | no; preexisting over 800 | +1 | User-approved 2026-05-20 Spec 185 Option 1 minimal-touch deferral; only schema enum/counter shape was extended. | none for 003 |

Verification:

- `pnpm turbo build` — passed after the final clean rebuild. Runner emitted the existing Vite bundle-size advisory; no engine failure.
- `node --test packages/engine/dist/test/architecture/preview-post-grant/post-grant-free-operation-continuation.test.js` — passed, 2 tests.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm -F @ludoforge/engine test` — passed, 162/162 default files.
- `pnpm -F @ludoforge/engine run clean && pnpm turbo build && pnpm -F @ludoforge/engine test:all` — final broad rerun passed, 943/943 files.
