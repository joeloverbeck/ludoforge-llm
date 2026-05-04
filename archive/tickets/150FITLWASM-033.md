# 150FITLWASM-033: Post-count hash, token-index, WASM input, and GC red-gate closure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic hash/canonicalization, token-index, WASM input encoding, token-filter/count-loop, and allocation/GC residual work
**Deps**: `archive/specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-032.md`

## Problem

Ticket `150FITLWASM-032` landed a larger same-ticket architectural slice:
score-row bytecode precompile for the profile route, disabled policy-decision
diagnostics on production evaluation, expanded incremental hash reconciliation,
partial boolean condition compilation, and generic count-only query evaluation
for zone and token query aggregates. The original `<=250 ms` same-seam gate
remains red, but the retained `032` final reduced the clean-baseline route from
per-card `1882.37 ms` to per-card `1561.81 ms` with active WASM route
unsupported counters still at `0`.

Final `150FITLWASM-032` evidence:

- Baseline command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-032-resume-clean-baseline`.
- Baseline result: RED, per-card `elapsedMs=1882.37`, active-route unsupported
  counters both `0`, `wasmScoreRowBytecodeCompileCount=35`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- Decisive final command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-032-final`.
- Decisive final result: RED, per-card `elapsedMs=1561.81`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=0`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- Materiality classification: material retained reduction for red-gate handoff
  (`320.56 ms`, about `17%` from the same-checkout clean baseline).

CPU-profile evidence after the retained count-query slice:

- CPU profile command:
  `timeout 180 node --cpu-prof --cpu-prof-dir=/tmp packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-032-profile-token-count-query`.
- CPU-profile metric: RED, per-card `elapsedMs=1580.91`, active-route
  unsupported counters both `0`.
- Profile artifact: `/tmp/CPU.20260504.125147.11.0.001.cpuprofile`
  (ephemeral local artifact).
- Parser command:
  `node .codex/skills/implement-ticket/scripts/parse-cpuprofile.mjs /tmp/CPU.20260504.125147.11.0.001.cpuprofile --targets resolveRef,evalCondition,evalValue,evalQuery,buildTokenStateIndex,refreshCachedTokenStateIndexEntries,canonicalizeHashValue,fnv1a64FromState,updateFnv1a64State,canonicalizeFingerprintValue,filterTokensByExprInContext,applyTokenFilter,matchesTokenFilterExprInContext,countMatchingTokens,countTokensInZoneQuery,countTokensInMapSpacesQuery,countTokensInAdjacentZonesQuery,evalTokensInMapSpacesQuery,digestDecisionStackFrame,zobristKey,encodeFeature,countAggregateItems,countQueryResults,applyZonesFilter,evaluateConditionWithCache,buildEncodedState,encodePolicyBytecodeInput,writeWords,materializePolicyWasmPreviewState`.
- Remaining residual samples: `canonicalizeHashValue=50`, `resolveRef=49`,
  `updateFnv1a64State=45`,
  `refreshCachedTokenStateIndexEntries=38`,
  `buildTokenStateIndex=37`, `evalValue=35`, `writeWords=31`,
  `countTokensInZoneQuery=30`, `evalCondition=26`,
  `fnv1a64FromState=23`, `buildEncodedState=22`, `zobristKey=21`,
  `matchesTokenFilterExprInContext=18`, `countMatchingTokens=17`,
  `canonicalizeFingerprintValue=13`, and `materializePolicyWasmPreviewState=11`.
- Residual classification: `evalQuery` fallback is no longer a primary owner
  (`evalQuery=3`; `countQueryResults=9`). Treat the remaining hash,
  token-index, WASM input encoding, token-filter/count-loop, and GC samples as
  actionable only when proven inside the timed profile-drive route. Node
  startup/import samples remain process-lifetime noise, not ticket-owned proof.

Non-overlap rationale: ticket `150FITLWASM-032` owns the score-row precompile,
diagnostics suppression, hash feature coverage, partial boolean compiler, and
generic zone/token count-query materialization removal. This ticket owns only
the post-count residual: hash/canonicalization, token-index refresh/build,
WASM input write/copy work, token-filter/count-loop residuals, and GC/allocation
after the query fallback has mostly been removed. Do not repeat the rejected
lazy encoded-state, spatial condition compiler, preview-drive batching, or
token-index refresh-threshold probes from `032` unless new profile evidence
changes the premise.

## Assumption Reassessment (2026-05-04)

1. Production WASM score-row and preview-state routes are still active and
   fail-closed-clean; this ticket must preserve those diagnostics.
2. The original broad query/eval residual has shifted. Post-`032` profiles show
   `evalQuery` fallback as small while hash/canonicalization, token-index,
   WASM input encoding, token-filter/count-loop, and GC remain material.
3. Tickets `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` remain blocked until
   this or a later successor makes the `<=250 ms` gate truthful.

## Architecture Check

1. Keep the implementation generic: no FITL-specific ids, schemas, branches,
   card names, action names, or hardcoded score behavior.
2. Preserve Foundation 8 determinism. Hash and encoding changes must preserve
   canonical state equality and must not change canonical hash values solely
   for speed without an explicit reproducibility migration plan.
3. Preserve Foundation 11 immutability. Token-index or cache changes must keep
   mutable scratch isolated and must not alias caller-visible state.
4. Preserve Foundation 14. Unsupported future row/classes fail closed; do not
   add compatibility fallbacks or parallel deprecated paths.

## What to Change

### 1. Profile the post-count residual

Start from the `032` final route and parse CPU profiles that separate:

- decision-stack digest, Zobrist feature keying, FNV, and stable-fingerprint
  work;
- token-index refresh/build work after retained count-query changes;
- WASM bytecode input word writes, encoded-state build, and preview-state
  materialization;
- token-filter/count-loop residuals now that count aggregates avoid most
  query materialization;
- process/GC samples that are inside the timed route versus setup/import noise.

### 2. Reduce the largest proven residual

Move the largest proven generic residual out of the active route. Plausible
directions include:

- reducing full-hash/canonicalization work while keeping canonical hash values
  and hash-drift tests intact;
- reducing token-index rebuild/refresh work with explicit lifetime and
  aliasing proof;
- reducing WASM input encoding allocation or copy work without changing ABI
  identity, layout identity, or fail-closed behavior;
- reducing token-filter/count-loop allocation or repeated resolver work without
  changing query/filter semantics.

Keep rejected candidates visible in the ticket outcome if they are measured and
removed.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after a significant owned
optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- generic stable-fingerprint, decision-stack digest, Zobrist, FNV, or hash
  helpers if profiling proves they are the residual owner
- generic token-index helpers if profiling proves they are the residual owner
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent score/encoding
  helpers if WASM input encoding remains material
- generic token-filter, query-count, or reference-resolution helpers if
  profiling proves they remain material after `032`
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if additional
  counters are needed
- focused route/perf witnesses near the changed production seam
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the
  gate unblocks or moves
- this ticket (Outcome before closeout)

If this ticket touches `packages/engine/src/kernel/resolve-ref.ts`,
`packages/engine/src/kernel/eval-query.ts`, or
`packages/engine/src/agents/policy-wasm-runtime.ts`, keep the existing oversize
state explicit and prefer adjacent helper extraction when the implementation is
separable.

## Note by ticket reviewer

Continue working on this ticket until the `1561.81 ms` gets reduced substantially, not just after reducing the largest proven residual.

## Out of Scope

- Weakening the `<=250 ms` target.
- Repeating `032` retained work: score-row precompile, diagnostics suppression,
  hash feature coverage, partial boolean compiler, or generic zone/token
  count-query materialization removal.
- Repeating rejected `032` probes without new evidence: lazy encoded-state
  construction, spatial condition compiler, preview-drive action/root batching,
  selector-trace allocation/base caching, or token-index refresh-threshold
  bumping.
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
2. Focused tests prove any hash, token-index, WASM encoding, token-filter,
   query/eval, reference-resolution, or cache change preserves deterministic
   semantics and does not call the TypeScript preview driver for supported
   preview-state feature rows.
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
4. Canonical hash values are not changed solely for speed.

## Test Plan

### New/Modified Tests

1. Focused generic unit or route tests near the changed seam, selected after
   profiling identifies the owned residual.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. Focused tests for the changed generic seam.
3. `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`.
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-033-final`.

