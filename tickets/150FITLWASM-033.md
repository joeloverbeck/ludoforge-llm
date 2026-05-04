# 150FITLWASM-033: Post-count hash, token-index, WASM input, and GC red-gate closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic hash/canonicalization, token-index, WASM input encoding, token-filter/count-loop, and allocation/GC residual work
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-032.md`

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
