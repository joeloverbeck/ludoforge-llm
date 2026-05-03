# 150FITLWASM-018: Active-route preview-apply hash/digest and token-index closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic preview-apply hashing, decision-stack digest, token-index lifetime, and residual eval/encoding work on the active WASM preview route
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-017.md`

## Problem

Ticket `150FITLWASM-017` kept the production WASM score-row and preview-state
routes fail-closed-clean and removed repeated `GameDefRuntime`/Zobrist
structural rebuilds from active-route preview query materialization. The
same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-residual-perf`.
- Verdict: RED, `elapsedMs=2898.06` versus `<=250 ms`.
- Active route counters: `wasmScoreRowRouteCount=62`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=35`,
  `wasmPreviewCandidateFeatureRowRouteCount=70`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- Hash counters: `zobristKeyCacheHitCount=194070`,
  `zobristKeyCacheMissCount=8400`, and `zobristKeyUncachedCount=1199`.
- Remaining buckets: `simApplyMove=681.93 ms`,
  `simAgentChooseMove=456.98 ms`, and
  `agent:evaluatePolicyExpression=455.25 ms`.

CPU-profile triage after ticket `150FITLWASM-017` showed the removed
structural-runtime rebuild owner is gone (`createZobristTable` dropped to a
single self-time sample). The remaining generic owners are now
`digestDecisionStackFrame`/`fnv1a64`, `copyCachedTokenStateIndex`,
`resolveRef`, `evalCondition`, `evalValue`, `evalQuery`,
`encodePolicyBytecodeInput`, and spatial/query helpers.

## Assumption Reassessment (2026-05-03)

1. The active production WASM score-row and preview-state routes remain
   fail-closed-clean after ticket `150FITLWASM-017`; this ticket must preserve
   `wasmScoreRowUnsupportedCount=0` and
   `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
2. The removed structural-runtime rebuild owner is no longer the right target:
   the post-017 CPU profile showed `createZobristTable` at one self-time sample,
   while digest/hash, token-index copy, residual query/eval, encoding, and
   spatial/query helpers remain material.
3. The same-seam perf gate is still red at `2898.06 ms` versus `<=250 ms`, so
   ticket `149FITLEVNUMVM-016` and ticket `149FITLEVNUMVM-022` must remain
   blocked until this or a later non-overlapping successor makes the gate
   truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, card names, action
   names, schemas, or score shortcuts.
2. Preserve Foundation 8 determinism. Any digest, hash, or encoding cache must
   be keyed by every semantic input and must not depend on ambient process
   state.
3. Preserve Foundation 11 immutability. Token-index or preview-state lifetime
   changes must not share mutable descendants with caller-visible state.
4. Preserve Foundation 14. Unsupported future classes fail closed; do not add
   compatibility fallbacks.

## What to Change

### 1. Profile the post-017 residual

Use the same-seam harness and CPU-profile parser to separate:

- decision-stack digest and residual Zobrist/fingerprint hashing;
- token-index copying or rebuilding during preview application;
- remaining query/eval/reference resolution;
- score-row bytecode input encoding;
- spatial/query helpers.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- caching or hoisting decision-stack frame digests where immutable frame
  identity makes that deterministic and bounded;
- reducing token-index copy work during private preview application;
- reusing or pre-lowering deterministic query/eval fragments still interpreted
  by the production preview-drive route;
- reducing repeated score-row bytecode input encoding when identical program
  prefixes repeat across batches.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after the owned
optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- generic kernel/hash/token-index helpers if profiling proves they are the residual owner
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` or adjacent generic preview-drive helpers
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding helpers
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
2. Focused tests prove any cache, hash, token-index lifetime, query/eval
   lowering, encoding, or preview-state lifetime change preserves deterministic
   semantics and does not call the TypeScript preview driver for supported
   preview-state feature rows.
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
5. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-apply-hash-token-index-perf`.
