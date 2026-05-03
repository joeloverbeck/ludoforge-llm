# 150FITLWASM-020: Active-route query/eval/encoding residual closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic residual query/eval, bytecode-input encoding, token-index refresh, and remaining active WASM preview-route work
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-019.md`

## Problem

Ticket `150FITLWASM-019` moved the active-route Zobrist/stable-fingerprint
hashing residual to a shared exact 32-bit-limb FNV implementation while keeping
production WASM score-row and preview-state routes fail-closed-clean. The
same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-residual-hash-eval-encoding-perf`.
- Final post-019 result: RED, per-card `elapsedMs=2460.65` versus
  `<=250 ms`.
- Active route remained clean:
  `wasmScoreRowUnsupportedCount=0` and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Remaining profile owners include `resolveRef`, `evalCondition`, `evalValue`,
  `evalQuery`, `encodePolicyBytecodeInput`, token-index refresh, spatial/query
  helpers, and residual Zobrist misses.

## Assumption Reassessment

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must preserve that diagnostic surface.
2. Ticket `150FITLWASM-019` reduced the generic FNV hash implementation cost
   without changing canonical hash values, but the gate remains dominated by
   query/eval/encoding and residual state-materialization work.
3. The `<=250 ms` target is unchanged. Ticket `149FITLEVNUMVM-016` remains
   blocked until this or a later successor makes the gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, card names, action
   names, schemas, or score shortcuts.
2. Preserve Foundation 8 determinism. Any query/eval cache, encoding shortcut,
   or hash optimization must be keyed by every semantic input and must not
   depend on ambient process state.
3. Preserve Foundation 11 immutability. Mutable preview/eval state must remain
   private and must not alias caller-visible state.
4. Preserve Foundation 14. Unsupported future classes fail closed; do not add
   compatibility fallbacks.

## What to Change

### 1. Profile the post-019 residual

Use the same-seam harness and CPU-profile parser to separate:

- remaining query/eval/reference resolution;
- score-row bytecode input encoding;
- spatial/query helper work;
- token-index refresh/build work;
- residual Zobrist/fingerprint hashing.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- pre-lowering or bytecoding generic query/eval fragments still interpreted by
  the active production preview-drive route;
- reducing repeated score-row bytecode input encoding when identical
  program/layout/state prefixes repeat across batches;
- caching bounded deterministic query/materialization results where immutable
  structural identity makes that safe;
- reducing token-index refresh work without weakening copy-on-write lifetime
  guarantees.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after the owned
optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- generic kernel/query/eval helpers if profiling proves they are the residual owner
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` or
  adjacent generic preview-drive helpers
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding
  helpers
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if additional
  counters are needed
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the
  gate unblocks or moves
- this ticket (Outcome before closeout)

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
2. Focused tests prove any query/eval lowering, encoding, token-index, cache, or
   preview-state lifetime change preserves deterministic semantics and does not
   call the TypeScript preview driver for supported preview-state feature rows.
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
5. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-residual-perf`.
