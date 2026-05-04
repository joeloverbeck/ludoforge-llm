# 150FITLWASM-030: Query/eval, hash, token-index, and GC red-gate residual closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic query/eval/reference-resolution, token-index, hash/canonicalization, and allocation/GC residual work
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-029.md`

## Problem

Ticket `150FITLWASM-029` continued after post-review and preserved
fail-closed-clean production WASM score-row and preview-state routes. Its
diagnostic retained-slice probe reached `1891.88 ms`; the decisive post-archive
final sample was `2046.48 ms` from a refreshed `2110.96 ms` same-checkout
baseline. The original `<=250 ms` gate remains red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-029-final-after-archive-repeat`.
- Final `150FITLWASM-029` result: RED, per-card `elapsedMs=2046.48` versus
  `<=250 ms`.
- Active route remained clean:
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`, and
  `wasmProductionPreviewDriveBatchCount=232`.

Profile evidence handoff from ticket `150FITLWASM-029`:

- CPU profile command:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm029-final-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-029-final-profile`.
- CPU-profile metric: per-card `elapsedMs=2111.61` with profiling enabled,
  active-route unsupported counters both `0`.
- Parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm029-final-profile/CPU.20260504.080618.3.0.001.cpuprofile --targets resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,encodeBatchInput,getEncodedBatchCandidateWords,buildTokenStateIndex,refreshCachedTokenStateIndexEntries,queryConnectedZones,canonicalizeHashValue,fnv1a64FromState,updateFnv1a64State,canonicalizeFingerprintValue,normalizeMoveBinding,createMemoKey,evalMapSpacesQuery,validateKnownZone,matchesTokenFilterExprInContext,filterTokensByExprInContext,applyZonesFilter,evalTokensInMapSpacesQuery,resolveBindingTemplate,getCachedContextEntries,setCachedContextEntries,bindingsVersionFor`.
- Final CPU evidence selected the remaining active-route residuals:
  `resolveRef=142`, `evalCondition=140`, `evalValue=101`,
  `evalQuery=66`, `refreshCachedTokenStateIndexEntries=56`,
  `queryConnectedZones=33`, `canonicalizeHashValue=68`,
  `updateFnv1a64State=49`, `canonicalizeFingerprintValue=25`,
  `buildTokenStateIndex=20`, `encodePolicyBytecodeInput=12`, and
  `encodeBatchInput=8`.
- Sample-surface classification: the CPU profile spans Node process lifetime,
  including setup/import/artifact-loading work outside the timed per-card
  metric. Treat query/eval/reference-resolution, token-index refresh/build,
  spatial `queryConnectedZones`, hash/canonicalization, and remaining encoding
  samples as actionable only when the selected implementation target is on the
  timed profile-drive route. Startup/parser/artifact-loading and process-GC
  samples must be classified separately before implementation.
- Non-overlap rationale: ticket `150FITLWASM-029` retained direct byte-buffer
  encoding and candidate-prefix caches, derived-context and per-context
  `resolveRef` cache shortcuts, static binding-name shortcuts, token-index scan
  allocation reduction, sorted zone caches/filter loops, and decision-sequence
  fingerprint reuse. This ticket owns the remaining query/eval lowering,
  reference-resolution residuals beyond those cache shortcuts, token-index
  build/refresh residuals, hash/canonicalization/digest residuals, and
  allocation/GC work without reverting the retained slice.

## Assumption Reassessment (2026-05-04)

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must preserve those diagnostics.
2. Ticket `150FITLWASM-029` reduced the same-seam route below the low `~2.1 s`
   range, but the decisive wall-clock gate remains about `7.6x` over the
   `<=250 ms` target.
3. Encoding is no longer the dominant residual, but small encoding samples still
   appear. Do not prioritize encoding unless a fresh profile shows it has grown
   again.
4. Ticket `149FITLEVNUMVM-016` remains blocked until this or a later successor
   makes the gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, schemas, branches,
   card names, action names, or hardcoded score behavior.
2. Preserve Foundation 8 determinism. Any cache, lowered evaluator,
   token-index shortcut, or hash shortcut must be keyed by every semantic input
   and must not depend on ambient process state.
3. Preserve Foundation 11 immutability. Mutable scratch buffers, indexes, query
   bindings, and caches must remain scoped and must not alias caller-visible
   state.
4. Preserve Foundation 14. Unsupported future row/classes fail closed; do not
   add compatibility fallbacks.

## What to Change

### 1. Profile the post-029 residual

Use the same-seam harness and CPU-profile parser to separate:

- remaining generic query/eval/reference-resolution allocation and interpreter
  work;
- token-index refresh/build work;
- spatial `queryConnectedZones` work;
- decision-stack digest, Zobrist hash, canonicalization, and stable-fingerprint
  work;
- process/GC samples that are inside the timed route versus setup/import noise.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- generic query/eval or reference-resolution lowering for repeated condition
  shapes on immutable state;
- reducing token-index refresh/build work without weakening copy-on-write
  lifetime guarantees;
- reducing decision-stack digest, Zobrist hash, or canonicalization work if a
  profile proves it remains material;
- allocation/GC reductions in the timed route when object lifetime and
  immutability can be proven.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after a significant owned
optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- generic kernel/query/eval/reference-resolution/spatial helpers if profiling proves they are the residual owner
- generic token-index helpers if profiling proves they are the residual owner
- generic stable-fingerprint, decision-stack digest, Zobrist, or hash helpers if profiling proves they are the residual owner
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding helpers only if encoding grows back into a material residual
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if additional counters are needed
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
- this ticket (Outcome before closeout)

If this ticket touches `packages/engine/src/agents/policy-wasm-runtime.ts` or
`packages/engine/src/kernel/resolve-ref.ts`, keep the existing oversize state
explicit and prefer adjacent helper extraction when the implementation is
separable.

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
   token-index, cache, stable-fingerprint, Zobrist, or hash change preserves
   deterministic semantics and does not call the TypeScript preview driver for
   supported preview-state feature rows.
3. Same-seam perf gate records `<=250 ms`, or records exact red metrics after
   proving the active route remains clean and creates the next owner.
4. Existing focused route test passes:
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
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-hash-token-index-gc-residual-perf`.
