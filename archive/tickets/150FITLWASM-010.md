# 150FITLWASM-010: Preview-drive application WASM/runtime handoff

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — preview-drive runtime/application hot path, WASM/buffer ABI, perf gate
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-009.md`, `archive/tickets/150FITLWASM-011.md`, `archive/tickets/150FITLWASM-012.md`, `archive/tickets/150FITLWASM-013.md`, `archive/tickets/150FITLWASM-014.md`

## Problem

Ticket `150FITLWASM-009` moved supported preview-state candidate-feature row
evaluation into the production WASM score-row route and proved the same-seam
profile is still red:

- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-state-surface-materialization`
- RED: per-card `elapsedMs=6632.26` versus the `<=250 ms` target.
- Active route counters: `wasmScoreRowRouteCount=65`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowRouteCount=77`, and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Remaining buckets include `agent:evaluatePolicyExpression=3935.23 ms` and
  `simApplyMove=866.3 ms`.

The remaining non-overlapping owner is no longer scalar score-row evaluation or
preview candidate-feature expression materialization. The production hot path
still applies preview moves and drives bounded preview completions through the
TypeScript kernel/runtime before WASM can consume scalar preview rows.

Ticket `149FITLEVNUMVM-016` must remain blocked until this preview-drive
handoff or a later non-overlapping owner makes the same-seam gate truthful.

## Foundation-Aligned Boundary Reset

Reassessment on 2026-05-03 confirmed that this ticket cannot truthfully close
on counters, precomputed preview outcome buffers, or another wrapper around the
current TypeScript preview drive. At the time of that reset, the live WASM
crate evaluated policy bytecode/score-row buffers but did not yet own generic
encoded action/effect application, decision publication, bounded completion
drive, rollback/recovery, or preview outcome buffer production. Ticket
`150FITLWASM-013` has since landed an encoded preview-state slot inventory
substrate. Live reassessment on 2026-05-03 found that this is still not the
generic production preview-drive substrate needed for this routing ticket, so
prerequisite `archive/tickets/150FITLWASM-014.md` owned that missing substrate. That
prerequisite is now implemented.

Per Foundations #1, #5, #8, #10, #11, #15, and #16, the preview-drive handoff
must be generic, deterministic, bounded, externally immutable, and proven
equivalent before production routing can claim that supported preview
application/drive batches use WASM. Ticket `archive/tickets/150FITLWASM-011.md`
delivered the first generic encoded preview-drive substrate and synthetic
greedy-subset parity. Ticket `archive/tickets/150FITLWASM-012.md` expanded that encoded
preview-drive ABI to the current FITL same-seam inventory classes, but live
reassessment on 2026-05-03 proved that this was still inventory-level replay
support rather than a production replacement for TypeScript preview-state
materialization. Ticket `archive/tickets/150FITLWASM-013.md` completed an
encoded preview-state slot inventory substrate, but not the production
application/publication substrate. Ticket `archive/tickets/150FITLWASM-014.md` has now
implemented that prerequisite. This ticket is again the production routing,
fail-closed diagnostics, and same-seam perf-gate owner.

## Assumption Reassessment (2026-05-03)

1. The live `150FITLWASM-012` ABI supports scalar `applyCandidateDeltas`,
   greedy completion steps, stochastic exits, depth caps, and unsupported
   diagnostics.
2. The production policy preview route still applies candidate moves, publishes
   decision-stack microturns, drives bounded completion, canonicalizes
   `GameState`, and materializes preview surfaces through TypeScript.
3. The profiling inventory's current `supportedByEncodedPreviewDriveAbi=true`
   rows validate encoded batch shape after TypeScript captures exist; they do
   not by themselves produce preview states or remove TypeScript object-graph
   traversal from the production hot path.
4. User-confirmed boundary reset on 2026-05-03 selected prerequisite owner
   `archive/tickets/150FITLWASM-014.md`, because the completed
   `archive/tickets/150FITLWASM-013.md` slot substrate still did not replace
   TypeScript production application/publication/materialization. That
   prerequisite is now implemented.

## Architecture Check

1. Keep the engine generic. Any new ABI must consume generic compiled
   artifacts, encoded state/action buffers, preview outcome buffers, and
   generic effect/query programs. No FITL-specific ids, branches, schemas, or
   shortcuts.
2. Preserve the one-rules protocol. Legal action publication remains
   kernel-owned unless this ticket proves an equivalent generic WASM seam for
   the exact same executable decision frontier.
3. Preserve deterministic preview semantics: outcome, failure, gated,
   depth-cap, replay identity, and hidden-sampling behavior must match the
   current TypeScript path.
4. Preserve fail-closed behavior. Unsupported preview-drive classes must reject
   before scoring and report the unsupported class, candidate count, profile
   owner, and feature/drive owner.

## What to Change

### 1. Preview-drive ownership

With `archive/tickets/150FITLWASM-014.md` landed, wire the smallest generic handoff
that removes the remaining TypeScript preview application/drive hot path for
the supported live baseline surface. The handoff must preserve the current
preview outcome semantics and must not count a TypeScript-materialized preview
result as WASM-supported production routing.

### 2. Production routing and diagnostics

Wire production policy evaluation so supported preview-drive batches use the new
route before preview-state row materialization and score-row evaluation.
Unsupported drive batches must fail closed with deterministic diagnostics and
must not merge TypeScript fallback preview rows into a WASM result path.

### 3. Measurement and handoff

Run the same-seam profile after the handoff. If the gate reaches `<=250 ms`,
update `149FITLEVNUMVM-016` and `149FITLEVNUMVM-022` as unblocked. If it
remains red, record exact metrics and create the next non-overlapping owner.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` or nearby preview-drive helpers
- `packages/engine/src/agents/policy-eval.ts` or nearby production evaluation orchestration
- `packages/engine/src/agents/policy-wasm-production-preview-feature-slots.ts` or adjacent route helpers
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` or adjacent route helpers
- `packages/engine/src/agents/policy-wasm-runtime.ts` if the ABI/API needs new buffers
- `packages/engine-wasm/policy-vm/src/lib.rs` if Rust/WASM owns the new route
- focused unit/integration witnesses near the changed production and WASM seams
- a follow-up ticket or spec amendment if production routing proves a residual substrate gap
- `tickets/149FITLEVNUMVM-016.md` and `tickets/149FITLEVNUMVM-022.md` if the gate unblocks or moves
- this ticket (modify Outcome before closeout)

## Out of Scope

- Default-flipping policy evaluation or deleting closure-tree infrastructure.
- Weakening the original Spec 149 `<=250 ms` target.
- Adding FITL-specific opcodes, ids, schemas, or bridge branches.
- Reworking score-row or preview candidate-feature materialization already
  proved active by ticket `150FITLWASM-009`, except where the new preview-drive
  route requires a compatible buffer shape.

## Acceptance Criteria

### Tests That Must Pass

1. Production policy evaluation has a focused witness proving supported preview
   drive/application batches use the new generic route.
2. Unsupported preview-drive batches fail closed with deterministic diagnostics
   and do not merge TypeScript fallback preview rows into a WASM result path.
3. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
4. Existing suite: `pnpm -F @ludoforge/engine build`.
5. Focused engine proof for the production preview-drive handoff.
6. Same-seam perf gate command records `<=250 ms`, or records exact red metrics
   after proving the preview-drive handoff is active and creates the next owner.

### Invariants

1. No JSON, host object graph walking, or FITL-specific ids on the hot FFI path.
2. Preview-drive route activation is explicit, deterministic, and fail-closed.
3. Integer-only deterministic semantics remain aligned across TypeScript kernel
   preview application, any new compiled/WASM route, preview-state row
   materialization, and Rust/WASM score rows.

## Test Plan

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. Focused production preview-drive handoff test command.
4. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-drive-application`.

