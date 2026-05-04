# 150FITLWASM-034: Post-033 policy/apply, digest, and token-index red-gate closure

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic policy evaluation/apply, decision-stack digest, token-index, token-count, and WASM input residual work
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-033.md`

## Problem

Ticket `150FITLWASM-033` delivered a material retained same-seam pass after
post-review reopened the ticket, but the original `<=250 ms` one-card gate is
still red. The final retained clean solo samples reduced the inherited
`1561.81 ms` baseline to `1355.26 ms` and `1383.35 ms`, with active-route
unsupported counters still at `0` and `wasmScoreRowBytecodeCompileCount=0`.

The final bucketed witness still shows residual work spread across generic
policy evaluation/apply, token-count loops, decision-stack digest, token-index
refresh/build, and WASM input encoding:

- `agent:evaluatePolicyExpression=276.75 ms`
- `simApplyMove=194.24 ms`
- `evalQuery:countMatchingTokens=70.05 ms`
- `zobrist:digestDecisionStackFrame=58.99 ms`
- `tokenStateIndex:refreshCachedEntries=53.06 ms`
- `tokenStateIndex:build=47.28 ms`
- `policyWasmRuntime:encodeBytecodeInput=29.79 ms`
- `zobrist:encodeDecisionStackFrame=23.47 ms`

This ticket owns the next non-overlapping residual pass after `033`. It must
not repeat `033`'s retained profiler buckets, context-independent token-count
cache, schema-order decision-stack frame digest input, token-index
`Object.keys` build-loop cleanup, little-endian WASM input word writes, or
selected-move identity lookup.

## Assumption Reassessment (2026-05-04)

1. The active WASM route remains clean after `033`: score-row and preview-state
   unsupported counters are `0`, bytecode compile count is `0`, and production
   preview-drive batch count is `232`.
2. The same-seam gate remains red by the wrong order of magnitude: best final
   retained sample is `1355.26 ms` versus `<=250 ms`.
3. Further hash/digest changes are identity-sensitive. They must either
   preserve current canonical hash identity or stop for explicit
   reproducibility-boundary approval before retention.

## Architecture Check

1. Keep the implementation generic. No FITL-specific ids, schemas, branches,
   card names, action names, or hardcoded score behavior.
2. Preserve Foundation 8 determinism. Any digest/hash, stable-key, or
   canonicalization reduction must keep deterministic ordering and equality
   semantics explicit.
3. Preserve Foundation 11 immutability. Token-index or cache changes must keep
   mutable scratch scoped to private runtime paths and must not alias
   caller-visible state.
4. Preserve Foundation 14. Unsupported future row/classes must continue to
   fail closed with the existing diagnostic counters.

## What to Change

### 1. Profile the post-033 residual

Start from `150FITLWASM-033`'s final route and separate:

- policy evaluation versus apply-move wall time;
- decision-stack digest input encoding versus FNV digest time;
- token-index refresh versus full build work;
- remaining token-count cache misses and compiled-filter loops;
- WASM bytecode input encoding and allocation/copy residuals.

### 2. Reduce the largest proven non-overlapping residual

Move the largest proven generic residual out of the active route without
repeating `033`'s retained or rejected probes. Plausible directions include:

- reducing policy-evaluation candidate/key/selection overhead after WASM score
  rows have already handled supported move considerations;
- reducing apply-move or microturn-publication work in the private preview
  route while preserving published semantics;
- reducing decision-stack digest cost through byte-for-byte equivalent current
  digest input handling, or stopping for explicit approval if identity would
  change;
- reducing token-index refresh/build churn without threshold-only tuning that
  was already rejected in `032` and `033`;
- reducing remaining WASM input allocation/copy cost without changing the ABI.

### 3. Preserve clean route proof and handoff

If the gate reaches `<=250 ms`, update `149FITLEVNUMVM-016` and
`149FITLEVNUMVM-022` as unblocked. If it remains red after a significant owned
optimization, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` or adjacent generic policy
  helpers if profiling proves policy-evaluation overhead is the owner
- `packages/engine/src/kernel/microturn/*`, apply-move, or preview-drive
  helpers if profiling proves apply/publication overhead is the owner
- `packages/engine/src/kernel/zobrist.ts` or `packages/engine/src/kernel/fnv1a64.ts`
  only for identity-preserving digest/hash work, unless explicit migration
  approval is obtained
- `packages/engine/src/kernel/token-state-index.ts`, token-filter, or
  query-count helpers if profiling proves those remain material
- `packages/engine/src/agents/policy-wasm-runtime.ts` or adjacent encoding
  helpers if profiling proves WASM input work remains material
- focused route/perf witnesses near the changed seam
- this ticket (Outcome before closeout)

## Out of Scope

- Weakening the `<=250 ms` target.
- Repeating `033` retained work or rejected probes without new evidence.
- FITL-specific branches, schemas, ids, cards, actions, or hand-authored score
  shortcuts.
- Changing canonical hash values solely for speed without explicit
  reproducibility-boundary approval.
- Default-flipping the policy runtime or deleting the closure-tree path; that
  remains owned by `149FITLEVNUMVM-016` after the gate is green.

## Acceptance Criteria

### Tests That Must Pass

1. Active route remains fail-closed-clean:
   `wasmScoreRowUnsupportedCount=0` and
   `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
2. Focused tests prove any policy/apply, hash, token-index, WASM encoding,
   token-filter, query/eval, reference-resolution, or cache change preserves
   deterministic semantics and does not call the TypeScript preview driver for
   supported preview-state feature rows.
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
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-034-final`.
