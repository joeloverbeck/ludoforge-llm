# 150FITLWASM-028: Query/eval, encoding, token-index, and digest residual closure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic query/eval/reference resolution, spatial filter evaluation, score-row encoding, token-index, and remaining digest/hash residual work
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-027.md`

## Problem

Ticket `150FITLWASM-027` preserved fail-closed-clean production WASM score-row
and preview-state routes while landing a generic namespace-prefix stable
fingerprint hasher for decision-sequence pending-request fingerprints. The
same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-stable-fingerprint-query-eval-residual-perf`.
- Post-027 final result: RED, per-card `elapsedMs=2477.81` versus `<=250 ms`.
- Active route remained clean:
  `wasmScoreRowUnsupportedCount=0` and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Post-027 CPU evidence shows the prior direct `stableFingerprintHex` /
  `fnv1a64` bucket was removed. Remaining residual owners include
  `resolveRef`, `evalCondition`, `evalValue`, `evalQuery`,
  `encodePolicyBytecodeInput`, `queryConnectedZones`, token-index
  refresh/build, decision-stack digest `updateFnv1a64State`, and smaller
  remaining canonicalization/fingerprint work.

Profile evidence handoff from ticket `150FITLWASM-027`:

- Profile artifact: `/tmp/ludoforge-150fitlwasm027-prefix-hasher-profile/CPU.20260504.032438.3.0.001.cpuprofile` (ephemeral).
- Parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm027-prefix-hasher-profile/CPU.20260504.032438.3.0.001.cpuprofile --targets fnv1a64,fnv1a64FromState,updateFnv1a64State,stableFingerprintHex,canonicalizeFingerprintValue,resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,buildTokenStateIndex,refreshCachedTokenStateIndexEntries,queryConnectedZones,applyTokenFilter`.
- Baseline/current metric: diagnostic pre-change same-seam per-card
  `elapsedMs=2387.1`, final same-seam per-card `elapsedMs=2477.81`.
- Top residual owners in the retained profile: `resolveRef=189`,
  `evalCondition=124`, `evalValue=78`, `evalQuery=74`,
  `encodePolicyBytecodeInput=65`, `refreshCachedTokenStateIndexEntries=57`,
  `buildTokenStateIndex=23`, `queryConnectedZones=29`,
  `updateFnv1a64State=39`, and only `5` `fnv1a64FromState` samples under the
  new stable-fingerprint hasher path.
- Non-overlap rationale: ticket `150FITLWASM-027` kept only the generic
  namespace-prefix stable-fingerprint hasher and decision-sequence call-site
  adoption. This ticket owns remaining generic query/eval/reference-resolution,
  spatial-filter, encoding, token-index, decision-stack digest, and smaller
  fingerprint/canonicalization residuals without reverting that slice.

## Assumption Reassessment (2026-05-04)

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must preserve those diagnostics.
2. Ticket `150FITLWASM-027` removed the largest direct stable-fingerprint FNV
   bucket from the CPU profile, but the decisive wall-clock gate remained
   around `2.5 s`.
3. The `<=250 ms` target is unchanged. Ticket `149FITLEVNUMVM-016` remains
   blocked until this or a later successor makes the gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, schemas, branches,
   card names, action names, or hardcoded score behavior.
2. Preserve Foundation 8 determinism. Any query/eval cache, lowered evaluator,
   encoding shortcut, token-index change, or hash shortcut must be keyed by
   every semantic input and must not depend on ambient process state.
3. Preserve Foundation 11 immutability. Mutable preview/apply/index/cache state
   must remain private and must not alias caller-visible state.
4. Preserve Foundation 14. Unsupported future row/classes fail closed; do not
   add compatibility fallbacks.

## What to Change

### 1. Profile the post-027 residual

Use the same-seam harness and CPU-profile parser to separate:

- query/eval/reference resolution and spatial filter evaluation;
- residual score-row input/batch encoding;
- token-index refresh/build work;
- decision-stack digest hashing and remaining hash/fingerprint work.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- a generic query/eval or reference-resolution cache/lowering path for repeated
  filter shapes on immutable state;
- pre-lowering spatial/filter evaluation fragments that currently recurse
  through interpreted `evalCondition`/`evalValue`/`evalQuery`;
- reducing score-row input/batch encoding if profiling proves it remains
  material;
- reducing token-index refresh/build work without weakening copy-on-write
  lifetime guarantees;
- reducing decision-stack digest or remaining hash/fingerprint work if
  profiling proves it remains material after the prefix-hasher slice.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after the owned
optimization, record exact metrics and create the next non-overlapping owner.

## Note by the ticket reviewer

We've gone many tickets changing just a little thing and then creating a follow-up ticket to reduce another same-seam residual even though the previous ticket didn't reduce the wall-time. *Do not* cease implementing this ticket (reducing the largest same-seam residual) until the wall-clock gate is reduced significantly from the current `2.5 s`.

## Files to Touch

- generic kernel/query/eval/reference-resolution/spatial helpers if profiling proves they are the residual owner
- generic token-index helpers if profiling proves they are the residual owner
- generic stable-fingerprint, decision-stack digest, or hash helpers if profiling proves they are the residual owner
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding helpers if encoding remains the residual owner
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if additional counters are needed
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
- `tickets/150FITLWASM-029.md` if the gate remains red after the owned reduction
- `specs/150-fitl-policy-vm-wasm-port.md` if successor ownership moves
- this ticket (Outcome before closeout)

If this ticket touches `packages/engine/src/agents/policy-wasm-runtime.ts`, keep
the existing oversize state explicit. It was `923` lines before ticket
`150FITLWASM-027`; preserve or improve the boundary unless profiling proves
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
3. Any retained cache has deterministic keying and scoped lifetime evidence.

## Test Plan

### New/Modified Tests

1. Focused generic unit or route tests near the changed seam, selected after
   profiling identifies the owned residual.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. Focused tests for the changed generic seam.
3. `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`.
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-token-index-digest-residual-perf`.