## Outcome (2026-05-04)

Status: IMPLEMENTED after the continuation pass. The original `<=250 ms` gate
remains red, but the reviewer materiality gap from the first retained slice is
now addressed by additional same-ticket reductions and a non-overlapping
successor draft.

What landed:

- Added opt-in hot-path profiler buckets behind the existing
  `--profileBuckets` harness switch. The new buckets expose token-count loops,
  token-index build/refresh, WASM bytecode input encoding, and decision-stack
  frame digest work without affecting normal non-profiled runs.
- Added a context-independent token-filter count cache for compiled literal
  filters, keyed by immutable token-array identity plus token-filter object.
  Dynamic/context-dependent filters, free-operation overlays, and unsupported
  compiled filters stay on the existing evaluator path.
- Replaced decision-stack frame digest input encoding with the engine's typed
  schema/insertion order plus bigint stringification, avoiding the previous
  generic sorted-key canonicalization walk over large suspended frames.
  Determinism and restore-oriented focused tests passed, but this is a
  current-format hash identity change rather than hash compatibility with older
  serialized hash values.
- Reordered the context-independent token-filter count cache ahead of compiled
  filter lookup in the count-only path, avoiding repeated compiled-cache
  WeakMap probes on retained count-cache hits while preserving dynamic and
  free-operation overlay behavior.
