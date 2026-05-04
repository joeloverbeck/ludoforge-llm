# 150FITLWASM-020: Active-route query/eval/encoding residual closure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic residual query/eval, bytecode-input encoding, token-index refresh, and remaining active WASM preview-route work
**Deps**: `archive/specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-019.md`

## Problem

Ticket `150FITLWASM-019` moved the active-route Zobrist/stable-fingerprint
hashing residual to a shared exact 32-bit-limb FNV implementation while keeping
production WASM score-row and preview-state routes fail-closed-clean. The
same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-residual-hash-eval-encoding-perf`.
- Final post-019 result: RED, per-card `elapsedMs=2460.65` versus
  `<=250 ms`.
- Active route remained clean:
  `wasmScoreRowUnsupportedCount=0` and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Remaining profile owners include `resolveRef`, `evalCondition`, `evalValue`,
  `evalQuery`, `encodePolicyBytecodeInput`, token-index refresh, spatial/query
  helpers, and residual Zobrist misses.

## Assumption Reassessment

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must preserve that diagnostic surface.
2. Ticket `150FITLWASM-019` reduced the generic FNV hash implementation cost
   without changing canonical hash values, but the gate remains dominated by
   query/eval/encoding and residual state-materialization work.
3. The `<=250 ms` target is unchanged. Ticket `149FITLEVNUMVM-016` remains
   blocked until this or a later successor makes the gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, card names, action
   names, schemas, or score shortcuts.
2. Preserve Foundation 8 determinism. Any query/eval cache, encoding shortcut,
   or hash optimization must be keyed by every semantic input and must not
   depend on ambient process state.
3. Preserve Foundation 11 immutability. Mutable preview/eval state must remain
   private and must not alias caller-visible state.
4. Preserve Foundation 14. Unsupported future classes fail closed; do not add
   compatibility fallbacks.

## What to Change

### 1. Profile the post-019 residual

Use the same-seam harness and CPU-profile parser to separate:

- remaining query/eval/reference resolution;
- score-row bytecode input encoding;
- spatial/query helper work;
- token-index refresh/build work;
- residual Zobrist/fingerprint hashing.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- pre-lowering or bytecoding generic query/eval fragments still interpreted by
  the active production preview-drive route;
- reducing repeated score-row bytecode input encoding when identical
  program/layout/state prefixes repeat across batches;
- caching bounded deterministic query/materialization results where immutable
  structural identity makes that safe;
- reducing token-index refresh work without weakening copy-on-write lifetime
  guarantees.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after the owned
optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- generic kernel/query/eval helpers if profiling proves they are the residual owner
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` or
  adjacent generic preview-drive helpers
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding
  helpers
- `packages/engine/src/kernel/zobrist-token-hash.ts` for generic unchanged
  token-placement hash elision
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if additional
  counters are needed
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the
  gate unblocks or moves
- `tickets/150FITLWASM-021.md` if the gate remains red and needs the next
  non-overlapping owner
- this ticket (Outcome before closeout)

## Out of Scope

- Weakening the `<=250 ms` target.
- Default-flipping the policy runtime or deleting the closure-tree path; that
  remains owned by `149FITLEVNUMVM-016` after the gate is green.
- FITL-specific branches, schemas, ids, cards, actions, or hand-authored score
  shortcuts.
- Reintroducing TypeScript preview-driver fallback for supported preview-state
  feature rows.
- Changing canonical hash values solely for speed without a broader
  reproducibility migration plan.

## Acceptance Criteria

### Tests That Must Pass

1. Active route remains fail-closed-clean:
   `wasmScoreRowUnsupportedCount=0` and
   `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
2. Focused tests prove any query/eval lowering, encoding, token-index, cache, or
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
5. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-residual-perf`.

## Outcome

2026-05-04 implementation landed two generic residual reductions while
preserving the active WASM route:

- `packages/engine/src/kernel/zobrist-token-hash.ts` now skips unchanged
  same-slot token placements when refreshing a zone's incremental Zobrist hash.
  The Zobrist token-placement feature is `(tokenId, zoneId, slot)`, so XORing
  an identical old/new placement out and back in is redundant.
- `packages/engine/src/agents/policy-wasm-runtime.ts` now caches encoded policy
  bytecode input buffers by immutable `EncodedState` object, `PolicyBytecode`
  object, and semantic context key. It also caches layout identity by
  `EncodedStateLayout` and `GameDef` object. The cache is WeakMap-scoped and
  does not change ABI bytes, hash values, score rows, or unsupported handling.

