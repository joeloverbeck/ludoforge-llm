# 149FITLEVNUMVM-006: Wire encoded state into policy-runtime hot read paths

**Status**: PARTIAL / BLOCKED by measured gate
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

## Boundary Reset (2026-04-29)

User approved the widened same-ticket boundary after a Foundations-aligned reassessment found the ticket's explicit hot-read deliverable cannot be satisfied by only touching the two agent files. Ticket 005's read-only `EncodedState` view encodes token locations, token-type occupancy, boolean token flags, variables, and marker states, but the live policy aggregate/filter paths also require scalar token property reads:

1. `zoneTokenAgg`, `globalTokenAgg`, and `adjacentTokenAgg` need numeric token props for `sum`/`min`/`max`.
2. `tokenFilter.props` comparisons need scalar token props for filter evaluation.
3. Count-only paths can use occupancy only when there is no prop filter; filtered counts still need scalar token props.

This ticket now owns the generic encoded scalar-token-prop support required by the policy read path:

1. Extend `EncodedStateLayout` / `EncodedState` with deterministic scalar token-property descriptors derived from `GameDef.tokenTypes` and encoded values derived from the current `GameState`. String-valued token props use deterministic view-local dictionaries because `GameDef.tokenTypes` declares string props without enumerating every legal string value.
2. Preserve the existing object-walk path only when no encoded view is supplied. When an encoded view is supplied, the ticket-owned aggregate/filter read paths should use encoded data rather than silently falling back to `GameState` object walks.
3. Keep the closure-tree dispatch intact. This remains Phase 1 read-path wiring, not bytecode VM work.

This is shared-contract fallout from this ticket's explicit deliverable, not sibling scope. Apply/undo, preview clone replacement, bytecode VM integration, and the default-flip cleanup remain out of scope.

## Architecture Check

1. Encoded view is consulted optionally — when not provided, current code paths still work. This permits Phase 1 measurement without breaking Phase 2/3 integration. F14 cleanup happens at ticket 016 (default-flip).
2. Encoded view is read-only at this ticket's scope. F11 preserved.
3. No game-specific branches; the routing is generic.
4. The closure-tree dispatch is preserved exactly — only leaf reads change. Spec 147's contract is intact.

## What to Change

### 1. `packages/engine/src/agents/policy-runtime.ts`

Extend `PolicyRuntimeProviders` interface (or `createPolicyRuntimeProviders` signature) to accept an optional `EncodedState` and `EncodedStateLayout`. When present, route the hot read functions (the ones currently consulting `state.zones`, token occurrences, `state.markers`, token props, etc. via object walks) through encoded-view lookups.

Specifically:
- `resolveRef`-style providers (zone props, token aggregates, marker counts, global vars) — replace object walks with encoded-view index lookups.
- `evalCondition`-style providers — same.
- Token aggregate/filter reads — use encoded scalar token-property values for numeric aggregate props and filter comparisons.

Maintain the existing function signatures; the caller-visible behavior is unchanged. Only the internal data source switches when the encoded view is present.

### 2. `packages/engine/src/agents/policy-evaluation-core.ts`

Thread the optional `EncodedState` parameter through `PolicyEvaluationContext` so the providers receive it. Build the encoded layout/view once per `evaluatePolicyMove` call (using ticket 004's `buildEncodedStateLayout` and ticket 005's `buildEncodedState`) and reuse across all candidates within that call.

### 3. Encoded scalar token props

Update `packages/engine/src/kernel/encoded-state/layout.ts` and `packages/engine/src/kernel/encoded-state/view.ts` so the encoded view contains a deterministic scalar token-property table for declared token props. The table must remain generic and GameDef-derived. It should cover numeric, string, and boolean props well enough for token aggregate/filter evaluation, while existing `tokenFlags` may continue to serve boolean-fast-path use cases.

### 4. Profiling smoke gate

