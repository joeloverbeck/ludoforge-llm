# 150FITLWASM-028: Query/eval, encoding, token-index, and digest residual closure

**Status**: PENDING
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
