# 149FITLEVNUMVM-006: Wire encoded state into policy-runtime hot read paths

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-runtime.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`
**Deps**: `archive/tickets/149FITLEVNUMVM-004.md`, `archive/tickets/149FITLEVNUMVM-005.md`

## Problem

Phase 1's measurable gain comes from routing hot read paths (`evalCondition`, `resolveRef`, feature extraction) through the encoded view rather than walking `GameState` objects. This ticket adds an optional `EncodedState` parameter to the policy-runtime providers and routes reads through it when present. The closure-tree evaluator (Spec 147 AOT artifact) remains the dispatch mechanism — only the read paths it consults are switched.

## Assumption Reassessment (2026-04-28)

1. `policy-runtime.ts` exports `createPolicyRuntimeProviders` (consumed by `policy-evaluation-core.ts:33` per the import). One source consumer + 8 test consumers (verified during spec 149 reassessment blast-radius check).
2. `evaluatePolicyMove` (the function telemetered as `agent:evaluatePolicyExpression`) lives in `policy-eval.ts:804` and dispatches through `evaluatePolicyMoveCore:384`. The hot `resolveRef` / `evalCondition` paths are reached via the closure-tree built by `buildPolicyExprClosure` in `compiled-policy-runtime.ts`.
3. The closure-tree dispatch mechanism stays unchanged at this ticket's scope — only the leaf operations (ref resolution, condition evaluation) are routed through the encoded view. Phase 4 (ticket 016) will replace the closure-tree itself with the bytecode VM.

## Architecture Check

1. Encoded view is consulted optionally — when not provided, current code paths still work. This permits Phase 1 measurement without breaking Phase 2/3 integration. F14 cleanup happens at ticket 016 (default-flip).
2. Encoded view is read-only at this ticket's scope. F11 preserved.
3. No game-specific branches; the routing is generic.
4. The closure-tree dispatch is preserved exactly — only leaf reads change. Spec 147's contract is intact.

## What to Change

### 1. `packages/engine/src/agents/policy-runtime.ts`

Extend `PolicyRuntimeProviders` interface (or `createPolicyRuntimeProviders` signature) to accept an optional `EncodedState` and `EncodedStateLayout`. When present, route the hot read functions (the ones currently consulting `state.zones`, token occurrences, `state.markers`, etc. via object walks) through encoded-view lookups.

Specifically:
- `resolveRef`-style providers (zone props, token aggregates, marker counts, global vars) — replace object walks with encoded-view index lookups.
- `evalCondition`-style providers — same.

Maintain the existing function signatures; the caller-visible behavior is unchanged. Only the internal data source switches when the encoded view is present.

### 2. `packages/engine/src/agents/policy-evaluation-core.ts`

Thread the optional `EncodedState` parameter through `PolicyEvaluationContext` so the providers receive it. Build the encoded view once per `evaluatePolicyMove` call (using ticket 005's `buildEncodedState`) and reuse across all candidates within that call.

### 3. Profiling smoke gate

After this ticket lands, run a one-card FITL profile:
```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase1-smoke
```
Record the `elapsedMs` and `agent:evaluatePolicyExpression` ms in this ticket's Outcome. Spec acceptance: `≤ 5500 ms` (≥15% gain from baseline `~6500 ms`).

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)

## Out of Scope

- Apply/undo machinery (ticket 008).
- Wiring into `policy-preview.ts` clone path (ticket 009).
- Bytecode VM A/B integration (ticket 015).
- Closure-tree deletion (ticket 016).
- The new perf gate test file (ticket 007).

## Acceptance Criteria

### Tests That Must Pass

1. All existing `policy-runtime.test.ts` and `policy-runtime-annotation.test.ts` continue to pass.
2. Replay-identity tests on all 10 determinism shards stay green: same trajectories, same canonical hashes.
3. FITL parity tests (`zobrist-incremental-parity-fitl-seed-{42,123}`) pass within Phase 0's bumped CI budget.
4. Score-equivalence: `evaluatePolicyMove` returns identical scores with and without the encoded view (property test on a corpus of seeded states).
5. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. No change to closure-tree dispatch — Spec 147's contract is preserved.
2. No mutation through the encoded view at this ticket's scope.
3. F1, F4, F8, F11 preserved.
4. No game-specific branches introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-runtime-encoded.test.ts` (new) — score equivalence with vs. without encoded view.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-runtime-encoded.test.js`.
3. `cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js`.
4. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase1-smoke` (record elapsed ms in Outcome).
5. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.