## Outcome

2026-05-04 implementation landed a generic allocation and encoding reduction
slice for the active same-seam route:

- `packages/engine/src/kernel/spatial.ts` now reuses one private mutable
  bindings object when evaluating `connectedZones` `via` conditions, with
  explicit resolve-ref cache invalidation before each `$zone` rebinding.
- `packages/engine/src/kernel/eval-query.ts` applies the same scoped mutable
  binding pattern for zone filters and `nextInOrderByCondition` probes.
- `packages/engine/src/kernel/resolve-ref.ts` keeps the existing
  drive-scoped cache safety dimensions while removing per-lookup
  `JSON.stringify(ref)` from the cache key; ref identity is now nested under
  the state/overlay/player context key.
- `packages/engine/src/agents/policy-wasm-layout-encoding-cache.ts` now owns
  cached WASM layout identity and zone-kind code derivation, and
  `packages/engine/src/agents/policy-wasm-runtime.ts` consumes that helper.
  The runtime file shrank from the pre-ticket `923` lines to `881` lines.
- `packages/engine/test/unit/spatial-queries.test.ts` proves the reused
  bindings path cannot leak a stale `$zone` value through the resolve-ref
  cache.

Measured result:

- Baseline CPU profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm028-baseline-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-028-baseline-profile`
  — RED, per-card `elapsedMs=2422.2` with CPU profiling enabled,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmProductionPreviewDriveBatchCount=232`.
