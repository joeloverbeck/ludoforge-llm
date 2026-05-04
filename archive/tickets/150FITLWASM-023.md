# 150FITLWASM-023: Residual query/eval and token-hash closure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic query/eval/reference resolution, token-placement hashing, and residual preview-drive runtime work
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-022.md`

## Problem

Ticket `150FITLWASM-022` preserved fail-closed-clean production WASM score-row
and preview-state routes while landing a bounded dynamic Zobrist feature-key
cache. The same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-full-hash-query-eval-residual-perf`.
- Post-022 result: RED, per-card `elapsedMs=2539.8` versus `<=250 ms`.
- Active route remained clean:
  `wasmScoreRowUnsupportedCount=0` and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- The retained root counter improved:
  `zobristKeyUncachedCount=1391 -> 334`.
- Post-022 CPU evidence still shows residual owners in `fnv1a64` under
  token-placement hash updates, `resolveRef`, `evalCondition`, `evalValue`,
  `evalQuery`, `encodePolicyBytecodeInput`, and token-index refresh.

## Assumption Reassessment (2026-05-04)

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must preserve those diagnostics.
2. Ticket `150FITLWASM-022` reduced repeated dynamic feature-key hashing but
   did not remove the remaining query/eval/reference-resolution or
   token-placement hash update residual.
3. The `<=250 ms` target is unchanged. Ticket `149FITLEVNUMVM-016` remains
   blocked until this or a later successor makes the gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, schemas, branches,
   card names, action names, or hardcoded score behavior.
2. Preserve Foundation 8 determinism. Any query/eval cache, lowered evaluator,
   hash shortcut, token-index change, or encoding shortcut must be keyed by
   every semantic input and must not depend on ambient process state.
3. Preserve Foundation 11 immutability. Mutable preview/apply/index/cache state
   must remain private and must not alias caller-visible state.
4. Preserve Foundation 14. Unsupported future row/classes fail closed; do not
   add compatibility fallbacks.

## What to Change

### 1. Profile the post-022 residual

Use the same-seam harness and CPU-profile parser to separate:

- token-placement hash updates under shuffle/draw/move-all;
- query/eval/reference resolution;
- token-index refresh/build work;
- residual score-row input/batch encoding.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- a generic query/eval or reference-resolution cache/lowering path for repeated
  filter shapes on immutable state;
- a deterministic token-placement hash update strategy that avoids repeated
  FNV work without changing canonical hash values;
- reducing token-index refresh/build work without weakening copy-on-write
  lifetime guarantees;
- further score-row input/batch encoding reduction only if profiling proves it
  remains material.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after the owned
optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- generic kernel/query/eval helpers if profiling proves they are the residual owner
- generic token/hash/index helpers if profiling proves they are the residual owner
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` or adjacent generic preview-drive helpers if preview application remains the residual owner
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding helpers if encoding remains the residual owner
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if additional counters are needed
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
- `tickets/150FITLWASM-024.md` if the gate remains red and needs the next
  non-overlapping owner
- this ticket (Outcome before closeout)

If this ticket touches `packages/engine/src/agents/policy-wasm-runtime.ts`, keep
the existing oversize state explicit. It was `923` lines after
`150FITLWASM-020`; preserve or improve the boundary unless profiling proves
that same file is still the cleanest residual owner.

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
2. Focused tests prove any query/eval lowering, reference-resolution cache,
   token-hash, token-index, cache, or encoding change preserves deterministic
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

1. `pnpm -F @ludoforge/engine build`.
2. Focused tests for the changed generic seam.
3. `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`.
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-token-hash-residual-perf`.

## Outcome

2026-05-04 implementation landed a generic apply-move token-placement hash
deferral while preserving the active WASM score-row and preview-state routes.

- `packages/engine/src/kernel/apply-move.ts` now marks tracker-backed
  apply-move effect scopes with `skipRunningHashUpdates` because the move
  boundary already reconciles the final state hash from the original input
  state to the final progressed state and `verifyIncrementalHash` still
  recomputes the canonical full hash afterward.
