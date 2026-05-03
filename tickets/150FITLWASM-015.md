# 150FITLWASM-015: Active WASM preview-route perf closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — production WASM preview-drive batching/runtime overhead and same-seam perf gate
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-014.md`, `archive/tickets/150FITLWASM-010.md`

## Problem

Ticket `150FITLWASM-010` wired production policy evaluation so supported
preview-drive candidate-feature rows and score rows use the generic WASM route
without TypeScript preview-driver materialization. The same-seam route is now
active and fail-closed-clean, but the original Spec 149 budget is still red:

- Command: `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-drive-application`.
- Verdict: RED, `elapsedMs=4124.29` versus `<=250 ms`.
- Active route counters: `wasmScoreRowRouteCount=62`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowRouteCount=70`, and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Remaining buckets: `simAgentChooseMove=1353.09 ms`,
  `agent:evaluatePolicyExpression=1351.04 ms`, and
  `simApplyMove=867.35 ms`.

The remaining owner is no longer production route activation or unsupported
preview-drive classes. The next non-overlapping owner is the runtime cost of
the active route itself: per-candidate preview-drive calls, slot/state-feature
materialization overhead, score-row bytecode compile/cache behavior, and any
residual TypeScript application work still exercised after the WASM route is
active.

## What to Change

1. Profile the active route with counters that distinguish route overhead,
   repeated compile/materialization work, and residual simulator apply cost.
2. Reduce the same-seam active-route cost without weakening the `<=250 ms`
   target or reintroducing TypeScript preview-driver fallback.
3. Preserve deterministic fail-closed behavior for unsupported future classes.
4. If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
   `149FITLEVNUMVM-022` as unblocked. If it remains red after the owned
   optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-score-routing.ts` or adjacent route helpers
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` or adjacent preview-drive helpers
- `packages/engine/src/agents/policy-wasm-runtime.ts` if route/runtime counters or cache lifetime need adjustment
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
- this ticket (Outcome before closeout)

## Acceptance Criteria

1. Active route remains fail-closed-clean:
   `wasmScoreRowUnsupportedCount=0` and
   `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
2. Focused tests prove any batching/cache/materialization change does not call
   the TypeScript preview driver for supported preview-state feature rows.
3. Same-seam perf gate records `<=250 ms`, or records exact red metrics after
   proving the active route remains clean and creates the next owner.
4. No FITL-specific ids, schemas, branches, or hardcoded card/action behavior.

## Test Plan

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. Focused production route tests.
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-active-route-perf`.
