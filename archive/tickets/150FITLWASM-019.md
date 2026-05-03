# 150FITLWASM-019: Active-route residual hash/eval/encoding closure

**Status**: COMPLETED with red measured gate successor `tickets/150FITLWASM-020.md`
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic residual hash/digest, query/eval, bytecode-input encoding, and remaining active WASM preview-route work
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-018.md`

## Problem

Ticket `150FITLWASM-018` kept the production WASM score-row and preview-state
routes fail-closed-clean and removed a measured token-index copy residual from
private mutable effect scopes. It also added a bounded pure digest cache for
structurally identical decision-stack frames. The same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-apply-hash-token-index-perf`.
- Verdict: RED, per-card `elapsedMs=2761.91` versus `<=250 ms` in the final
  post-018 same-seam profile.
- Active route remains clean:
  `wasmScoreRowUnsupportedCount=0` and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Remaining profile owners include `fnv1a64` under decision-stack digest and
  Zobrist keying, `resolveRef`, `evalCondition`, `evalValue`, `evalQuery`,
  spatial/query helpers, and `encodePolicyBytecodeInput`.

## Assumption Reassessment

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must preserve that diagnostic surface.
2. Ticket `150FITLWASM-018` moved the token-index copy owner out of the material
   top-frame set, but the red gate remains dominated by generic hashing,
   interpreted query/eval, and score-row encoding work.
3. The `<=250 ms` target is unchanged. Ticket `149FITLEVNUMVM-016` remains
   blocked until this or a later successor makes the gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, card names, action
   names, schemas, or score shortcuts.
2. Preserve Foundation 8 determinism. Any cache or encoding shortcut must be
   keyed by every semantic input and must not depend on ambient process state.
3. Preserve Foundation 11 immutability. Mutable preview/eval state must remain
   private and must not alias caller-visible state.
4. Preserve Foundation 14. Unsupported future classes fail closed; do not add
   compatibility fallbacks.

## What to Change

### 1. Profile the post-018 residual

Use the same-seam harness and CPU-profile parser to separate:

- decision-stack digest, Zobrist, and stable-fingerprint hashing;
- remaining query/eval/reference resolution;
- score-row bytecode input encoding;
- spatial/query helper work;
- any residual token-index refresh/build work not removed by ticket 018.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- caching or hoisting deterministic decision-stack/state digest fragments where
  immutable structural identity or bounded canonical input makes that safe;
- pre-lowering or bytecoding generic query/eval fragments still interpreted by
  the active production preview-drive route;
- reducing repeated score-row bytecode input encoding when identical
  program/layout/state prefixes repeat across batches.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after the owned
optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- generic kernel/hash/query/eval helpers if profiling proves they are the
  residual owner
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

## Acceptance Criteria

### Tests That Must Pass

1. Active route remains fail-closed-clean:
   `wasmScoreRowUnsupportedCount=0` and
   `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
2. Focused tests prove any cache, hash, query/eval lowering, encoding, or
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
5. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-residual-hash-eval-encoding-perf`.

## Outcome

Completed on 2026-05-03 with the active route still red and successor owner
created:

- Added a generic shared `fnv1a64` helper that computes the same canonical
  64-bit FNV-1a digest through unsigned 32-bit limbs instead of BigInt
  multiplication inside the per-character loop.
- Routed Zobrist keying and stable fingerprinting through that helper. This
  preserves existing hash values while reducing the ticket-owned active-route
  hashing residual.
- Added a Zobrist oracle regression that compares table seeds and representative
  feature keys against an independent canonical BigInt FNV-1a implementation.

Diagnostic proof before final ticket graph closeout:

- `pnpm -F @ludoforge/engine-wasm build` — PASS.
- `pnpm -F @ludoforge/engine build` — PASS.
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/zobrist-table.test.js` — PASS.
- Baseline diagnostic CPU profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-profile-150019-baseline packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-019-current-baseline` — RED for the `<=250 ms` gate.
- Baseline per-card `elapsedMs=3127.34`, `decisions=158`,
  `msPerDecision=19.7933`.
- Post-change diagnostic CPU profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-profile-150019-after-shared-fnv packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-019-after-shared-fnv` — RED for the `<=250 ms` gate.
- Post-change diagnostic per-card `elapsedMs=2526.37`, `decisions=158`,
  `msPerDecision=15.9897`.
- Active route counters remained clean:
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmScoreRowRouteCount=62`,
  `wasmPreviewCandidateFeatureRowRouteCount=70`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- The diagnostic CPU profile still shows remaining generic owners in
  `fnv1a64`/Zobrist misses, `resolveRef`, `evalCondition`, `evalValue`,
  `evalQuery`, `encodePolicyBytecodeInput`, token-index refresh, and
  spatial/query helpers.

Created successor `tickets/150FITLWASM-020.md` for the next non-overlapping
owner: active-route query/eval/encoding residual closure. Tickets
`149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` remain blocked until this or a
later successor makes the `<=250 ms` gate truthful.

Final proof:

- `pnpm run check:ticket-deps` — PASS after creating successor
  `tickets/150FITLWASM-020.md` and updating active blockers/spec handoff.
- `pnpm -F @ludoforge/engine build` — PASS.
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/zobrist-table.test.js dist/test/unit/agents/policy-preview-driver.test.js` — PASS.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-residual-hash-eval-encoding-perf` — RED for the `<=250 ms` gate.
- Overall `elapsedMs=2460.84`; per-card `elapsedMs=2460.65`,
  `decisions=158`, `msPerDecision=15.5737`.
- Active route counters:
  `wasmScoreRowRouteCount=62`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=35`,
  `wasmPreviewCandidateFeatureRowRouteCount=70`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- Hash/index counters:
  `tokenStateIndexBuildCount=1320`,
  `zobristKeyCacheHitCount=194070`,
  `zobristKeyCacheMissCount=8400`, and
  `zobristKeyUncachedCount=1199`.
- Profile buckets:
  `simAgentChooseMove=482.08 ms`,
  `agent:evaluatePolicyExpression=480.38 ms`, and
  `simApplyMove=353.67 ms`.

The gate remains `2210.65 ms` over the `<=250 ms` target. No perf gate test was
added because the measured result cannot truthfully assert the budget. Tickets
`149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` remain blocked.

No-invalidation note: the post-profile edits transcribed the exact final metrics
and terminal red-gate successor status only. They did not change code, command
semantics, thresholds, or acceptance boundaries, so the final focused test and
same-seam profile above remain the final proof for this ticket.