- `packages/engine/src/kernel/effects-token.ts` now honors that existing
  internal flag for `moveToken`, `destroyToken`, `draw`, `moveAll`, and
  `shuffle` token-placement hash updates. Direct effect execution outside a
  reconciled move boundary keeps the existing incremental hash behavior.
- `packages/engine/test/unit/kernel/zobrist-incremental-tokens.test.ts` proves
  token handlers can leave `_runningHash` unchanged when boundary
  reconciliation owns final hashing, while the canonical full hash still
  changes for the moved token placements.

Measured result:

- Baseline after fresh build:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm023-baseline-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-023-baseline-cpu`
  — RED, per-card `elapsedMs=2533.28`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `zobristKeyCacheMissCount=3717`,
  `zobristKeyCacheHitCount=189243`, `zobristKeyUncachedCount=334`.
- Post-change same-seam profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm023-token-skip-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-023-token-hash-skip-probe`
  — RED, per-card `elapsedMs=2402.77`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `zobristKeyCacheMissCount=2837`,
  `zobristKeyCacheHitCount=187747`, `zobristKeyUncachedCount=334`.
- Final same-seam profile after code, test, ticket, spec, and dependency edits:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-token-hash-residual-perf`
  — RED, per-card `elapsedMs=2557.17`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `zobristKeyCacheMissCount=2837`,
  `zobristKeyCacheHitCount=187747`, `zobristKeyUncachedCount=334`.
- Post-change CPU parser evidence shows token-placement update hashing was
  removed from the active apply-move stacks. Residual owners remain in
  initial-state/full-hash token-placement hashing, decision-stack frame
  digests, `resolveRef`, `evalCondition`, `evalValue`, `evalQuery`,
  `encodePolicyBytecodeInput`, and token-index refresh.

Retained candidate classification:

- `root-cause counter improved`: reconciled apply-move scopes no longer pay
  redundant token-placement key updates that are replaced by the final
  boundary hash reconciliation. The same-seam probe reduced
  `zobristKeyCacheMissCount` from `3717` to `2837`.
- `wall-clock variance/unproven`: a CPU-profile probe moved per-card wall time
  from `2533.28 ms` to `2402.77 ms`, but the decisive final same-seam profile
  drifted to `2557.17 ms`.
- `wall-clock gate still red`: the decisive same-seam profile remained around
  `2.56 s` versus the `<=250 ms` target, so no perf gate test was added and
  `149FITLEVNUMVM-016` remains blocked.

Created successor `tickets/150FITLWASM-024.md` for the next non-overlapping
owner: initial-state/full-hash, query/eval/reference-resolution, encoding, and
token-index residual closure. Tickets `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` remain blocked until that or a later successor makes the
`<=250 ms` gate truthful.

Oversize file ledger:

- `packages/engine/src/kernel/apply-move.ts`: preexisting oversize file,
  `2140` lines after this ticket. Active growth is one internal flag threaded
  into apply-move effect contexts. Extraction would be disproportionate because
  the touched logic is the local move-boundary context setup.
- `packages/engine/src/kernel/effects-token.ts`: preexisting oversize file,
  `1186` lines after this ticket. Active growth is a narrow guard around
  existing token hash update call sites. Extraction would widen this
  red-gate slice beyond the retained generic residual change.

Schema/artifact fallout: none. The change is internal hash-lifetime behavior
plus a focused unit test; no serialized schema, ABI, golden, or compiled
GameDef artifact changed.

Final proof:

- `pnpm -F @ludoforge/engine build` — PASS.
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/zobrist-incremental-tokens.test.js dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js` — PASS.
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js` — PASS.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-token-hash-residual-perf` — RED by threshold, active route clean, per-card `elapsedMs=2557.17` versus `<=250`.
- `pnpm run check:ticket-deps` — PASS after creating `tickets/150FITLWASM-024.md` and repointing dependent tickets.

No-invalidation note: the post-profile ticket/spec/dependency edits transcribe
the final measured red result and successor ownership only; they did not change
code, command semantics, thresholds, or acceptance boundaries.
