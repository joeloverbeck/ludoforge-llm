# 150FITLWASM-007: Production WASM score-row integration and perf gate closure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — production policy evaluation WASM score-row routing, runtime initialization/lifetime, perf gate closure
**Deps**: `archive/specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-006.md`

## Problem

Ticket `150FITLWASM-006` proved full FITL baseline score-row parity for the
generic WASM score-row ABI, including preview-materialized candidate-feature
rows. The same-seam Spec 150 Phase 4 preflight is still red:

- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-score-preflight`
- RED: per-card `elapsedMs=6539.22` versus the `<=250 ms` target.
- `agent:evaluatePolicyExpression=3773.5 ms`, showing the production preview
  evaluation path still spends its time in the TypeScript expression path rather
  than a production score-row WASM route.

Ticket `149FITLEVNUMVM-016` must remain blocked until the production policy
evaluation path can use the proven WASM score-row result and the same-seam gate
is green.

## Assumption Reassessment (2026-05-03)

1. Ticket `150FITLWASM-006` proved generic WASM score-row parity for the current
   FITL baseline corpus, including preview-materialized candidate-feature rows.
   The remaining blocker is not score-row correctness.
2. The live production preview-drive path still evaluates policy expressions
   through the TypeScript route. The ticket 006 preflight remained red at
   `6539.22 ms` per card with `agent:evaluatePolicyExpression=3773.5 ms`.
3. Ticket `149FITLEVNUMVM-016` is still the later F14 default-flip/deletion
   owner. This ticket owns only the production WASM score-row routing and the
   same-seam perf gate needed before that cut can execute.

## Architecture Check

1. Keep the engine generic. Production routing must use generic compiled policy
   artifacts, encoded state, candidate rows, and materialized preview rows. No
   FITL-specific ids, card/action branches, schemas, or score shortcuts.
2. Respect the synchronous policy evaluation contract. If WASM loading requires
   a preload/cache boundary, make that boundary explicit and deterministic
   rather than adding hidden async behavior to the hot path.
3. Preserve fail-closed behavior. Unsupported batches must reject the WASM route
   before scoring; do not merge TypeScript fallback scores into a WASM result.
4. Do not default-flip or delete closure-tree infrastructure here. Ticket
   `149FITLEVNUMVM-016` owns that only after this gate is green.

## What to Change

### 1. Production runtime initialization

Design and implement the production WASM runtime lifetime needed by the policy
evaluation path. The route must be deterministic, bounded, and explicit about
whether the WASM module is preloaded, cached, or disabled for unsupported
environments.

### 2. Score-row routing

Wire the policy-driving evaluation path to use the ticket 006 WASM score-row
result for supported full-profile move-consideration batches. Materialize root
and preview precomputed rows through the same TypeScript semantics used by the
parity witness, then hand only scalar row buffers to WASM.

### 3. Fail-closed diagnostics

If any production batch cannot use the WASM route, report the unsupported row
class, candidate count, and profile/consideration owner. Do not silently fall
back inside the WASM score result.

### 4. Perf gate closure

Run the Spec 150 Phase 4 same-seam command. If it is green at `<=250 ms`, update
ticket `149FITLEVNUMVM-016` as unblocked. If it remains red after production
WASM score routing is verified active, record exact metrics and create the next
non-overlapping owner.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` or nearby production evaluation orchestration (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` or nearby row materialization helpers (modify)
- `packages/engine/src/agents/policy-wasm-score-routing.ts` (new production score-row routing helper)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify if production routing needs a narrow API)
- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` or nearby production-routing witness (modify)
- `packages/engine/test/unit/agents/policy-wasm-runtime.test.ts` or nearby unit witness (modify if API changes)
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` (modify because the gate moved)
- `tickets/150FITLWASM-008.md` (new residual owner after the active route stayed red)
- this ticket (modify Outcome before archival)

## Out of Scope

- Default-flipping policy evaluation or deleting closure-tree infrastructure.
- Weakening the original Spec 149 `<=250 ms` target.
- Adding FITL-specific opcodes, ids, schemas, or bridge branches.
- Moving preview application/replay identity into WASM unless live evidence
  proves that is the non-overlapping next owner after score routing is active.

## Acceptance Criteria

### Tests That Must Pass

1. Production policy evaluation has a focused witness proving the WASM score-row
   route is used for a supported full-profile FITL baseline batch.
2. Unsupported production batches fail closed with deterministic diagnostics and
   do not merge TypeScript fallback scores into the WASM result path.
3. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
4. Existing suite: `pnpm -F @ludoforge/engine build`.
5. Focused engine proof for production score-row routing.
6. Same-seam perf gate command records `<=250 ms`, or records exact red metrics
   after proving the production WASM route is active and creates the next owner.

### Invariants

1. No JSON, host object graph walking, or FITL-specific ids on the hot FFI path.
2. WASM route activation is explicit and deterministic.
3. Integer-only deterministic semantics remain aligned across closure-tree,
   TypeScript bytecode VM, and Rust/WASM score rows.

## Test Plan

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. Focused production routing test command.
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-production-score-routing`.

## Outcome

Completed on 2026-05-03. Implemented explicit production WASM score-row routing
for preloaded policy WASM runtimes. The bridge now has a synchronous
initialization path for the policy evaluation hot path, and the profile harness
preloads the WASM runtime before running the FITL preview drive. Production
policy evaluation now batches full move-consideration score rows through the
preloaded WASM runtime when encoded state is available.

The route fails closed when the preloaded WASM runtime rejects a batch. The
diagnostic records route, profile, seat, candidate count, consideration count,
and unsupported row class, and it does not merge TypeScript fallback scores into
the WASM score result. Focused unit coverage proves both active routing and the
fail-closed diagnostic path.

Touched-file correction: production routing logic lives in new helper
`packages/engine/src/agents/policy-wasm-score-routing.ts` so the already
oversized `policy-eval.ts` only owns orchestration wiring.

The same-seam perf gate remains red even with production score-row routing
verified active, so `149FITLEVNUMVM-016` remains blocked. Created successor
`tickets/150FITLWASM-008.md` for the next non-overlapping owner: production
preview row materialization and preview-drive runtime handoff before score-row
WASM evaluation.

Final measured gate:

- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-production-score-routing` — RED for the `<=250 ms` gate.
- Overall `elapsedMs=7131.57`.
- Per-card row: `turnCount=0`, `elapsedMs=7131.37`, `decisions=159`, `msPerDecision=44.8514`, `closeReason=turnCountAdvanced`.
- WASM route counters: `wasmScoreRowRouteCount=65`, `wasmScoreRowUnsupportedCount=0`.
- Profile buckets: `simAgentChooseMove=4292.1 ms`, `agent:evaluatePolicyExpression=4289.64 ms`, `simApplyMove=899.29 ms`.
- Token/index counters: `tokenStateIndexBuildCount=2377`, `draftTokenStateIndexDeltaCount=198`, `draftTokenStateIndexAttachCount=834`, `draftTokenStateIndexSnapshotCount=315`, `draftTokenStateIndexCowCopyCount=120`.

Verification:

1. `pnpm -F @ludoforge/engine-wasm build` — passed.
2. `pnpm -F @ludoforge/engine build` — passed.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-runtime-encoded.test.js` — passed, 3 tests.
4. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — passed, 5 passing tests and 1 existing skipped Phase 4 VM-default test.
5. `node --check packages/engine/scripts/profile-fitl-preview-drive.mjs` — passed.
6. `pnpm run check:ticket-deps` — passed for the 150FITLWASM-008 handoff and dependent-ticket rewrites.
