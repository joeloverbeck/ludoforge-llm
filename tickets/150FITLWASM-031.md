# 150FITLWASM-031: Remaining reference/eval, hash, token-index, and GC red-gate closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic reference-resolution, condition/value/query evaluation, token-index, hash/canonicalization, and allocation/GC residual work
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-030.md`

## Problem

Ticket `150FITLWASM-030` preserved fail-closed-clean production WASM score-row
and preview-state routes while reducing generic spatial/connected-zone
allocation in the active same-seam route. Its retained slice moved the route
from the `150FITLWASM-030` current baseline of `2645.73 ms` per card to a
decisive final `1910.21 ms`, but the original `<=250 ms` gate remains red.

Post-030 diagnostic evidence:

- Baseline command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-030-current-baseline`.
- Baseline result: RED, per-card `elapsedMs=2645.73` versus `<=250 ms`, with
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- Retained spatial/connected diagnostic:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-030-connected-helper-probe`.
- Retained diagnostic result: RED, per-card `elapsedMs=1881.14` versus
  `<=250 ms`, with the same clean active-route counters.
- Decisive final command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-030-final`.
- Decisive final result: RED, per-card `elapsedMs=1910.21` versus
  `<=250 ms`, with the same clean active-route counters.
- CPU profile command:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm030-after-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-030-after-profile`.
- CPU-profile metric: per-card `elapsedMs=1864.6` with profiling enabled,
  active-route unsupported counters both `0`.
- Parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm030-after-profile/CPU.20260504.082542.3.0.001.cpuprofile --targets resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,encodeBatchInput,getEncodedBatchCandidateWords,buildTokenStateIndex,refreshCachedTokenStateIndexEntries,queryConnectedZones,isZoneConnected,canonicalizeHashValue,fnv1a64FromState,updateFnv1a64State,canonicalizeFingerprintValue,normalizeMoveBinding,createMemoKey,evalMapSpacesQuery,validateKnownZone,matchesTokenFilterExprInContext,filterTokensByExprInContext,applyZonesFilter,evalTokensInMapSpacesQuery,resolveBindingTemplate,getCachedContextEntries,setCachedContextEntries,bindingsVersionFor`.
- Remaining residual samples: `resolveRef=139`, `evalCondition=106`,
  `evalValue=75`, `evalQuery=44`,
  `refreshCachedTokenStateIndexEntries=48`, `buildTokenStateIndex=17`,
  `canonicalizeHashValue=57`, `updateFnv1a64State=50`,
  `fnv1a64FromState=29`, `canonicalizeFingerprintValue=22`, and high GC
  samples. Encoding remains small (`encodePolicyBytecodeInput=10`,
  `encodeBatchInput=6`).
- Sample-surface classification: the CPU profile spans Node process lifetime,
  including setup/import/artifact-loading work outside the timed per-card
  metric. Treat remaining reference/eval/query, token-index build/refresh,
  digest/hash/canonicalization, and GC/allocation samples as actionable only
  when the selected implementation target is on the timed profile-drive route.
  Startup/parser/artifact-loading samples must remain separately classified.

Non-overlap rationale: ticket `150FITLWASM-030` owns the spatial connected-zone
queue allocation reduction and boolean connected-condition traversal. This
ticket owns the remaining reference-resolution/eval/query residuals outside
that connected traversal, token-index build/refresh residuals, hash/digest
canonicalization residuals, and allocation/GC work without reverting the
retained spatial slice.

## Assumption Reassessment (2026-05-04)

1. Production WASM score-row and preview-state routes are still active and
   fail-closed-clean; this ticket must preserve those diagnostics.
2. Spatial `connected` condition materialization is no longer the owned first
   target after `150FITLWASM-030`; post-change profiles still show larger
   residuals in reference/eval/query, hash/digest/canonicalization,
   token-index build/refresh, and GC.
3. The `<=250 ms` gate remains unchanged. Tickets `149FITLEVNUMVM-016` and
   `149FITLEVNUMVM-022` remain blocked until this or a later successor makes
   the gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, schemas, branches,
   card names, action names, or hardcoded score behavior.
2. Preserve Foundation 8 determinism. Any cache, lowered evaluator, digest
   shortcut, token-index shortcut, or allocation reduction must be keyed by
   every semantic input and must not depend on ambient process state.
3. Preserve Foundation 11 immutability. Mutable scratch buffers, indexes, and
   caches must remain scoped and must not alias caller-visible state.
4. Preserve Foundation 14. Unsupported future row/classes fail closed; do not
   add compatibility fallbacks.

## What to Change

### 1. Profile the post-030 residual

Use the same-seam harness and CPU-profile parser to separate:

- remaining generic reference-resolution, condition/value/query evaluation, and
  token-filter work;
- token-index refresh/build work;
- decision-stack digest, Zobrist hash, canonicalization, and stable-fingerprint
  work;
- process/GC samples that are inside the timed route versus setup/import noise.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- generic reference-resolution or compiled-condition lowering for repeated
  condition shapes on immutable state;
- reducing token-index refresh/build work without weakening copy-on-write
  lifetime guarantees;
- reducing decision-stack digest, Zobrist hash, or canonicalization work when
  a fresh profile proves it remains material;
- allocation/GC reductions in the timed route when object lifetime and
  immutability can be proven.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after a significant owned
optimization, record exact metrics and create the next non-overlapping owner.

## Ticket reviewer's note

Don't consider the work on implementing the ticket finished until the gate has been reduced significantly from `1910.21 ms`.

## Files to Touch

- generic kernel/query/eval/reference-resolution/token-filter helpers if profiling proves they are the residual owner
- generic token-index helpers if profiling proves they are the residual owner
- generic stable-fingerprint, decision-stack digest, Zobrist, or hash helpers if profiling proves they are the residual owner
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding helpers only if encoding grows back into a material residual
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if additional counters are needed
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
- this ticket (Outcome before closeout)

If this ticket touches `packages/engine/src/kernel/resolve-ref.ts`,
`packages/engine/src/kernel/eval-query.ts`, or
`packages/engine/src/agents/policy-wasm-runtime.ts`, keep the existing oversize
state explicit and prefer adjacent helper extraction when the implementation is
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
- Reverting the `150FITLWASM-030` connected-zone traversal reduction.

## Acceptance Criteria

### Tests That Must Pass

1. Active route remains fail-closed-clean:
   `wasmScoreRowUnsupportedCount=0` and
   `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
2. Focused tests prove any query/eval, reference-resolution, token-filter,
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
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-reference-eval-hash-token-index-gc-residual-perf`.
