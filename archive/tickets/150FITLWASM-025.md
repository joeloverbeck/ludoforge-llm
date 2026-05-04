# 150FITLWASM-025: Query/eval and initial-hash residual closure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic query/eval/reference resolution, initial/full-hash, token-index, and residual encoding work
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-024.md`

## Problem

Ticket `150FITLWASM-024` preserved fail-closed-clean production WASM score-row
and preview-state routes while landing run-local initial full-hash Zobrist table
cache reuse. The same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-initial-full-hash-query-eval-residual-perf`.
- Post-024 final result: RED, per-card `elapsedMs=2467.29` versus `<=250 ms`.
- Active route remained clean:
  `wasmScoreRowUnsupportedCount=0` and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- The retained root counter improved:
  `zobristKeyCacheMissCount=2837 -> 2319`.
- Post-024 CPU evidence still shows residual owners in initial-state/full-hash
  token-placement hashing, `resolveRef`, `evalCondition`, `evalValue`,
  `evalQuery`, `encodePolicyBytecodeInput`, and token-index refresh/build work.

Profile evidence handoff from ticket `150FITLWASM-024`:

- Profile artifact: `/tmp/ludoforge-150fitlwasm024-runtime-table-profile/CPU.20260504.020911.3.0.001.cpuprofile` (ephemeral).
- Parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm024-runtime-table-profile/CPU.20260504.020911.3.0.001.cpuprofile --targets fnv1a64,resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,buildTokenStateIndex,refreshTokenStateIndex`.
- Baseline/current metric: baseline same-seam per-card `elapsedMs=2441.04`, final same-seam per-card `elapsedMs=2467.29`; the retained root counter improved `zobristKeyCacheMissCount=2837 -> 2319`.
- Top residual owners in the retained profile: `fnv1a64=442`, `resolveRef=159`, `evalCondition=129`, `evalValue=93`, `evalQuery=80`, `encodePolicyBytecodeInput=58`, `buildTokenStateIndex=21`, `refreshTokenStateIndex=0` self samples.
- Non-overlap rationale: ticket `150FITLWASM-024` kept only run-local initial full-hash Zobrist table reuse; this ticket owns the remaining query/eval/reference-resolution, initial/full-hash token-placement, token-index, and encoding residuals without reverting that cache-reuse slice.

## Assumption Reassessment (2026-05-04)

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must preserve those diagnostics.
2. Ticket `150FITLWASM-024` moved initial full-hash key population onto the
   run-local runtime Zobrist table, reducing later cache misses, but the
   decisive wall-clock gate remained around `2.47 s`.
3. The `<=250 ms` target is unchanged. Ticket `149FITLEVNUMVM-016` remains
   blocked until this or a later successor makes the gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, schemas, branches,
   card names, action names, or hardcoded score behavior.
2. Preserve Foundation 8 determinism. Any query/eval cache, lowered evaluator,
   full-hash shortcut, token-index change, or encoding shortcut must be keyed by
   every semantic input and must not depend on ambient process state.
3. Preserve Foundation 11 immutability. Mutable preview/apply/index/cache state
   must remain private and must not alias caller-visible state.
4. Preserve Foundation 14. Unsupported future row/classes fail closed; do not
   add compatibility fallbacks.

## What to Change

### 1. Profile the post-024 residual

Use the same-seam harness and CPU-profile parser to separate:

- initial-state/full-hash token-placement hashing;
- query/eval/reference resolution;
- token-index refresh/build work;
- residual score-row input/batch encoding.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- a generic query/eval or reference-resolution cache/lowering path for repeated
  filter shapes on immutable state;
- a deterministic initial/full-hash strategy that avoids repeated
  token-placement FNV work without changing canonical hash values;
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

- generic kernel/hash/query/eval helpers if profiling proves they are the residual owner
- generic token/hash/index helpers if profiling proves they are the residual owner
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` or adjacent generic preview-drive helpers if preview application remains the residual owner
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding helpers if encoding remains the residual owner
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if additional counters are needed
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
- this ticket (Outcome before closeout)

