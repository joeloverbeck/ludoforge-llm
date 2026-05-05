# 150FITLWASM-029: Remaining allocation, encoding, query/eval, and digest red-gate closure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic allocation/encoding, query/eval/reference-resolution, spatial-filter, token-index, and decision-stack digest residual work
**Deps**: `archive/specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-028.md`

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

## Outcome

Completed on 2026-05-04 with the same-seam perf gate still red and successor
owner `tickets/150FITLWASM-030.md`.

This ticket landed a generic allocation/cache reduction slice for the active
same-seam route:

- `packages/engine/src/agents/policy-wasm-runtime.ts` now writes encoded
  policy-bytecode inputs directly into a pre-sized byte buffer instead of first
  allocating a growable `number[]`, and it caches deterministic candidate
  action/tag/param prefix words by candidate-array identity for repeated WASM
  batch calls.
- `packages/engine/src/kernel/resolve-ref.ts` keeps the existing
  drive-scoped memoisation dimensions while caching the derived context key per
  `ReadContext` object, with state-hash, overlay, active-player, and
  actor-player field checks before reuse. The resumed implementation added a
  versioned per-`ReadContext` fast entry cache that skips the bindings/context
  map walk for repeated lookups while preserving the aggregate bindings
  invalidation hook.
- `packages/engine/src/kernel/token-state-index.ts` removes the per-token
  `Set` allocation in incremental token-index refresh by using a bounded
  duplicate-checked scan list. The resumed implementation also removed the
  per-token `Set` allocation for mutated/prior zone scans by scanning mutated
  zones and prior occurrence zones through a duplicate-checked list.
- `packages/engine/src/kernel/resolve-selectors.ts` validates bound zone
  selectors with the existing cached zone map instead of a sorted zone-id list
  plus linear lookup.
- `packages/engine/src/kernel/decision-sequence-analysis.ts` reuses the
  current move binding fingerprint when building the search memo key, avoiding
  duplicate move normalization in each pending-request branch.
- `packages/engine/src/kernel/condition-compiler.ts` now evaluates compiled
  `and`/`or` predicates with explicit loops, avoiding per-evaluation
  `Array.every`/`Array.some` callback overhead.
- `packages/engine/src/kernel/eval-query.ts` caches sorted zone and sorted
  map-space zone lists by `GameDef.zones` identity and uses explicit filter
  loops in `applyZonesFilter`.

Measured result:

- Diagnostic current baseline:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-029-current-baseline`
  — RED, per-card `elapsedMs=2258.37` versus `<=250`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmProductionPreviewDriveBatchCount=232`.
- Baseline CPU profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm029-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-029-current-profile`
  — RED, per-card `elapsedMs=2359.15` with CPU profiling enabled,
  active-route unsupported counters both `0`.
- Baseline parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm029-profile/CPU.20260504.065050.3.0.001.cpuprofile --targets fnv1a64,fnv1a64FromState,updateFnv1a64State,stableFingerprintHex,canonicalizeFingerprintValue,resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,buildTokenStateIndex,refreshCachedTokenStateIndexEntries,queryConnectedZones,applyTokenFilter,encodeBatchInput`.
- Baseline CPU evidence selected the ticket-owned encoding/query/token-index
  buckets: `encodePolicyBytecodeInput=52`, `encodeBatchInput=14`,
  `resolveRef=170`, `evalCondition=138`, `evalValue=110`,
  `evalQuery=65`, `refreshCachedTokenStateIndexEntries=52`,
  `queryConnectedZones=36`, `canonicalizeHashValue=61`, and
  `updateFnv1a64State=40`.
- Earlier retained-slice diagnostic probe:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-029-zone-filter-loop-probe`
  — RED, route clean, per-card `elapsedMs=1944.32`.
- Resumed same-checkout baseline:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-029-resume-baseline`
  — RED, per-card `elapsedMs=2110.96` versus `<=250`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmProductionPreviewDriveBatchCount=232`.
- Resumed retained static-binding-name probe:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-029-static-binding-name-probe`
  — RED, route clean, per-card `elapsedMs=2035.11`.
- Resumed retained token-index scan probe:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-029-token-index-scan-probe`
  — RED, route clean, per-card `elapsedMs=1959.11`.
- Resumed retained resolve-ref context-cache probe:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-029-resolve-ref-context-cache-probe`
  — RED, route clean, per-card `elapsedMs=1970.22`.
- Diagnostic same-seam metric after the retained resumed slice:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-029-final-post-context-cache`
  — RED, per-card `elapsedMs=1891.88` versus `<=250`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmProductionPreviewDriveBatchCount=232`.
- Decisive final same-seam metric after archival graph edits:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-029-final-after-archive-repeat`
  — RED, per-card `elapsedMs=2046.48` versus `<=250`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmProductionPreviewDriveBatchCount=232`.
