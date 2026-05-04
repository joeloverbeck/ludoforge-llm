# 150FITLWASM-027: Residual query/eval and stable-fingerprint closure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic query/eval/reference resolution, spatial filter evaluation, score-row encoding, token-index, and remaining stable-fingerprint/hash residual work
**Deps**: `archive/specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-026.md`

## Problem

Ticket `150FITLWASM-026` preserved fail-closed-clean production WASM score-row
and preview-state routes while landing a run-local pending-request fingerprint
cache for decision-sequence analysis. The same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-residual-fingerprint-cache-final-probe`.
- Post-026 final result: RED, per-card `elapsedMs=2408.84` versus `<=250 ms`.
- Active route remained clean:
  `wasmScoreRowUnsupportedCount=0` and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Post-026 CPU evidence still shows residual owners in
  `stableFingerprintHex` / `fnv1a64` under decision-sequence analysis,
  `resolveRef`, `evalCondition`, `evalValue`, `evalQuery`,
  `queryConnectedZones`, `encodePolicyBytecodeInput`, token-index refresh/build,
  and remaining digest work.

Profile evidence handoff from ticket `150FITLWASM-026`:

- Profile artifact: `/tmp/ludoforge-150fitlwasm026-final-profile/CPU.20260504.031109.3.0.001.cpuprofile` (ephemeral).
- Parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm026-final-profile/CPU.20260504.031109.3.0.001.cpuprofile --targets fnv1a64,fnv1a64FromState,updateFnv1a64State,resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,buildTokenStateIndex,refreshCachedTokenStateIndexEntries,queryConnectedZones,applyTokenFilter`.
- Baseline/current metric: diagnostic pre-change same-seam per-card
  `elapsedMs=2512.87`, final same-seam per-card `elapsedMs=2408.84`.
- Top residual owners in the retained profile: `fnv1a64=263`,
  `resolveRef=147`, `evalCondition=138`, `evalValue=101`,
  `evalQuery=64`, `encodePolicyBytecodeInput=62`, `queryConnectedZones=39`,
  `refreshCachedTokenStateIndexEntries=46`, `buildTokenStateIndex=14`, and
  `updateFnv1a64State=53`.
- Non-overlap rationale: ticket `150FITLWASM-026` kept only a run-local
  pending-request fingerprint cache inside one decision-sequence analysis call.
  This ticket owns the remaining generic query/eval/spatial, encoding,
  token-index, stable-fingerprint, and digest residuals without reverting that
  request-fingerprint slice.

## Assumption Reassessment (2026-05-04)

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must preserve those diagnostics.
2. Ticket `150FITLWASM-026` reduced the same-checkout non-CPU sample but the
   decisive wall-clock gate remained around `2.4 s`.
3. The `<=250 ms` target is unchanged. Ticket `149FITLEVNUMVM-016` remains
   blocked until this or a later successor makes the gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, schemas, branches,
   card names, action names, or hardcoded score behavior.
2. Preserve Foundation 8 determinism. Any query/eval cache, lowered evaluator,
   stable-fingerprint shortcut, encoding shortcut, token-index change, or hash
   shortcut must be keyed by every semantic input and must not depend on ambient
   process state.
3. Preserve Foundation 11 immutability. Mutable preview/apply/index/cache state
   must remain private and must not alias caller-visible state.
4. Preserve Foundation 14. Unsupported future row/classes fail closed; do not
   add compatibility fallbacks.

## What to Change

### 1. Profile the post-026 residual

Use the same-seam harness and CPU-profile parser to separate:

- stable-fingerprint / decision-sequence hashing;
- query/eval/reference resolution and spatial filter evaluation;
- residual score-row input/batch encoding;
- token-index refresh/build work;
- remaining hash/digest work.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- avoiding repeated stable fingerprint construction or hashing for immutable
  decision-sequence request/search shapes;
- a generic query/eval or reference-resolution cache/lowering path for repeated
  filter shapes on immutable state;
- pre-lowering spatial/filter evaluation fragments that currently recurse
  through interpreted `evalCondition`/`evalValue`/`evalQuery`;
- reducing score-row input/batch encoding if profiling proves it remains
  material;
- reducing token-index refresh/build work without weakening copy-on-write
  lifetime guarantees;
