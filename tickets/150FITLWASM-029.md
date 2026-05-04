# 150FITLWASM-029: Remaining allocation, encoding, query/eval, and digest red-gate closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic allocation/encoding, query/eval/reference-resolution, spatial-filter, token-index, and decision-stack digest residual work
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-028.md`

## Problem

Ticket `150FITLWASM-028` preserved fail-closed-clean production WASM score-row
and preview-state routes while landing generic allocation reductions in
query/spatial condition evaluation plus a cached WASM layout-encoding helper.
The same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-token-index-digest-residual-perf`.
- Post-028 final result: RED, per-card `elapsedMs=2080.7` versus `<=250 ms`.
- Active route remained clean:
  `wasmScoreRowUnsupportedCount=0` and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.

Profile evidence handoff from ticket `150FITLWASM-028`:

- Baseline CPU profile command:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm028-baseline-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-028-baseline-profile`.
- Baseline metric: per-card `elapsedMs=2422.2` with CPU profiling enabled,
  active-route unsupported counters both `0`.
- Post-change CPU profile command:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm028-after-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-028-after-profile`.
- Parser method:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs <profile.cpuprofile> --targets fnv1a64,fnv1a64FromState,updateFnv1a64State,stableFingerprintHex,canonicalizeFingerprintValue,resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,buildTokenStateIndex,refreshCachedTokenStateIndexEntries,queryConnectedZones,applyTokenFilter`.
- Post-change profile still shows residual owners in `resolveRef`,
  `evalCondition`, `evalValue`, `evalQuery`, `encodePolicyBytecodeInput`,
  `refreshCachedTokenStateIndexEntries`, `queryConnectedZones`,
  `canonicalizeHashValue`, and decision-stack digest hashing.
- CPU-profile sample-surface classification: the profile spans Node process
  lifetime, including setup/import/artifact-loading work outside the timed
  same-seam per-card metric. Treat residual query/eval, spatial,
  `encodePolicyBytecodeInput`, token-index refresh/build, and digest/hash
  samples as the actionable `inside timed acceptance surface` owners only when
  the implementation target is on the profile-drive route; classify startup,
  parser, and artifact-loading samples separately before using them to choose
  successor scope.
- Non-overlap rationale: ticket `150FITLWASM-028` kept only mutable private
  bindings for repeated query/spatial condition probes, resolve-ref cache key
  allocation reduction, and cached WASM layout/zone-kind encoding extraction.
  This ticket owns deeper remaining allocation, generic query/eval lowering,
  batch/input encoding, token-index refresh/build, decision-stack digest, and
  residual hash/canonicalization work without reverting that slice.

## Assumption Reassessment (2026-05-04)

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must preserve those diagnostics.
2. Ticket `150FITLWASM-028` reduced the same-seam command from the previous
   `~2.5 s` range to the low `~2.1 s` range, but the decisive wall-clock gate
   remains about `8x` over the `<=250 ms` target.
3. The `<=250 ms` target is unchanged. Ticket `149FITLEVNUMVM-016` remains
   blocked until this or a later successor makes the gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, schemas, branches,
   card names, action names, or hardcoded score behavior.
2. Preserve Foundation 8 determinism. Any cache, lowered evaluator, buffer
   reuse, token-index change, or hash shortcut must be keyed by every semantic
   input and must not depend on ambient process state.
3. Preserve Foundation 11 immutability. Mutable scratch buffers, query
   bindings, indexes, and caches must remain scoped and must not alias
   caller-visible state.
4. Preserve Foundation 14. Unsupported future row/classes fail closed; do not
   add compatibility fallbacks.

## What to Change

### 1. Profile the post-028 residual

Use the same-seam harness and CPU-profile parser to separate:

- remaining allocation/GC pressure in generic query/eval/spatial filters;
- residual score-row input and batch encoding;
- token-index refresh/build work;
- decision-stack digest hashing and remaining canonicalization/fingerprint work.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- eliminating repeated allocation in score-row batch input construction without
  changing ABI identity;
- generic query/eval or reference-resolution lowering for repeated condition
  shapes on immutable state;
- reducing token-index refresh/build work without weakening copy-on-write
  lifetime guarantees;
- reducing decision-stack digest or remaining hash/fingerprint work if
  profiling proves it remains material.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after a significant owned
optimization, record exact metrics and create the next non-overlapping owner.

## Note by the reviewer

To avoid creating a follow-up ticket just after reducing the largest same-seam residual even though it doesn't reduce the wall-time significantly from `~2.1 s`, you should continue reducing largest same-seam residuals until the wall-time is reduced meaningfully from `~2.1 s`. Only then create a follow-up ticket if necessary.

## Files to Touch

- generic kernel/query/eval/reference-resolution/spatial helpers if profiling proves they are the residual owner
- generic token-index helpers if profiling proves they are the residual owner
- generic stable-fingerprint, decision-stack digest, or hash helpers if profiling proves they are the residual owner
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding helpers if encoding remains the residual owner
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if additional counters are needed
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
- this ticket (Outcome before closeout)

If this ticket touches `packages/engine/src/agents/policy-wasm-runtime.ts`, keep
the existing oversize state explicit and prefer adjacent helper extraction when
the implementation is separable.

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
2. Focused tests prove any query/eval, reference-resolution, spatial filter,
   encoding, token-index, cache, stable-fingerprint, or hash change preserves
   deterministic semantics and does not call the TypeScript preview driver for
   supported preview-state feature rows.
3. Same-seam perf gate records `<=250 ms`, or records exact red metrics after
   proving the active route remains clean and creates the next owner.
4. Existing focused route tests pass:
   `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`.

### Invariants

1. No FITL-specific ids, schemas, branches, card names, action names, or
   hardcoded score behavior.
2. Unsupported future row/classes fail closed with existing diagnostic counters.
3. Any retained cache or mutable scratch buffer has deterministic keying and
   scoped lifetime evidence.

## Test Plan

### New/Modified Tests

1. Focused generic unit or route tests near the changed seam, selected after
   profiling identifies the owned residual.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. Focused tests for the changed generic seam.
3. `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`.
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-allocation-encoding-query-digest-residual-perf`.
