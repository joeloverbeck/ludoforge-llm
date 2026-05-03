# 150FITLWASM-017: Active-route query/eval and residual hash closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic query/eval, hash/table, and preview-drive expression work on the active WASM preview route
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-016.md`

## Problem

Ticket `150FITLWASM-016` kept the production WASM score-row and preview-state
routes fail-closed-clean and reduced same-seam hash verification cost with a
generic bounded-feature Zobrist key cache, but the same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-residual-active-route-perf-final`.
- Verdict: RED, `elapsedMs=4018.94` versus `<=250 ms`.
- Active route counters: `wasmScoreRowRouteCount=62`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=35`,
  `wasmPreviewCandidateFeatureRowRouteCount=70`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- Hash counters: `zobristKeyCacheHitCount=194070`,
  `zobristKeyCacheMissCount=8400`, and `zobristKeyUncachedCount=1199`.
- Remaining buckets: `simAgentChooseMove=1323.75 ms`,
  `agent:evaluatePolicyExpression=1321.35 ms`, and `simApplyMove=753.3 ms`.

CPU-profile triage after ticket `150FITLWASM-016` still showed generic
TypeScript work above the WASM backend: `resolveRef`, `evalCondition`,
`evalValue`, `evalQuery`, `encodePolicyBytecodeInput`, spatial/query helpers,
`copyCachedTokenStateIndex`, plus residual `fnv1a64` callers in
`createZobristTable`, `digestDecisionStackFrame`, `stableFingerprintHex`, and
`zobristKey`.

## Assumption Reassessment (2026-05-03)

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must not reintroduce TypeScript preview-driver
   fallback for supported rows.
2. Ticket `150FITLWASM-016` proved bounded Zobrist feature-key caching helps but
   is not sufficient; the remaining gate is still about `16.5x` over budget.
3. The next non-overlapping owner is not route activation or literal score-row
   encoding. It is the remaining TypeScript query/eval/preview-drive expression
   work plus residual hash/table/digest work still exercised by the active
   route.

## Architecture Check

1. Keep the implementation generic: optimize CNL query/eval, generic
   preview-drive lowering, hash/table construction, or WASM batch input
   encoding without FITL-specific ids, cards, actions, or score shortcuts.
2. Preserve Foundation 8 determinism. Any cache must be keyed by every semantic
   input it observes and must not depend on ambient process state.
3. Preserve Foundation 11 immutability. Any mutable cache or draft state must be
   scoped to a runtime/table/drive where aliases cannot leak into caller-visible
   state.
4. Preserve Foundation 14. Do not add compatibility shims or retained fallback
   aliases; unsupported future classes must fail closed.

## What to Change

### 1. Profile the residual TypeScript query/eval route

Use the same-seam harness and CPU-profile parser to separate:

- query/eval/reference resolution;
- preview-drive expression lowering and publication/application work;
- WASM score-row input encoding;
- residual Zobrist table, digest, and uncached key work;
- token-index copying or rebuilding.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- pre-lowering preview-drive expression/query fragments into a reusable generic
  representation;
- moving currently interpreted scalar query/eval fragments into the existing
  encoded preview-drive/WASM batch where the supported subset is clear;
- caching or hoisting deterministic table/fingerprint/digest work at the
  runtime boundary;
- reducing score-row bytecode input encoding when the same bytecode/layout/state
  prefix repeats across candidates.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after the owned
optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` or adjacent generic preview-drive helpers
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding helpers
- generic kernel/query/hash/token-index helpers only if profiling proves they are the residual owner
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if additional counters are needed
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
- this ticket (Outcome before closeout)

## Out of Scope

- Weakening the `<=250 ms` target.
- Default-flipping the policy runtime or deleting the closure-tree path; that
  remains owned by `149FITLEVNUMVM-016` after the gate is green.
- FITL-specific branches, schemas, ids, cards, actions, or hand-authored score
  shortcuts.
- Reintroducing TypeScript preview-driver fallback for supported preview-state
  feature rows.

## Acceptance Criteria

### Tests That Must Pass

1. Active route remains fail-closed-clean:
   `wasmScoreRowUnsupportedCount=0` and
   `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
2. Focused tests prove any cache, query/eval lowering, hash, encoding, or
   preview-state lifetime change preserves deterministic semantics and does not
   call the TypeScript preview driver for supported preview-state feature rows.
3. Same-seam perf gate records `<=250 ms`, or records exact red metrics after
   proving the active route remains clean and creates the next owner.
4. Existing focused route tests pass:
   `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`.

### Invariants

1. No FITL-specific ids, schemas, branches, card names, action names, or
   hardcoded score behavior.
2. Unsupported future row/classes fail closed with existing diagnostic counters.
3. Any retained cache has deterministic keying and scoped lifetime evidence.

## Test Plan

### New/Modified Tests

1. Focused generic unit or route tests near the changed seam, selected after
   profiling identifies the owned residual.

### Commands

1. `pnpm -F @ludoforge/engine-wasm build` if Rust/WASM artifacts are touched.
2. `pnpm -F @ludoforge/engine build`.
3. Focused tests for the changed generic seam.
4. `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`.
5. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-residual-perf`.
