# 150FITLWASM-016: Residual active-route kernel/hash cost closure

**Status**: PENDING
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
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-residual-active-route-perf`.
