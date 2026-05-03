# 150FITLWASM-021: Deeper active-route query/apply/hash residual closure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic query/eval, preview application, hashing, and token-index residuals
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-020.md`

## Problem

Ticket `150FITLWASM-020` preserved fail-closed-clean production WASM score-row
and preview-state routes while landing two generic residual reductions:
unchanged token-placement hash elision and WeakMap-scoped encoded bytecode input
caching. The same-seam gate is still red:

- Command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-query-eval-encoding-residual-perf`.
- Diagnostic post-020 result: RED, per-card still roughly `2.5 s` versus
  `<=250 ms`.
- Active route remained clean in diagnostic probes:
  `wasmScoreRowUnsupportedCount=0` and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Remaining profile owners include `fnv1a64`/`zobristKey` under token creation
  and decision-frame hashing, `resolveRef`, `evalCondition`, `evalValue`,
  `evalQuery`, token-index refresh/build, spatial/query helpers, and residual
  score-row input/batch encoding.
- Profile evidence inherited from `150FITLWASM-020`: command
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm020-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-020-cpu-baseline`;
  artifact `/tmp/ludoforge-150fitlwasm020-profile` was ephemeral; parser method
  was V8 `.cpuprofile` self-time ranking plus parent-stack counting for
  `fnv1a64`; top owners were the query/eval/hash/apply stacks listed above.
  This successor is non-overlapping because `150FITLWASM-020` retained only
  unchanged-placement hash elision and encoded-bytecode-input caching, while
  this ticket owns the remaining deeper query/apply/hash residual.

## Assumption Reassessment (2026-05-04)

1. Production WASM score-row and preview-state routes are active and
   fail-closed-clean; this ticket must preserve those diagnostics.
2. The post-020 residual is no longer a narrow bytecode-input-only problem.
   CPU-profile parent stacks show substantial generic kernel apply/query/hash
   cost outside the WASM score-row encoder.
3. The `<=250 ms` target is unchanged. Ticket `149FITLEVNUMVM-016` remains
   blocked until this or a later successor makes the gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, schemas, branches,
   card names, action names, or hardcoded score behavior.
2. Preserve Foundation 8 determinism. Any cache, query lowering, hash shortcut,
   or preview-apply optimization must be keyed by every semantic input and must
   not depend on ambient process state.
3. Preserve Foundation 11 immutability. Mutable preview/apply/index state must
   remain private and must not alias caller-visible state.
4. Preserve Foundation 14. Unsupported future row/classes fail closed; do not
   add compatibility fallbacks.

## What to Change

### 1. Profile the post-020 residual

Use the same-seam harness and CPU-profile parser to separate:

- token-creation and decision-stack hashing;
- query/eval/reference resolution;
- token-index refresh/build work;
- spatial/query helper work;
- residual score-row bytecode input and batch encoding.

### 2. Reduce the largest same-seam residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- a generic fast path or lowered evaluator for the repeated query/filter shapes
  that dominate production preview application;
- eliminating redundant preview-application work that is already proven by the
  encoded preview-drive route;
- a deterministic bounded hash strategy for token creation or decision-frame
  digest residuals;
- reducing token-index refresh/build work without weakening copy-on-write
  lifetime guarantees;
- further score-row input/batch encoding reduction only if profiling proves it
  remains material after post-020.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after the owned
optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- generic kernel/query/eval helpers if profiling proves they are the residual owner
- generic token/hash/index helpers if profiling proves they are the residual owner
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` or adjacent generic preview-drive helpers if preview application remains the residual owner
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding helpers if encoding remains the residual owner
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if additional counters are needed
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
- `tickets/150FITLWASM-022.md` if the gate remains red and needs the next
  non-overlapping owner
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
2. Focused tests prove any query/eval lowering, preview-apply, hash,
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

