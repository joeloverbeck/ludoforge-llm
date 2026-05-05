# 150FITLWASM-015: Active WASM preview-route perf closure

**Status**: COMPLETED with red measured gate successor `tickets/150FITLWASM-016.md`
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — production WASM preview-drive batching/runtime overhead and same-seam perf gate
**Deps**: `archive/specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-014.md`, `archive/tickets/150FITLWASM-010.md`

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

## Note by the ticket reviewer

The goal is to compile to WASM as much as we can, and if we identify that we truly can't reach the `<=250 ms` target, then we will consider that target unfeasible. We've currently already reduced the wall time from 6500-7000 to 4125ms , which is a decent reduction, but any reduction gains we win will amount to faster AI agent evolution, so we need to push as much as we can.

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

## Outcome

Completed on 2026-05-03 with one accepted generic active-route optimization,
one rejected batching candidate, and the same-seam gate still red.

Pre-change same-seam baseline after fresh engine-wasm and engine builds:

- `pnpm -F @ludoforge/engine-wasm build` — PASS.
- `pnpm -F @ludoforge/engine build` — PASS.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-015-prechange-baseline` — RED for the `<=250 ms` gate.
- Overall `elapsedMs=4037.76`; per-card `elapsedMs=4037.6`, `decisions=158`.
- Active route counters: `wasmScoreRowRouteCount=62`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=47`,
  `wasmPreviewCandidateFeatureRowRouteCount=70`, and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Profile buckets: `simAgentChooseMove=1339.38 ms`,
  `agent:evaluatePolicyExpression=1337.46 ms`, and
  `simApplyMove=869.37 ms`.

Accepted optimization:

- Added a generic literal-row fast path in `policy-wasm-runtime.ts` so scalar
  literal `when`, `weight`, `value`, and candidate-feature expressions do not
  compile, encode, and execute WASM bytecode batches.
- Added `wasmProductionPreviewDriveBatchCount` to
  `profile-fitl-preview-drive.mjs` via
  `policyWasmProductionPreviewDriveInternals`, so future active-route profiles
  expose production preview-drive batch overhead beside the existing score-row
  and preview-row route counters.
- File-size note: `policy-wasm-runtime.ts` is already above the repo's typical
  source-file size guidance. The accepted logic is a 13-line local helper plus
  three call-site guards inside the existing WASM batch-evaluation owner; a new
  helper module was deferred because it would add another semi-public route
  surface for a small expression-local fast path.
- Focused route proof:
  `timeout 60 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-evaluation-topk-gate.test.js` — PASS.

Rejected candidate:

- Candidate: group production preview-drive candidates by shared action/runtime
  bindings before calling WASM.
- Correctness proof: focused route test passed after adapting the witness.
- Measurement:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-015-grouped-preview-drive` — RED and worse at `elapsedMs=4152.42`.
- Verdict: removed before closeout. The candidate did not reduce the
  same-seam gate; the live route still reported
  `wasmProductionPreviewDriveBatchCount=232`.

Final same-seam metrics after retaining only the literal fast path and the
batch counter:

- `pnpm -F @ludoforge/engine build` — PASS.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-015-literal-fast-path` — RED for the `<=250 ms` gate.
- Overall `elapsedMs=3958.91`; per-card `elapsedMs=3958.66`, `decisions=158`,
  `msPerDecision=25.0548`.
- Active route counters: `wasmScoreRowRouteCount=62`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=35`,
  `wasmPreviewCandidateFeatureRowRouteCount=70`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- Profile buckets: `simAgentChooseMove=1267.48 ms`,
  `agent:evaluatePolicyExpression=1265.48 ms`, and
  `simApplyMove=845.96 ms`.
- Improvement versus the pre-change same-seam baseline: `78.85 ms` wall-clock
  reduction and `47 -> 35` score-row bytecode compiles. The gate remains
  `3708.91 ms` over the `<=250 ms` target.

CPU-profile ownership triage:

- Command:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-profile-150015 packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-015-cpu-profile`.
- Top self-time frames remained generic kernel/hash/query/application work:
  `fnv1a64`, `resolveRef`, `copyCachedTokenStateIndex`, `evalCondition`,
  `evalValue`, `evalQuery`, `encodePolicyBytecodeInput`, and spatial/query
  helpers.

Verdict: active WASM score-row and preview-state routes remain fail-closed-clean
and the accepted route-local literal optimization landed, but the original
`<=250 ms` gate is still red by an order of magnitude. Created successor
`tickets/150FITLWASM-016.md` for the next non-overlapping owner: residual
generic kernel/hash/query/application cost still exercised by the active route.
Tickets `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` remain blocked.