## Outcome

Boundary reset on 2026-05-03 after live reassessment and user confirmation of
the Foundation-aligned split. No runtime code was changed under this ticket.

Current fresh same-seam baseline after rebuilding engine and engine-wasm:

- `pnpm -F @ludoforge/engine-wasm build` — passed.
- `pnpm -F @ludoforge/engine build` — passed.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-010-current-baseline` — RED for the `<=250 ms` gate.
- Overall `elapsedMs=6683.62`.
- Per-card row: `turnCount=0`, `elapsedMs=6683.38`, `decisions=159`,
  `msPerDecision=42.0339`, `closeReason=turnCountAdvanced`.
- Active route counters: `wasmScoreRowRouteCount=65`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=47`,
  `wasmPreviewCandidateFeatureRowRouteCount=77`, and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Remaining buckets: `simAgentChooseMove=3980.74 ms`,
  `agent:evaluatePolicyExpression=3978.47 ms`, and
  `simApplyMove=854.89 ms`.

Outcome amended: 2026-05-03.

Ticket `150FITLWASM-011` delivered the first generic encoded preview-drive ABI
substrate and supported synthetic greedy-subset parity. Its FITL same-seam
inventory still reports `driveExitTotal=211`, with `initialMoveApplication` and
`decisionStackPublication` both `supportedByEncodedPreviewDriveAbi=false`,
`failClosedClass=unsupported-effect`, `count=211`.