Rejected candidate:

- Bounded process-local `fnv1a64` result memoization was tried and removed.
  Correctness compiled, but the same-seam probe moved the wrong direction:
  `elapsedMs=2518.38` versus the live baseline `2465.37`, with unchanged route
  counters.

Diagnostic measurements before final ticket graph closeout:

- Baseline after fresh build:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-020-baseline`
  — RED, `elapsedMs=2465.37`, per-card `elapsedMs=2465.21`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- CPU profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm020-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-020-cpu-baseline`
  — RED, `elapsedMs=2422.6`, with remaining self-time owners in
  `fnv1a64`/`zobristKey`, `resolveRef`, `evalCondition`, `evalValue`,
  `evalQuery`, `encodePolicyBytecodeInput`, token-index refresh, and spatial
  helpers. Parent-stack parsing showed most `fnv1a64` samples under
  `zobristKey -> updateZoneTokenHash -> applyCreateToken`, plus smaller
  decision-frame digest and stable-fingerprint residuals.
- Token-placement diff probe:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-020-token-hash-diff-probe`
  — RED, `elapsedMs=2536.93`, active route clean.
- Encoded-program cache probe:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-020-encoded-program-cache-probe`
  — RED, `elapsedMs=2489.98`, active route clean.

Created successor `tickets/150FITLWASM-021.md` for the next non-overlapping
owner: deeper active-route query/apply/hash residual closure. Tickets
`149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` remain blocked until that or a
later successor makes the `<=250 ms` gate truthful. No perf gate test was added
because the measured result cannot truthfully assert the budget.

Post-review closeout ledger:

- Retained candidate classification: `root-cause counter improved` for
  unchanged token-placement hash elision because unchanged placements no longer
  call `zobristKey`; `owned metric improved` for the WeakMap-scoped encoded
  bytecode input cache only relative to the immediately preceding accepted
  token-hash probe (`2489.98 ms` versus `2536.93 ms`). Neither retained change
  is recorded as a green-gate or baseline wall-clock improvement; the ticket
  closes under the explicit red measured-gate successor contract.
- Oversize file: `packages/engine/src/agents/policy-wasm-runtime.ts`.
  Preexisting versus active growth: `868` lines before this ticket, `923` lines
  after this ticket (`+60/-5`). Extraction considered: a score/encoding helper
  split is plausible, but doing it in this red measured-gate slice would widen
  the ticket beyond the proven residual changes. Deferral rationale: the next
  successor may still need to touch the same encoding/runtime seam depending on
  profiling, so a premature extraction would risk churn. Successor if any:
  `tickets/150FITLWASM-021.md` should preserve or improve this boundary if it
  touches `policy-wasm-runtime.ts`.

Final proof:

- `pnpm run check:ticket-deps` after creating successor and rewiring active
  blockers/spec handoff — PASS.
- `pnpm -F @ludoforge/engine build` — PASS.
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js dist/test/unit/zobrist-hash-updates.test.js dist/test/unit/zobrist-table.test.js`
  — PASS.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-residual-perf`
  — RED for the `<=250 ms` gate: overall `elapsedMs=2625.1`, per-card
  `elapsedMs=2624.92`, `decisions=158`.
- Decisive rerun to settle same-command variance:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-residual-perf-final`
  — RED for the `<=250 ms` gate: overall `elapsedMs=2593.28`, per-card
  `elapsedMs=2593.11`, `decisions=158`, `msPerDecision=16.4121`.

Final active route counters remained clean:
`wasmScoreRowRouteCount=62`, `wasmScoreRowUnsupportedCount=0`,
`wasmScoreRowBytecodeCompileCount=35`,
`wasmPreviewCandidateFeatureRowRouteCount=70`,
`wasmPreviewCandidateFeatureRowUnsupportedCount=0`, and
`wasmProductionPreviewDriveBatchCount=232`. Hash/index counters:
`tokenStateIndexBuildCount=1320`, `zobristKeyCacheHitCount=193840`,
`zobristKeyCacheMissCount=8208`, and `zobristKeyUncachedCount=1391`.
Profile buckets: `simAgentChooseMove=515.69 ms`,
`agent:evaluatePolicyExpression=513.43 ms`, `simApplyMove=379.48 ms`.

No-invalidation note: the post-proof edit transcribed exact final metrics,
route counters, and successor ownership only. It did not change code, command
semantics, thresholds, or acceptance boundaries, so the final focused tests and
same-seam profile remain the final proof for this ticket.