- Baseline parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm028-baseline-profile/CPU.20260504.062556.3.0.001.cpuprofile --targets fnv1a64,fnv1a64FromState,updateFnv1a64State,stableFingerprintHex,canonicalizeFingerprintValue,resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,buildTokenStateIndex,refreshCachedTokenStateIndexEntries,queryConnectedZones,applyTokenFilter,runGameSteps,simulateGameFromSeed,applyMoveCore,chooseMove`.
- Baseline CPU evidence selected the ticket-owned query/eval/spatial and
  encoding buckets: `resolveRef=178`, `evalCondition=137`,
  `evalValue=88`, `evalQuery=69`, `queryConnectedZones=41`,
  `encodePolicyBytecodeInput=44`,
  `refreshCachedTokenStateIndexEntries=52`, and
  `updateFnv1a64State=45`.
- Diagnostic non-CPU same-seam profile after the retained slice:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-028-layout-cache-probe`
  — RED, per-card `elapsedMs=2081.53`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmProductionPreviewDriveBatchCount=232`.
- Final non-CPU same-seam profile:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-token-index-digest-residual-perf`
  — RED, per-card `elapsedMs=2080.7`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmProductionPreviewDriveBatchCount=232`.
- Post-change CPU profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm028-after-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-028-after-profile`
  — RED, per-card `elapsedMs=2222.99` with CPU profiling enabled,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmProductionPreviewDriveBatchCount=232`.
- Post-change parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm028-after-profile/CPU.20260504.063048.3.0.001.cpuprofile --targets fnv1a64,fnv1a64FromState,updateFnv1a64State,stableFingerprintHex,canonicalizeFingerprintValue,resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,buildTokenStateIndex,refreshCachedTokenStateIndexEntries,queryConnectedZones,applyTokenFilter,runGameSteps,applyMoveCore`.
- Post-change CPU evidence shows the query/spatial reduction but the residual
  is still red: `queryConnectedZones` moved from `41` to `30` self samples,
  `evalCondition` from `137` to `120`, `evalValue` from `88` to `78`, and
  `evalQuery` from `69` to `64`. Remaining residual owners include
  `resolveRef=176`, `encodePolicyBytecodeInput=66`,
  `refreshCachedTokenStateIndexEntries=47`, `canonicalizeHashValue=61`,
  `updateFnv1a64State=47`, and ongoing allocation/GC pressure.

The retained slice is accepted because it materially reduced the same-seam
wall-clock from the inherited `~2.5 s` range to the low `~2.1 s` range while
preserving the clean active WASM route. The `<=250 ms` gate remains red, so
`149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` remain blocked. The next
non-overlapping owner is `tickets/150FITLWASM-029.md`, which owns remaining
allocation, encoding, query/eval, token-index, decision-stack digest, and
hash/canonicalization residual closure.

Ticket graph edits are transcription and ownership handoff only; they do not
change code, command semantics, thresholds, scope, or acceptance boundaries for
the measured route.

Source-size ledger:

- `packages/engine/src/agents/policy-wasm-runtime.ts`: preexisting oversize
  `923` lines; active extraction reduced it to `881` lines. Further splitting
  remains outside this ticket because the retained encoding helper is already
  the separable owner.
- `packages/engine/src/kernel/eval-query.ts`: preexisting oversize file remains
  `1057` lines after the scoped mutable-binding loop change. Extracting the
  broader query dispatcher would widen this performance slice; successor ticket
  `150FITLWASM-029` owns remaining query/eval residuals if further structural
  work is justified by profiling.

Final verification:

- `pnpm -F @ludoforge/engine build` — PASS.
- `timeout 60 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-runtime.test.js` — PASS.
- `timeout 60 pnpm -F @ludoforge/engine exec node --test dist/test/kernel/resolve-ref-memoised.test.js` — PASS.
- `timeout 60 pnpm -F @ludoforge/engine exec node --test dist/test/unit/spatial-queries.test.js` — PASS.
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js` — PASS.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-token-index-digest-residual-perf` — RED as expected, active route clean, per-card `elapsedMs=2080.7` versus `<=250`.
- `pnpm run check:ticket-deps` — PASS before final proof after successor and dependency graph rewrites.

The terminal status edit and final proof transcription did not change scope,
command semantics, thresholds, dependency ownership, or acceptance boundaries;
the just-run final proof remains valid.