Decision at that time: this ticket was blocked until
`archive/tickets/150FITLWASM-012.md` expanded the generic encoded preview-drive
substrate to the current FITL same-seam classes or recorded a narrower residual
owner. Closing this ticket on precomputed preview rows, counters,
TypeScript-only optimization, or the synthetic subset from `150FITLWASM-011`
would have misstated the production handoff and violated the
Foundations-aligned one-rules protocol and testing-as-proof requirements.

Outcome amended: 2026-05-03.

Ticket `150FITLWASM-012` completed the FITL-current generic class expansion.
Its final live encoded inventory reports `driveExitTotal=211`, with
`initialMoveApplication`, `decisionStackPublication`, and `completionExits` all
`supportedByEncodedPreviewDriveAbi=true`; then-successor owner
`tickets/150FITLWASM-010.md`. This ticket is no longer blocked by the 012
inventory prerequisite, but the 2026-05-03 reassessment below split out a new
generic preview-state substrate prerequisite before production routing could
truthfully resume here.

Outcome amended: 2026-05-03.

User-confirmed boundary reset selected a new prerequisite split before
production routing:

- Live reassessment found that `150FITLWASM-012` proves encoded
  preview-drive inventory replay, not production replacement of TypeScript
  preview-state materialization.
- The live production path in `packages/engine/src/agents/policy-preview.ts`
  still applies candidate moves, publishes decision-stack microturns, drives
  bounded completion, canonicalizes `GameState`, and materializes preview
  surfaces before WASM score rows consume scalar values.
- New prerequisite `archive/tickets/150FITLWASM-013.md` owned encoded
  preview-state slot inventory support.
- Later Foundation-aligned reassessment split the remaining generic production
  preview-drive application/publication substrate into
  `archive/tickets/150FITLWASM-014.md`.
- This ticket was blocked until `150FITLWASM-014` completed; it is now the
  production routing, fail-closed diagnostics, and same-seam perf-gate owner.
  No runtime code changed under this boundary reset.

Outcome amended: 2026-05-03.

Ticket `150FITLWASM-013` completed an encoded preview-state slot inventory
substrate. Its final FITL same-seam inventory reports `driveExitTotal=211`,
with `initialMoveApplication`, `decisionStackPublication`, and
`completionExits` all `supportedByEncodedPreviewDriveAbi=true` and
`previewStateSubstrateSupported=true`.