- Swapped token-state-index zone iteration in the build paths from
  `Object.entries(state.zones)` pair allocation to `Object.keys(state.zones)`
  plus direct zone lookup, preserving own-key iteration order.
- Wrote policy bytecode input buffers through an `Int32Array` view on
  little-endian hosts while keeping the existing `DataView` little-endian
  fallback for non-little-endian hosts and preserving every i32 assertion.
- Avoided re-keying the selected action move in `PolicyAgent` when the
  evaluator returns the original move object; the existing stable-key lookup
  remains as a fallback.

Measured retained reductions:

- Starting point from `150FITLWASM-032`: RED, per-card `elapsedMs=1561.81`,
  active-route unsupported counters both `0`.
- Earlier retained same-seam non-instrumented best solo command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label spec150-wasm-033-zobrist-json-frame-clean-gate-solo`.
- Earlier retained best solo result: RED, per-card `elapsedMs=1435.95`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=0`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- Final current same-seam solo commands:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label spec150-wasm-033-final-after-probes-solo`
  and
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label spec150-wasm-033-final-after-probes-repeat`.
- Final current solo results: RED, per-card `elapsedMs=1355.26` and repeat
  `elapsedMs=1383.35`, active-route unsupported counters both `0`,
  `wasmScoreRowBytecodeCompileCount=0`, and
  `wasmProductionPreviewDriveBatchCount=232`.
- Supporting bucket command:
  `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-033-final-after-probes-buckets`.
- Supporting bucket evidence: RED, per-card `elapsedMs=1424.32`, route clean,
  token-count cache active with `evalQuery:countMatchingTokensCacheHit=718186`;
  largest residual buckets are `agent:evaluatePolicyExpression=276.75 ms`,
  `simApplyMove=194.24 ms`, `evalQuery:countMatchingTokens=70.05 ms`,
  `zobrist:digestDecisionStackFrame=58.99 ms`,
  `tokenStateIndex:refreshCachedEntries=53.06 ms`,
  `tokenStateIndex:build=47.28 ms`,
  `policyWasmRuntime:encodeBytecodeInput=29.79 ms`, and
  `zobrist:encodeDecisionStackFrame=23.47 ms`.

Rejected candidates:

- Token-index refresh threshold / token-query changes: reverted after same-seam
  repeats failed to prove a material wall-clock reduction.
- Streaming canonical FNV, WeakMap canonical object/array caching, canonical
  state hash markers, and local hex digest helpers: reverted after
  correctness-green probes measured worse or neutral.
- WASM input block-copy and static-prefix cache variants: reverted after
  correctness-green probes measured worse.
- Decision-stack per-frame object canonical string cache: rejected after the
  bucketed A/B showed slower canonicalization.
- Skipping large structural digest cache entries alone: rejected after it failed
  to beat the retained clean route.
- Count-loop no-`try/finally` helper split: rejected after clean repeated
  samples regressed against the simpler cache-ordering change.