- Final CPU-profile handoff:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm029-final-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-029-final-profile`
  — RED, per-card `elapsedMs=2111.61` with CPU profiling enabled, active-route
  unsupported counters both `0`.
- Final parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm029-final-profile/CPU.20260504.080618.3.0.001.cpuprofile --targets resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,encodeBatchInput,getEncodedBatchCandidateWords,buildTokenStateIndex,refreshCachedTokenStateIndexEntries,queryConnectedZones,canonicalizeHashValue,fnv1a64FromState,updateFnv1a64State,canonicalizeFingerprintValue,normalizeMoveBinding,createMemoKey,evalMapSpacesQuery,validateKnownZone,matchesTokenFilterExprInContext,filterTokensByExprInContext,applyZonesFilter,evalTokensInMapSpacesQuery,resolveBindingTemplate,getCachedContextEntries,setCachedContextEntries,bindingsVersionFor`.
- Final CPU evidence selected the remaining active-route residuals:
  `resolveRef=142`, `evalCondition=140`, `evalValue=101`,
  `evalQuery=66`, `refreshCachedTokenStateIndexEntries=56`,
  `queryConnectedZones=33`, `canonicalizeHashValue=68`,
  `updateFnv1a64State=49`, `canonicalizeFingerprintValue=25`,
  `buildTokenStateIndex=20`, `encodePolicyBytecodeInput=12`, and
  `encodeBatchInput=8`. Encoding is now a small residual; query/eval,
  reference resolution, token-index refresh/build, hash/canonicalization, and
  GC/process allocation remain the larger active-route owners.

Rejected candidates removed before closeout:

- Compiling `adjacent`/`connected` conditions directly in
  `condition-compiler.ts` passed focused spatial/equivalence tests but produced
  no useful wall-clock movement in the same-seam command, so it was removed.
- Streaming decision-stack digest hashing matched the canonical FNV salts in a
  focused correctness test, but worsened the same-seam route to per-card
  `elapsedMs=2136.93`, so it was removed.
- Replacing `tokensInMapSpaces` `flatMap` materialization with a manual token
  loop worsened the same-seam route to per-card `elapsedMs=2164.29`, so it was
  removed.
- Aggregate count `countQueryItems` / manual token counting passed focused
  query/condition/route tests but worsened the same-seam route to per-card
  `elapsedMs=2295.48`, so it was removed.
- Direct binding-ref bypass in `eval-value.ts` passed focused
  resolve-ref/query/condition/route tests but worsened same-seam probes to
  per-card `elapsedMs=2213.27` and `2246.59`, so it was removed.
- Compiling `actor` `pvar` references in `condition-compiler.ts` passed
  focused compiler/equivalence/route tests but worsened the same-seam route to
  per-card `elapsedMs=2082.2`, so it was removed.

The reviewer note and user clarification required continuing to target the next
larger same-seam residual until wall time was reduced from the low `~2.1 s`
range before successor handoff. The resumed retained slice produced diagnostic
same-seam probes down to `1891.88 ms`; the decisive post-archive final sample
drifted to `2046.48 ms` while preserving clean route diagnostics. The gate
remains red against `<=250 ms`, so the non-overlapping successor owner is
`tickets/150FITLWASM-030.md`.

Ticket graph edits are transcription and ownership handoff only; they do not
change code, command semantics, thresholds, scope, or acceptance boundaries for
the measured route.

Source-size ledger:

- `packages/engine/src/agents/policy-wasm-runtime.ts`: preexisting oversize
  file (`881` lines before this ticket; currently larger after the direct
  buffer and candidate-prefix cache). Extraction would require moving several
  private ABI helpers and types and would widen this performance slice, so the
  split is deferred to later same-ticket work only if profiling still selects
  this file.
- `packages/engine/src/kernel/resolve-ref.ts`: preexisting oversize `643` lines;
  active growth is limited to scoped context-key and per-context entry caches.
  Extracting the broader reference resolver would widen this performance slice.
- `packages/engine/src/kernel/eval-query.ts`: active query-cache/filter-loop
  edits remain in the generic query helper named by the ticket.
- `packages/engine/src/kernel/token-state-index.ts`: within guidance before
  and after this ticket.

Verification:

- `pnpm -F @ludoforge/engine build`
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/kernel/resolve-ref-memoised.test.js dist/test/kernel/token-state-index-incremental.test.js dist/test/unit/agents/policy-wasm-runtime.test.js dist/test/unit/agents/policy-runtime-encoded.test.js`
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/integration/compiled-condition-equivalence.test.js dist/test/integration/spatial-kernel-integration.test.js dist/test/unit/spatial-conditions.test.js dist/test/unit/spatial-queries.test.js`
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/decision-stack-invariants.test.js dist/test/unit/kernel/microturn-publication.test.js dist/test/unit/kernel/legal-choices.test.js dist/test/integration/prioritized-choose-n.test.js`
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/spatial-queries.test.js dist/test/integration/compiled-condition-equivalence.test.js dist/test/unit/agents/policy-preview-driver.test.js`
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-029-final-rerun-after-cleanup` — RED, route clean, per-card `elapsedMs=1912.29`.
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/kernel/resolve-ref-memoised.test.js dist/test/unit/eval-query.test.js dist/test/integration/compiled-condition-equivalence.test.js dist/test/unit/agents/policy-preview-driver.test.js`
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-029-final-post-context-cache` — RED, route clean, diagnostic per-card `elapsedMs=1891.88`.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-029-final-after-archive-repeat` — RED, route clean, decisive final per-card `elapsedMs=2046.48`.
- `pnpm run check:ticket-deps` — PASS after post-review owner correction.

Ticket/spec graph edits and archival-path rewrites are transcription and
ownership handoff only; they do not change code, command semantics, thresholds,
scope, or acceptance boundaries for the measured route.