- remaining hash/digest reduction if profiling proves it is still material.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after the owned
optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- generic kernel/query/eval/reference-resolution/spatial helpers if profiling proves they are the residual owner
- generic decision-sequence, stable-fingerprint, or hash helpers if profiling proves they are the residual owner
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
2. Focused tests prove any stable-fingerprint, query/eval,
   reference-resolution, spatial filter, encoding, token-index, cache, or hash
   change preserves deterministic semantics and does not call the TypeScript
   preview driver for supported preview-state feature rows.
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
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-stable-fingerprint-query-eval-residual-perf`.

## Outcome

2026-05-04 implementation landed a generic namespace-prefix stable
fingerprint hasher and routed decision-sequence pending-request fingerprints
through it.

- `packages/engine/src/kernel/stable-fingerprint.ts` now exposes
  `createStableFingerprintHasher(namespace)`, which precomputes the FNV state
  for `<namespace>\0` and hashes only the canonicalized value for repeated
  calls. The existing `stableFingerprintHex(namespace, value)` helper remains
  the reference shape and produces identical hashes.
- `packages/engine/src/kernel/decision-sequence-analysis.ts` now reuses the
  precomputed namespace hasher for the constant
  `decision-sequence-analysis-v1` pending-request fingerprint namespace.
- `packages/engine/test/unit/kernel/stable-fingerprint.test.ts` proves exact
  parity with `stableFingerprintHex`, namespace separation, and canonical
  object-key ordering. No schema, WASM ABI, generated artifact, score-row
  buffer, or serialized trace shape changed.

Measured result:

- Diagnostic pre-change same-seam CPU profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm027-baseline-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-residual-baseline-profile`
  — RED, per-card `elapsedMs=2387.1`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmProductionPreviewDriveBatchCount=232`.
- Parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm027-baseline-profile/CPU.20260504.032305.3.0.001.cpuprofile --targets fnv1a64,fnv1a64FromState,updateFnv1a64State,stableFingerprintHex,canonicalizeFingerprintValue,resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,buildTokenStateIndex,refreshCachedTokenStateIndexEntries,queryConnectedZones,applyTokenFilter`.
- Baseline CPU evidence selected the ticket-owned fingerprint bucket:
  `fnv1a64=268` self samples, with `264` from `stableFingerprintHex` under
  decision-sequence pending-request fingerprints. Other residual owners were
  `resolveRef=180`, `evalCondition=142`, `evalValue=77`, `evalQuery=64`,
  `encodePolicyBytecodeInput=69`, `refreshCachedTokenStateIndexEntries=52`,
  `buildTokenStateIndex=22`, and `queryConnectedZones=23`.
- Final non-CPU same-seam profile:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-stable-fingerprint-query-eval-residual-perf`
  — RED, per-card `elapsedMs=2477.81`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmProductionPreviewDriveBatchCount=232`.
- Post-change CPU profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm027-prefix-hasher-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-stable-fingerprint-prefix-hasher-profile`
  — RED, per-card `elapsedMs=2504.83` with CPU profiling enabled,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmProductionPreviewDriveBatchCount=232`.
- Parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/ludoforge-150fitlwasm027-prefix-hasher-profile/CPU.20260504.032438.3.0.001.cpuprofile --targets fnv1a64,fnv1a64FromState,updateFnv1a64State,stableFingerprintHex,canonicalizeFingerprintValue,resolveRef,evalCondition,evalValue,evalQuery,encodePolicyBytecodeInput,buildTokenStateIndex,refreshCachedTokenStateIndexEntries,queryConnectedZones,applyTokenFilter`.
- Post-change CPU evidence shows the ticket-owned `stableFingerprintHex` /
  `fnv1a64` bucket moved from `268` self samples to zero direct `fnv1a64`
  samples. The new precomputed-prefix path accounts for `5` `fnv1a64FromState`
  self samples under `stable-fingerprint.ts`. Remaining residual owners include
  `resolveRef=189`, `evalCondition=124`, `evalValue=78`, `evalQuery=74`,
  `encodePolicyBytecodeInput=65`, `refreshCachedTokenStateIndexEntries=57`,
  `buildTokenStateIndex=23`, `queryConnectedZones=29`, and
  `updateFnv1a64State=39` under decision-stack digest work.

Retained candidate classification:

- `root-cause bucket improved`: the selected same-seam CPU bucket was removed
  from direct `fnv1a64` under `stableFingerprintHex`, with exact hash parity
  proven by the focused unit test.
- `same-seam wall-clock gate still red`: the decisive non-CPU sample remained
  red and did not prove a wall-clock win (`2477.81 ms` versus diagnostic
  pre-change `2387.1 ms`). This ticket therefore does not add the `<=250 ms`
  perf gate and does not unblock `149FITLEVNUMVM-016` or
  `149FITLEVNUMVM-022`.

Created successor `tickets/150FITLWASM-028.md` for the next non-overlapping
owner: query/eval/reference-resolution, spatial filter evaluation, score-row
encoding, token-index refresh/build, decision-stack digest hashing, and any
remaining stable-fingerprint/canonicalization residuals after the prefix-hasher
slice. Tickets `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` remain blocked
until that or a later successor makes the `<=250 ms` gate truthful.

Proof invalidation note: the post-measurement ticket/spec/dependency edits only
transcribed the red metric and moved successor ownership; they did not change
code, command semantics, thresholds, scope, or acceptance boundaries for the
measured command. The focused non-metric final lanes were rerun after graph
edits. The final `COMPLETED` status edit records the already-proven red-plus-
successor completion contract and does not change the measured command.