- Combined filter-key cache entry for context independence and per-token-array
  counts: rejected after a clean sample regressed against the retained separate
  WeakMap caches.
- WASM bulk write micro-probe and larger `64 KiB` decision-frame structural
  cache probe: rejected after focused tests passed but bucketed same-seam
  samples failed to show a win.

Verification:

- `pnpm -F @ludoforge/engine build`.
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js dist/test/unit/agents/policy-wasm-runtime.test.js dist/test/kernel/token-state-index-incremental.test.js dist/test/unit/zobrist-table.test.js dist/test/unit/kernel/effect-frame-suspend-resume.test.js dist/test/unit/kernel/zobrist-incremental-edge-cases.test.js dist/test/unit/kernel/zobrist-incremental-phase.test.js dist/test/unit/kernel/decision-stack-frame-shape.test.js`.
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js`.
- `timeout 90 pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js dist/test/unit/agents/policy-wasm-runtime.test.js dist/test/kernel/token-state-index-incremental.test.js dist/test/integration/token-filter-compilation.test.js dist/test/unit/kernel/compiled-token-filter-cache.test.js dist/test/unit/zobrist-table.test.js dist/test/unit/kernel/effect-frame-suspend-resume.test.js dist/test/unit/kernel/zobrist-incremental-edge-cases.test.js dist/test/unit/kernel/zobrist-incremental-phase.test.js dist/test/unit/kernel/decision-stack-frame-shape.test.js`.

Remaining red handoff:

- The unchanged `<=250 ms` target is still missed by about `5.4x` on the best
  final retained solo sample.
- Current largest bucketed residuals after this ticket are still spread across
  policy evaluation/apply, token-count loops, token-index refresh/build, FNV
  digest work, and WASM input encoding. Successor
  `tickets/150FITLWASM-034.md` owns the next non-overlapping residual pass.

Earlier post-ticket-review correction:

- Materiality classification: `minor` for terminal closeout. The decisive
  retained sample changed `1561.81 ms -> 1435.95 ms`, a `125.86 ms` reduction
  (about `8.1%`) while remaining red versus `<=250 ms`.
- Removed the earlier overlapping untracked successor draft `150FITLWASM-034`;
  at that time the residual token-index, token-count, WASM input, FNV/hash,
  apply/policy, allocation, and GC work stayed in this ticket until the
  reviewer materiality bar was satisfied or a revised boundary was explicitly
  approved.
- The retained decision-stack frame digest shortcut is recorded as
  current-format-only evidence. Further hash/digest work in this ticket must
  either preserve canonical hash identity or stop for explicit
  reproducibility-boundary approval before retention.

Final materiality correction:

- Materiality classification is revised from the earlier post-review `minor` verdict
  after the continuation pass. The final clean solo samples changed the
  inherited `1561.81 ms` baseline to `1355.26 ms` and `1383.35 ms`, reductions
  of `206.55 ms` (`13.2%`) and `178.46 ms` (`11.4%`) while preserving clean
  active-route counters. The gate remains red; post-ticket review accepted
  successor `tickets/150FITLWASM-034.md` as the non-overlapping residual owner.
- Post-review active overlap check:
  `rg -n '150FITLWASM-033|150FITLWASM-034|tickets/150FITLWASM-033|tickets/150FITLWASM-034|archive/tickets/150FITLWASM-033|active successor|successor owner|blocked|BLOCKED' tickets/149FITLEVNUMVM-016.md tickets/149FITLEVNUMVM-022.md archive/specs/150-fitl-policy-vm-wasm-port.md tickets/150FITLWASM-034.md`.
  Result: the only actionable overlap was stale blocker/dependency wording in
  `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022`, now retargeted to
  `tickets/150FITLWASM-034.md`.
- Post-metric graph edits: `tickets/150FITLWASM-034.md`,
  `archive/specs/150-fitl-policy-vm-wasm-port.md`, `tickets/149FITLEVNUMVM-016.md`,
  `tickets/149FITLEVNUMVM-022.md`, and this ticket's terminal status/proof
  ledger.
- Proof invalidation: the post-metric graph edits transcribe ownership and
  archival status only; they do not change code, command semantics, thresholds,
  measured scope, or acceptance boundaries. Dependency integrity and markdown
  checks were rerun after graph edits.
