# 150FITLWASM-022: Full-hash and residual query/eval closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic full-hash, decision-frame digest, query/eval, token-index, and residual encoding work
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-021.md`

## Problem

Ticket `150FITLWASM-021` preserved fail-closed-clean production WASM score-row
and preview-state routes while landing a generic initial-state setup hash
reduction. The same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-021-initial-setup-hash-skip-probe`.
- Post-021 result: RED, per-card `elapsedMs=2464.14` versus `<=250 ms`.
- Active route remained clean:
  `wasmScoreRowUnsupportedCount=0` and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- The retained root counter improved:
  `zobristKeyCacheMissCount=8208 -> 3717`, with `zobristKeyUncachedCount=1391`
  unchanged.
- Post-021 CPU evidence still shows residual owners in
  `fnv1a64`/`zobristKey` under full-hash and decision-frame hashing,
  `resolveRef`, `evalCondition`, `evalValue`, `evalQuery`,
  `encodePolicyBytecodeInput`, and token-index refresh.

## Assumption Reassessment (2026-05-04)

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must preserve those diagnostics.
2. Ticket `150FITLWASM-021` removed redundant setup token-placement hash work,
   but same-seam wall time remains around `2.5 s`.
3. The `<=250 ms` target is unchanged. Ticket `149FITLEVNUMVM-016` remains
   blocked until this or a later successor makes the gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, schemas, branches,
   card names, action names, or hardcoded score behavior.
2. Preserve Foundation 8 determinism. Any full-hash shortcut, digest cache,
   query/eval cache, token-index change, or encoding shortcut must be keyed by
   every semantic input and must not depend on ambient process state.
3. Preserve Foundation 11 immutability. Mutable preview/apply/index state must
   remain private and must not alias caller-visible state.
4. Preserve Foundation 14. Unsupported future row/classes fail closed; do not
   add compatibility fallbacks.

## What to Change

### 1. Profile the post-021 residual

Use the same-seam harness and CPU-profile parser to separate:

- full-hash verification and decision-frame digest hashing;
- query/eval/reference resolution;
- token-index refresh/build work;
- spatial/query helper work;
- residual score-row input/batch encoding.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- a deterministic bounded full-hash verification strategy that preserves the
  `verifyIncrementalHash` contract without recomputing redundant work at every
  microturn boundary;
- a generic decision-frame digest shortcut keyed by immutable frame structure;
- a generic fast path or lowered evaluator for repeated query/filter shapes
  still interpreted by the active production preview route;
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
- generic token/index helpers if profiling proves they are the residual owner
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` or adjacent generic preview-drive helpers if preview application remains the residual owner
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding helpers if encoding remains the residual owner
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if additional counters are needed
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
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
2. Focused tests prove any full-hash, decision-frame digest, query/eval,
   preview-apply, token-index, cache, or encoding change preserves deterministic
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

1. `pnpm -F @ludoforge/engine-wasm build` if Rust/WASM artifacts are touched.
2. `pnpm -F @ludoforge/engine build`.
3. Focused tests for the changed generic seam.
4. `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`.
5. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-full-hash-query-eval-residual-perf`.