Reassessment later on 2026-05-03 found that this support is still not the
production application/publication/materialization substrate required before
this ticket can truthfully route supported preview-drive batches through WASM.
The current production route in `packages/engine/src/agents/policy-preview.ts`
still applies candidate moves, publishes microturns, drives bounded
completion, canonicalizes `GameState`, and materializes preview state in
TypeScript. New prerequisite `archive/tickets/150FITLWASM-014.md` owned that generic
production preview-drive substrate and is now implemented. This ticket resumes
as the production routing, fail-closed diagnostics, and same-seam perf-gate
owner. The Spec 149 `<=250 ms` gate is unchanged.

Outcome amended: 2026-05-03.

Prerequisite `150FITLWASM-014` completed the generic production
preview-drive substrate. Its final same-seam FITL inventory command:

`timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-014-choose-n-underfilled`

reported `productionApplicationPublication supportedByEncodedPreviewDriveAbi=true`,
`previewStateSubstrateSupported=true`,
`productionPreviewDriveSubstrateSupported=true`, `wasmScoreRowUnsupportedCount=0`,
and `wasmPreviewCandidateFeatureRowUnsupportedCount=0`. All 40 production
application/publication profile/action buckets were supported.

This ticket is no longer blocked on the substrate prerequisite. Next work here
is to wire production policy evaluation so supported preview-drive batches use
the new generic route before preview-state row materialization and score-row
evaluation, then rerun the same-seam perf gate.

Outcome amended: 2026-05-03.

Implemented the production routing handoff:

- Production WASM score routing now materializes supported preview dynamic rows
  through `evaluateProductionPreviewDriveBatchWithWasm` before TypeScript
  preview-state materialization.
- Gated candidates remain gated, and unsupported preview-drive row classes fail
  closed instead of merging TypeScript fallback rows into a WASM-supported path.
- Added generic slot-backed handling for victory margin/rank preview surfaces
  and supported compiled preview-state feature slots needed by the live FITL
  baseline (`vcFriendlyCapCount`).
- Focused witness tightened
  `packages/engine/test/unit/agents/policy-evaluation-topk-gate.test.ts` so a
  WASM preview-state feature row proves the TypeScript preview `applyMove`
  dependency is not called.

Final proof:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine-wasm build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-evaluation-topk-gate.test.js` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js` — passed.
- Direct same-seam route probe with `fallbackOnError=false` over all four
  baseline agents for one turn — passed; no hidden fallback was needed.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec150-wasm-preview-drive-application` — RED for the `<=250 ms` gate after active routing.

Final same-seam metrics:

- Overall `elapsedMs=4124.29`, `turnsCount=1`, `stopReason=maxTurns`.
- Per-card row: `turnCount=0`, `elapsedMs=4124.12`, `decisions=158`,
  `msPerDecision=26.102`, `closeReason=turnCountAdvanced`.
- Active route counters: `wasmScoreRowRouteCount=62`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmScoreRowBytecodeCompileCount=47`,
  `wasmPreviewCandidateFeatureRowRouteCount=70`, and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Remaining buckets: `simAgentChooseMove=1353.09 ms`,
  `agent:evaluatePolicyExpression=1351.04 ms`, and
  `simApplyMove=867.35 ms`.

This completes the routing/fail-closed slice but does not unblock the Spec 149
F14 cut. Created successor `tickets/150FITLWASM-015.md` for the remaining
active-route perf closure. `tickets/149FITLEVNUMVM-016.md` and
`tickets/149FITLEVNUMVM-022.md` remain blocked on that successor.

Post-review cleanup on 2026-05-03 extracted the new preview-state feature-slot
expression evaluator and production preview-drive type declarations into
adjacent helpers so
`packages/engine/src/agents/policy-wasm-production-preview-drive.ts` remains
under the repo file-size cap at 795 lines. No behavior or proof boundary
changed.

Post-review verification:

- `wc -l packages/engine/src/agents/policy-wasm-production-preview-drive.ts packages/engine/src/agents/policy-wasm-production-preview-feature-slots.ts packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` — main file 795 lines.
- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine-wasm build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-evaluation-topk-gate.test.js` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js` — passed.
