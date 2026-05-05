# 150FITLWASM-026: Query/eval and encoding residual closure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic query/eval/reference resolution, spatial filter evaluation, score-row encoding, token-index, and remaining hash residual work
**Deps**: `archive/specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-025.md`

## Problem

Ticket `150FITLWASM-025` preserved fail-closed-clean production WASM score-row
and preview-state routes while landing generic FNV prefix-state reuse for
Zobrist feature-key and decision-stack digest hashing. The same-seam gate is
still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-residual-perf`.
- Post-025 final result: RED, per-card `elapsedMs=2375.99` versus `<=250 ms`.
- Active route remained clean:
  `wasmScoreRowUnsupportedCount=0` and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Post-025 CPU evidence shows the prior Zobrist feature-key FNV bucket is no
  longer the largest owner. Remaining top residual owners include
  `resolveRef`, `evalCondition`, `evalValue`, `evalQuery`,
  `encodePolicyBytecodeInput`, token-index refresh/build, spatial filter
  evaluation, and smaller remaining hash/digest work.

Profile evidence handoff from ticket `150FITLWASM-025`:

- Profile artifact: `/tmp/ludoforge-150fitlwasm025-final-profile/CPU.20260504.024826.3.0.001.cpuprofile` (ephemeral).
- Parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm025-final-profile/CPU.20260504.024826.3.0.001.cpuprofile --targets fnv1a64,fnv1a64FromState,updateFnv1a64State,resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,buildTokenStateIndex,refreshCachedTokenStateIndexEntries`.
- Baseline/current metric: diagnostic pre-change same-seam per-card
  `elapsedMs=2479.19`, final same-seam per-card `elapsedMs=2375.99`.
- Top residual owners in the retained profile: `resolveRef=188`,
  `evalCondition=139`, `evalValue=104`, `evalQuery=69`,
  `encodePolicyBytecodeInput=64`, `refreshCachedTokenStateIndexEntries=51`,
  `buildTokenStateIndex=16`, and residual `fnv1a64=75` self samples.
- Non-overlap rationale: ticket `150FITLWASM-025` kept only generic FNV
  prefix-state reuse for hash-key/digest prefixes; this ticket owns remaining
  query/eval/reference-resolution, spatial filter, encoding, token-index, and
  smaller hash residuals without reverting that prefix-state slice.

## Assumption Reassessment (2026-05-04)

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must preserve those diagnostics.
2. Ticket `150FITLWASM-025` removed the largest Zobrist feature-key FNV bucket,
   but the decisive wall-clock gate remained around `2.38 s`.
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

### 1. Profile the post-025 residual

Use the same-seam harness and CPU-profile parser to separate:

- query/eval/reference resolution and spatial filter evaluation;
- residual score-row input/batch encoding;
- token-index refresh/build work;
- remaining hash/digest work.

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
- remaining hash/digest reduction only if profiling proves it is still material
  after query/eval and encoding are separated.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after the owned
optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- generic kernel/query/eval/reference-resolution/spatial helpers if profiling proves they are the residual owner
- generic decision-sequence or stable-fingerprint helpers if profiling proves they are the residual owner
- generic token-index helpers if profiling proves they are the residual owner
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding helpers if encoding remains the residual owner
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if additional counters are needed
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
- this ticket (Outcome before closeout)

If this ticket touches `packages/engine/src/agents/policy-wasm-runtime.ts`, keep
the existing oversize state explicit. It was `923` lines before ticket
`150FITLWASM-025`; preserve or improve the boundary unless profiling proves
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
   encoding, token-index, cache, or hash change preserves deterministic
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
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-residual-perf`.

## Outcome

2026-05-04 implementation landed a run-local pending-request fingerprint cache
inside generic decision-sequence analysis while preserving the active WASM
score-row and preview-state routes.

- `packages/engine/src/kernel/decision-sequence-analysis.ts` now caches the
  deterministic fingerprint for each pending request object inside one
  `analyzeDecisionSequence` call. The memo key still includes the action id,
  normalized move binding, and the same stable request fingerprint; the cache
  only avoids recomputing that fingerprint when the same immutable request
  object is reused by the existing request cache.
- The cache is scoped to a single analysis invocation and cannot alias
  caller-visible state. It stores deterministic strings derived from existing
  request shape, not mutable runtime objects.
- The implementation added profiler hit/miss counters for this internal cache,
  but no serialized schema, generated artifact, WASM ABI, or score-row buffer
  changed.

Measured result:

- Diagnostic pre-change same-seam CPU profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm026-baseline-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-residual-baseline-profile`
  — RED, per-card `elapsedMs=2512.87`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `zobristKeyCacheMissCount=2319`, `zobristKeyCacheHitCount=188266`,
  `zobristKeyUncachedCount=333`.
- Final non-CPU same-seam profile:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-residual-fingerprint-cache-final-probe`
  — RED, per-card `elapsedMs=2408.84`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmProductionPreviewDriveBatchCount=232`,
  `zobristKeyCacheMissCount=2319`, `zobristKeyCacheHitCount=188266`,
  `zobristKeyUncachedCount=333`.
- Post-change CPU profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm026-final-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-residual-fingerprint-cache-final-profile`
  — RED, per-card `elapsedMs=2464.35` with CPU profiling enabled,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm026-final-profile/CPU.20260504.031109.3.0.001.cpuprofile --targets fnv1a64,fnv1a64FromState,updateFnv1a64State,resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,buildTokenStateIndex,refreshCachedTokenStateIndexEntries,queryConnectedZones,applyTokenFilter`.
- Post-change CPU evidence shows the ticket-owned stable-fingerprint FNV bucket
  moved from diagnostic `fnv1a64=287` to `fnv1a64=263` self samples, while
  remaining residual owners include `resolveRef=147`, `evalCondition=138`,
  `evalValue=101`, `evalQuery=64`, `encodePolicyBytecodeInput=62`,
  `queryConnectedZones=39`, `refreshCachedTokenStateIndexEntries=46`,
  `buildTokenStateIndex=14`, and `updateFnv1a64State=53`.

Retained candidate classification:

- `owned metric improved`: same-checkout same-seam per-card wall time moved
  from diagnostic `2512.87 ms` to final non-CPU `2408.84 ms` while preserving
  clean active-route counters. The result remains red against `<=250 ms`, so no
  perf gate test was added.
- `root-cause bucket improved`: post-change CPU parsing shows the
  decision-sequence `fnv1a64` bucket reduced from `287` to `263` self samples.
  The retained helper is generic and scoped to one analysis call.
- `wall-clock gate still red`: `149FITLEVNUMVM-016` and
  `149FITLEVNUMVM-022` remain blocked.

Created successor `tickets/150FITLWASM-027.md` for the next non-overlapping
owner: residual stable-fingerprint / decision-sequence hashing,
query/eval/reference-resolution, spatial filter evaluation, score-row
encoding, token-index refresh/build, and remaining hash residuals. Tickets
`149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` remain blocked until that or a
later successor makes the `<=250 ms` gate truthful.

Proof invalidation note: the post-measurement ticket/spec/dependency edits only
transcribed the red metric and moved successor ownership; they did not change
code, command semantics, thresholds, scope, or acceptance boundaries for the
measured command. The focused final lanes were rerun after graph edits. The
final `COMPLETED` status edit was status-only after those lanes passed and did
not change scope, command semantics, thresholds, dependency ownership, or
acceptance boundaries.
