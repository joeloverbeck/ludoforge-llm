# 150FITLWASM-016: Residual active-route kernel/hash cost closure

**Status**: COMPLETED with red measured gate successor `tickets/150FITLWASM-017.md`
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic residual kernel/query/hash/application cost on the active WASM preview route
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-015.md`

## Problem

Ticket `150FITLWASM-015` kept the production WASM score-row and
preview-state routes fail-closed-clean and reduced route-local bytecode
compile/encode work, but the same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-015-literal-fast-path`.
- Verdict: RED, `elapsedMs=3958.91` versus `<=250 ms`.
- Active route counters: `wasmScoreRowRouteCount=62`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=35`,
  `wasmPreviewCandidateFeatureRowRouteCount=70`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- Remaining buckets: `simAgentChooseMove=1267.48 ms`,
  `agent:evaluatePolicyExpression=1265.48 ms`, and
  `simApplyMove=845.96 ms`.

The remaining non-overlapping owner is no longer route activation,
unsupported-class cleanup, or scalar literal score-row overhead. CPU-profile
triage from `150FITLWASM-015` showed the remaining same-seam cost concentrated
in generic kernel/hash/query/application work still exercised by the active
route: `fnv1a64`, `resolveRef`, `copyCachedTokenStateIndex`, `evalCondition`,
`evalValue`, `evalQuery`, `encodePolicyBytecodeInput`, and spatial/query
helpers.

## What to Change

1. Profile the residual active-route cost with counters that distinguish
   generic query/effect interpretation, preview-state/token-index copying,
   hashing/canonicalization, score-row encoding, and production preview-drive
   batch overhead.
2. Reduce the largest same-seam residual without weakening the `<=250 ms`
   target and without reintroducing TypeScript preview-driver fallback for
   supported rows.
3. Keep the implementation generic: no FITL-specific ids, schemas, action
   branches, card names, or score shortcuts.
4. If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
   `149FITLEVNUMVM-022` as unblocked. If it remains red after the owned
   optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding helpers
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` or adjacent preview-drive helpers
- generic kernel/query/hash/token-index helpers only if profiling proves they are the residual owner
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
- this ticket (Outcome before closeout)

## Acceptance Criteria

1. Active route remains fail-closed-clean:
   `wasmScoreRowUnsupportedCount=0` and
   `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
2. Focused tests prove any cache, encoding, query, hash, or preview-state
   lifetime change preserves deterministic semantics and does not call the
   TypeScript preview driver for supported preview-state feature rows.
3. Same-seam perf gate records `<=250 ms`, or records exact red metrics after
   proving the active route remains clean and creates the next owner.
4. No FITL-specific ids, schemas, branches, or hardcoded card/action behavior.

## Test Plan

1. `pnpm -F @ludoforge/engine-wasm build` if Rust/WASM artifacts are touched.
2. `pnpm -F @ludoforge/engine build`.
3. Focused production route tests.
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-residual-active-route-perf-final`.

## Outcome

Completed on 2026-05-03 with one accepted generic hash-side optimization and
the same-seam gate still red.

Pre-change same-seam baseline after fresh engine-wasm and engine builds:

- `pnpm -F @ludoforge/engine-wasm build` — PASS.
- `pnpm -F @ludoforge/engine build` — PASS.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-016-prechange-baseline` — RED for the `<=250 ms` gate.
- Overall `elapsedMs=4243.41`; per-card `elapsedMs=4243.25`,
  `decisions=158`, `msPerDecision=26.856`.
- Active route counters: `wasmScoreRowRouteCount=62`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=35`,
  `wasmPreviewCandidateFeatureRowRouteCount=70`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- Profile buckets: `simAgentChooseMove=1339.65 ms`,
  `agent:evaluatePolicyExpression=1337.51 ms`, and
  `simApplyMove=915.6 ms`.

Accepted optimization:

- Extended the existing per-runtime Zobrist table key cache to bounded
  variable/action/decision-stack/unavailable-action feature classes that repeat
  heavily during full-hash verification.
- Left monotonic `turnCount`, `nextFrameId`, `nextTurnId`, and active lasting
  effect features uncached to avoid turning long-run counters into unbounded
  cache growth.
- Added `zobristKeyCacheHitCount`, `zobristKeyCacheMissCount`, and
  `zobristKeyUncachedCount` to `profile-fitl-preview-drive.mjs` so residual
  hash work is visible beside token-index, score-row encoding, and production
  preview-drive batch counters.
- Counter export classification: script-only diagnostic. The counters are
  exported through the existing kernel barrel because the profiling script
  consumes compiled engine output from that surface; they are not a semantic
  runtime contract and are reset/read only by the focused profile harness and
  unit witness.
- Focused hash proof:
  `timeout 60 pnpm -F @ludoforge/engine exec node --test dist/test/unit/zobrist-table.test.js` — PASS.
- Focused production route proof:
  `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js` — PASS.

Measured effect:

- Diagnostic run
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-016-hash-feature-cache` — RED at `elapsedMs=4091.81`.
- Improvement versus the pre-change same-seam baseline: `151.6 ms`
  wall-clock reduction. The largest moved bucket was `simApplyMove`
  (`915.6 ms -> 764.02 ms` in the diagnostic sample).

Final same-seam metrics:

- `pnpm -F @ludoforge/engine build` — PASS.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-residual-active-route-perf-final` — RED for the `<=250 ms` gate.
- Overall `elapsedMs=4018.94`; per-card `elapsedMs=4018.76`,
  `decisions=158`, `msPerDecision=25.4352`.
- Active route counters: `wasmScoreRowRouteCount=62`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=35`,
  `wasmPreviewCandidateFeatureRowRouteCount=70`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- New hash counters: `zobristKeyCacheHitCount=194070`,
  `zobristKeyCacheMissCount=8400`, and `zobristKeyUncachedCount=1199`.
- Profile buckets: `simAgentChooseMove=1323.75 ms`,
  `agent:evaluatePolicyExpression=1321.35 ms`, and
  `simApplyMove=753.3 ms`.
- The gate remains `3768.94 ms` over the `<=250 ms` target.

CPU-profile ownership triage after the accepted hash-cache change:

- Command:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-profile-150016-after packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-016-cpu-after-hash-cache`.
- Top remaining self-time frames were still generic:
  `fnv1a64`, `resolveRef`, `copyCachedTokenStateIndex`, `evalCondition`,
  `evalValue`, `evalQuery`, `encodePolicyBytecodeInput`, and spatial/query
  helpers. Parent-stack triage for `fnv1a64` showed the residual hash samples
  split across `createZobristTable`, `digestDecisionStackFrame`,
  `stableFingerprintHex`, and `zobristKey`.

Verdict: active WASM score-row and preview-state routes remain
fail-closed-clean, and the accepted hash-cache slice reduced same-seam wall
time, but the original `<=250 ms` gate is still red by an order of magnitude.
Created successor `tickets/150FITLWASM-017.md` for the next non-overlapping
owner: moving the remaining TypeScript query/eval/preview-drive expression work
and residual table/digest hashing out of the active route. Tickets
`149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` remain blocked.