After this ticket lands, run a one-card FITL profile:
```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase1-smoke
```
Record the `elapsedMs` and `agent:evaluatePolicyExpression` ms in this ticket's Outcome. Spec acceptance: `≤ 5500 ms` (≥15% gain from baseline `~6500 ms`).

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/kernel/encoded-state/layout.ts` (modify — scalar token-property descriptors)
- `packages/engine/src/kernel/encoded-state/view.ts` (modify — scalar token-property values)
- `packages/engine/test/helpers/encoded-state-assertions.ts` (modify)
- `packages/engine/test/unit/kernel/encoded-state-view.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-runtime-encoded.test.ts` (new)

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

1. `packages/engine/test/unit/agents/policy-runtime-encoded.test.ts` (new) — score equivalence with vs. without encoded view, including token aggregate/filter expressions.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-runtime-encoded.test.js`.
3. `cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js`.
4. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase1-smoke` (record elapsed ms in Outcome).
5. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.

## Outcome (2026-04-29)

Implementation landed under the user-approved Boundary Reset:

- Added generic scalar token-property descriptors to `EncodedStateLayout` and scalar token-property values to `EncodedState`.
- String-valued token props use deterministic view-local dictionaries derived from the current `GameState`; the dictionaries are not rule-authoritative data.
- Wired `evaluatePolicyMoveCore` to build the encoded layout/view for the root policy-evaluation state, cache the layout per `GameDef`, and pass the encoded view to `PolicyEvaluationContext`.
- Routed root-state token aggregate/filter reads through encoded scalar token props when an encoded view is present.
- Routed encoded-supported current-surface reads for global vars, per-player vars, and global markers through the encoded view.
- Preserved the existing object-walk path only for contexts where no encoded view is supplied, such as preview-derived states and non-root evaluation.
- Added `packages/engine/test/unit/agents/policy-runtime-encoded.test.ts` proving score equivalence between encoded and object-walk policy evaluation for token aggregate/filter reads.
- Extended encoded-state layout/view parity tests for scalar token props.
- Resume check on 2026-04-30 fixed one encoded parity edge: `zoneTokenAgg` with `op: "count"` now preserves the existing object-walk behavior of counting only tokens with the requested numeric prop, and the encoded/object-walk test covers a token missing that prop.

Measured gate status:

- `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase1-smoke` — RED: `elapsedMs=6015.47`, threshold `<=5500`.
- `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase1-smoke-buckets` — RED: `elapsedMs=5986.48`, `agent:evaluatePolicyExpression=3455.01 ms`, threshold `<=5500`.
- After adding per-`GameDef` encoded-layout caching, `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase1-smoke-layout-cache` — RED: `elapsedMs=5999.65`, `agent:evaluatePolicyExpression=3477.36 ms`, threshold `<=5500`.
- Resume check on 2026-04-30, `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase1-resume-check` — RED: `elapsedMs=5925.83`, `agent:evaluatePolicyExpression=3418.81 ms`, threshold `<=5500`.
- Final check on 2026-04-30, `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase1-final-check` — RED: `elapsedMs=6146.47`, `agent:evaluatePolicyExpression=3547.43 ms`, threshold `<=5500`.

Status classification:

- Correctness implementation is landed and focused proof is green.
- The ticket's explicit measured acceptance gate remains red, so this ticket is not archive-ready as `COMPLETED`.
- User approved option 1 on 2026-04-29: keep this ticket as `PARTIAL / BLOCKED by measured gate`, record the red metrics, and create a follow-up owner instead of continuing speculative optimization inside this ticket.
- Follow-up owner: `tickets/149FITLEVNUMVM-017.md`.
- `tickets/149FITLEVNUMVM-007.md` now depends on the follow-up because the 5500 ms perf gate should not be authored while the calibrated budget is known-red.

Final proof before this status update:

- `pnpm -F @ludoforge/engine build` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-runtime-encoded.test.js dist/test/unit/kernel/encoded-state-layout.test.js dist/test/unit/kernel/encoded-state-view.test.js dist/test/integration/encoded-state-roundtrip.test.js` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-runtime.test.js dist/test/unit/agents/policy-runtime-annotation.test.js` — PASS.
- `cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js` — HARNESS-SLOW / unconfirmed: emitted regular heartbeat output past 14 minutes and was terminated; no assertion failure was observed, but the lane is not final-confirmed in this environment.
- `pnpm run check:ticket-deps` — PASS after adding `149FITLEVNUMVM-017` and updating `149FITLEVNUMVM-007` dependencies.
- `pnpm turbo build` — PASS.
- `pnpm turbo lint` — PASS.
- `pnpm turbo typecheck` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-runtime-encoded.test.js` — PASS after the final root build/lint/typecheck sequence.
- `git diff --check` — PASS.

Resume proof on 2026-04-30 after the `zoneTokenAgg count` parity fix:

- `pnpm -F @ludoforge/engine build` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-runtime-encoded.test.js` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-runtime.test.js dist/test/unit/agents/policy-runtime-annotation.test.js` — PASS.
- `pnpm run check:ticket-deps` — PASS.
- `git diff --check` — PASS.
- `pnpm turbo build` — PASS.
- `pnpm turbo lint` — PASS.
- `pnpm turbo typecheck` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-runtime-encoded.test.js` — PASS after the final root build/lint/typecheck sequence.