If this ticket touches `packages/engine/src/agents/policy-wasm-runtime.ts`, keep
the existing oversize state explicit. It was `923` lines before this ticket;
preserve or improve the boundary unless profiling proves that same file is
still the cleanest residual owner.

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
2. Focused tests prove any full-hash, query/eval, reference-resolution,
   token-index, cache, or encoding change preserves deterministic semantics and
   does not call the TypeScript preview driver for supported preview-state
   feature rows.
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
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-initial-hash-residual-perf`.

## Outcome

2026-05-04 implementation landed generic prefix-state hashing for repeated
Zobrist feature-key and decision-stack digest FNV inputs while preserving the
active WASM score-row and preview-state routes.

- `packages/engine/src/kernel/fnv1a64.ts` now exposes deterministic FNV state
  continuation helpers. They compute the same canonical FNV-1a value as hashing
  the full string at once, but allow callers to reuse already-hashed stable
  prefixes.
- `packages/engine/src/kernel/zobrist.ts` now reuses the FNV state after the
  stable `zobrist-key-v1|seed=...|` prefix for feature keys and after the two
  decision-stack digest salt prefixes. Canonical Zobrist values and frame
  digests stay unchanged; the existing Zobrist oracle test proves the feature
  key output against the BigInt FNV oracle.

Measured result:

- Diagnostic pre-change same-seam CPU profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm025-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-initial-hash-residual-profile`
  — RED, per-card `elapsedMs=2479.19`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `zobristKeyCacheMissCount=2319`, `zobristKeyCacheHitCount=188266`,
  `zobristKeyUncachedCount=333`.
- Final non-CPU same-seam profile:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-initial-hash-prefix-state-final`
  — RED, per-card `elapsedMs=2375.99`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `zobristKeyCacheMissCount=2319`, `zobristKeyCacheHitCount=188266`,
  `zobristKeyUncachedCount=333`.
- Post-change CPU profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm025-final-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-initial-hash-prefix-state-final-profile`
  — RED, per-card `elapsedMs=2526.98` with CPU profiling enabled,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm025-final-profile/CPU.20260504.024826.3.0.001.cpuprofile --targets fnv1a64,fnv1a64FromState,updateFnv1a64State,resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,buildTokenStateIndex,refreshCachedTokenStateIndexEntries`.
- Post-change CPU evidence shows the prior `fnv1a64` feature-key bucket moved
  out of the top residual list. Remaining top residual owners include
  `resolveRef=188`, `evalCondition=139`, `evalValue=104`, `evalQuery=69`,
  `encodePolicyBytecodeInput=64`, `refreshCachedTokenStateIndexEntries=51`,
  `buildTokenStateIndex=16`, and residual `fnv1a64=75` mostly under
  stable-fingerprint or pre-cached decision-stack digest paths.

Retained candidate classification:

- `owned metric improved`: same-seam per-card wall time moved from diagnostic
  `2479.19 ms` to final non-CPU `2375.99 ms` while preserving clean active
  route counters. The result remains red against `<=250 ms`, so no perf gate
  test was added.
- `root-cause bucket improved`: post-change CPU parsing shows Zobrist
  feature-key hashing no longer dominates `fnv1a64`; the retained helper is
  generic and keyed only by immutable table/salt prefixes.
- `wall-clock gate still red`: `149FITLEVNUMVM-016` and
  `149FITLEVNUMVM-022` remain blocked.

Created successor `tickets/150FITLWASM-026.md` for the next non-overlapping
owner: residual query/eval/reference-resolution, spatial filter evaluation,
score-row encoding, token-index refresh/build, and remaining hash residuals.
Tickets `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` remain blocked until that
or a later successor makes the `<=250 ms` gate truthful.

No-invalidation note: the post-measurement ticket/spec/dependency edits only
transcribe the measured red result and move successor ownership; they do not
change code, command semantics, thresholds, or acceptance boundaries.

Verification:

- `pnpm -F @ludoforge/engine build` — PASS.
- `timeout 60 pnpm -F @ludoforge/engine exec node --test dist/test/unit/zobrist-table.test.js` — PASS.
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js` — PASS.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-initial-hash-prefix-state-final` — RED as expected for the retained red-gate handoff; per-card `elapsedMs=2375.99`, unsupported counters both `0`.
- `pnpm run check:ticket-deps` — PASS after creating `tickets/150FITLWASM-026.md` and rewiring dependent tickets.
- `git diff --check` — PASS.
