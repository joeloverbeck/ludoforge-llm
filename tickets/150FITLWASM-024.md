# 150FITLWASM-024: Initial full-hash and query/eval residual closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic initial/full-hash, query/eval/reference resolution, token-index, and residual encoding work
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-023.md`

## Problem

Ticket `150FITLWASM-023` preserved fail-closed-clean production WASM score-row
and preview-state routes while landing apply-move token-placement hash deferral
for reconciled move boundaries. The same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-token-hash-residual-perf`.
- Post-023 final result: RED, per-card `elapsedMs=2557.17` versus `<=250 ms`.
- Active route remained clean:
  `wasmScoreRowUnsupportedCount=0` and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- The retained root counter improved:
  `zobristKeyCacheMissCount=3717 -> 2837`.
- Post-023 CPU evidence shows residual owners in initial-state/full-hash
  token-placement hashing, decision-stack frame digests, `resolveRef`,
  `evalCondition`, `evalValue`, `evalQuery`, `encodePolicyBytecodeInput`, and
  token-index refresh.

## Assumption Reassessment (2026-05-04)

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must preserve those diagnostics.
2. Ticket `150FITLWASM-023` removed redundant apply-move token-placement hash
   work from reconciled move scopes, but the decisive same-seam wall time
   remains around `2.56 s`.
3. The `<=250 ms` target is unchanged. Ticket `149FITLEVNUMVM-016` remains
   blocked until this or a later successor makes the gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, schemas, branches,
   card names, action names, or hardcoded score behavior.
2. Preserve Foundation 8 determinism. Any full-hash shortcut, digest cache,
   query/eval cache, token-index change, or encoding shortcut must be keyed by
   every semantic input and must not depend on ambient process state.
3. Preserve Foundation 11 immutability. Mutable preview/apply/index/cache state
   must remain private and must not alias caller-visible state.
4. Preserve Foundation 14. Unsupported future row/classes fail closed; do not
   add compatibility fallbacks.

## What to Change

### 1. Profile the post-023 residual

Use the same-seam harness and CPU-profile parser to separate:

- initial-state/full-hash token-placement hashing;
- decision-stack frame digest hashing;
- query/eval/reference resolution;
- token-index refresh/build work;
- residual score-row input/batch encoding.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- a deterministic initial-state/full-hash strategy that avoids redundant
  token-placement FNV work without changing canonical hash values;
- a generic decision-frame digest shortcut keyed by immutable frame structure;
- a generic query/eval or reference-resolution cache/lowering path for repeated
  filter shapes on immutable state;
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
2. Focused tests prove any full-hash, decision-frame digest, query/eval,
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
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-initial-full-hash-query-eval-residual-perf`.