1. `pnpm -F @ludoforge/engine-wasm build` if Rust/WASM artifacts are touched.
2. `pnpm -F @ludoforge/engine build`.
3. Focused tests for the changed generic seam.
4. `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`.
5. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-deeper-query-apply-hash-residual-perf`.

## Outcome

2026-05-04 implementation landed a generic initial-state setup hash reduction
while preserving the active WASM score-row and preview-state routes.

- `packages/engine/src/kernel/effect-context.ts` now carries a
  `skipRunningHashUpdates` execution-context flag for scopes that will
  immediately replace `_runningHash` with an authoritative full hash.
- `packages/engine/src/kernel/initial-state.ts` uses that flag for setup
  effects. Setup token creation previously updated the draft `_runningHash`
  through `updateZoneTokenHash`, but `initialState` then discarded that value
  and assigned `computeFullHash(...)` after setup and startup lifecycle work.
- `packages/engine/src/kernel/effects-token.ts` skips token-placement
  incremental hash updates only when that internal setup flag is set. Normal
  move/application scopes retain the existing update path.
- `packages/engine/test/unit/initial-state.test.ts` proves setup token
  creation no longer produces Zobrist cache hits from a discarded incremental
  hash while the final `stateHash` remains equal to `computeFullHash(...)`.

Measured result:

- Baseline after fresh build:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm021-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-021-baseline-cpu`
  — RED, `elapsedMs=2435.25`, per-card `elapsedMs=2435.07`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `zobristKeyCacheMissCount=8208`,
  `zobristKeyCacheHitCount=193840`, `zobristKeyUncachedCount=1391`.
- Post-change same-seam probe:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-021-initial-setup-hash-skip-probe`
  — RED, `elapsedMs=2464.31`, per-card `elapsedMs=2464.14`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `zobristKeyCacheMissCount=3717`,
  `zobristKeyCacheHitCount=188186`, `zobristKeyUncachedCount=1391`.
- Post-change CPU profile:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-150fitlwasm021-post-profile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-021-post-cpu`
  — RED, `elapsedMs=2651.29`, active route clean. Parser evidence still shows
  residual owners in `fnv1a64`/`zobristKey` under full-hash and
  decision-frame hashing, plus `resolveRef`, `evalCondition`, `evalValue`,
  `evalQuery`, `encodePolicyBytecodeInput`, and token-index refresh.

Retained candidate classification:

- `root-cause counter improved`: setup token creation no longer fills the
  run-local Zobrist cache with token-placement keys that are then immediately
  consumed by the final full-hash recompute. The same-seam probe reduced
  `zobristKeyCacheMissCount` from `8208` to `3717`.
- `wall-clock gate still red`: the decisive same-seam probe remained around
  `2.46 s` versus the `<=250 ms` target, so no perf gate test was added and
  `149FITLEVNUMVM-016` remains blocked.

Created successor `tickets/150FITLWASM-022.md` for the next non-overlapping
owner: full-hash/decision-frame and residual query/eval/encoding closure.
Tickets `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` remain blocked until that
or a later successor makes the `<=250 ms` gate truthful.

Schema/artifact fallout: none. The change is an internal execution-context flag
and generic token-hash skip for setup scopes; no serialized schema, ABI, golden,
or compiled GameDef artifact changed.

Oversize file ledger:

- `packages/engine/src/kernel/effects-token.ts` is preexisting oversize
  (`1182` lines after this change). Active growth was a small guard around the
  existing `createToken` hash update, not a new separable token-effect
  subsystem. Extraction considered: not proportionate in this perf slice
  because the change is a two-branch local condition tied to the existing
  mutation path. Deferral rationale: splitting token effects would widen the
  ticket and obscure the measured root-counter reduction. Successor:
  `tickets/150FITLWASM-022.md` only needs to revisit this file if profiling
  proves token-effect hashing remains the residual owner.

Final proof:

- `pnpm -F @ludoforge/engine build` — PASS.
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/initial-state.test.js` — PASS.
- `pnpm run check:ticket-deps` — PASS after creating `tickets/150FITLWASM-022.md` and repointing dependent tickets.
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js` — PASS.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-021-final` — RED as expected under this ticket's red measured-gate successor contract: `elapsedMs=2468.28`, per-card `elapsedMs=2468.08`, `wasmScoreRowUnsupportedCount=0`, `wasmPreviewCandidateFeatureRowUnsupportedCount=0`, `zobristKeyCacheMissCount=3717`, `zobristKeyCacheHitCount=188186`, `zobristKeyUncachedCount=1391`.
- Post-proof edits after this final run were transcription/dependency-closeout only: they recorded the just-run metrics and successor ownership without changing code, command semantics, thresholds, scope, or acceptance boundaries, so the final profile was not invalidated.
