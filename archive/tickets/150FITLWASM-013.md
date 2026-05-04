# 150FITLWASM-013: Generic encoded preview-state substrate for WASM drive routing

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: XL
**Engine Changes**: Yes — generic preview-drive state/effect/publication substrate, WASM/buffer ABI, parity witnesses
**Deps**: `archive/specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-011.md`, `archive/tickets/150FITLWASM-012.md`

## Problem

Ticket `150FITLWASM-012` expanded the encoded preview-drive ABI enough for the
FITL same-seam inventory to report `initialMoveApplication`,
`decisionStackPublication`, and `completionExits` as supported. Live
reassessment of ticket `150FITLWASM-010` found that support is still an
inventory/proof shape, not a production replacement for the TypeScript preview
drive.

The current production preview route still calls the TypeScript kernel/runtime
to:

- apply the initial candidate move;
- publish and drive bounded inner microturns;
- produce the preview `GameState` consumed by preview surfaces,
  preview-state features, granted operations, and metadata;
- preserve rollback/recovery, hidden-sampling, stochastic, depth-cap, and
  fail-closed semantics.

The live WASM preview-drive ABI consumes already-authored scalar steps and
returns outcome/depth/value rows. It does not yet own a generic encoded
effect/application/publication substrate that can replace TypeScript
`GameState` preview materialization on the production hot path.

Ticket `150FITLWASM-010` remains the later production routing and same-seam
perf-gate owner, but it is blocked until this ticket delivers a truthful
generic substrate or records a narrower residual owner.

## Assumption Reassessment (2026-05-03)

1. `archive/tickets/150FITLWASM-012.md` is complete and its inventory command
   proves the current FITL preview-drive classes are representable through the
   encoded ABI at the inventory level.
2. The inventory witness calls `evaluatePreviewDriveBatch` after TypeScript has
   captured production preview-drive results. It validates encoded batch shape
   and outcome/depth replay, but it does not produce preview states or replace
   production TypeScript application/publication.
3. `packages/engine/src/agents/policy-preview.ts` still owns production
   candidate move application, publication, bounded completion drive,
   canonicalization, preview-state materialization, and preview metadata.
4. The corrected owner at that time was an encoded preview-state slot
   substrate before production routing. Later reassessment split the remaining
   generic production application/publication substrate into
   `tickets/150FITLWASM-014.md`.

## Architecture Check

1. The new substrate must stay generic: no FITL-specific action ids, card ids,
   zone ids, schemas, or branch logic in TypeScript bridge code or Rust/WASM.
2. The one-rules protocol must remain coherent. Any WASM-produced preview
   result must be equivalent to the kernel-owned publication/application
   contract for the supported subset, and unsupported classes must fail closed
   before scoring.
3. Determinism and immutability remain mandatory. WASM buffers may use private
   mutable state internally, but caller-visible `GameState` and canonical
   replay identity must match the TypeScript reference.
4. This ticket may introduce a staged encoded preview-state artifact, but it
   must not add a compatibility alias or a TypeScript fallback inside a route
   claimed as WASM-supported.

## What to Change

### 1. Generic encoded application/publication substrate

Design and implement the smallest generic encoded substrate that can reproduce
the production preview-drive state transition classes currently handled by
TypeScript. The substrate must cover candidate initial application and bounded
completion publication/drive for the supported live subset, or fail closed with
deterministic unsupported diagnostics.

### 2. Preview-state materialization contract

Expose enough generic output for the TypeScript policy runtime to consume the
WASM preview result without walking the TypeScript `GameState` object graph on
the supported hot path. The output may be an encoded preview-state buffer,
generic preview surface rows, or another buffer-oriented artifact, but it must
preserve the current preview outcome semantics and be usable by the later
production routing ticket.

### 3. Parity and fail-closed witnesses

Add focused parity witnesses comparing the new substrate against the TypeScript
preview driver for supported generic fixtures and current FITL same-seam
classes. Unsupported classes must report profile/candidate/owner diagnostics
and must not silently fall back into a route counted as WASM-supported.

### 4. Handoff back to production routing

Update `tickets/150FITLWASM-010.md` and `archive/specs/150-fitl-policy-vm-wasm-port.md`
only when this ticket has a truthful substrate that unblocks production routing.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` or adjacent generic preview-drive helpers
- `packages/engine/src/agents/policy-wasm-preview-drive.ts`
- `packages/engine/src/agents/policy-wasm-runtime.ts`
- `packages/engine-wasm/policy-vm/src/preview_drive.rs`
- focused unit/integration witnesses near the preview-drive and WASM seams
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` if the inventory/proof harness needs a new substrate diagnostic
- `tickets/150FITLWASM-010.md` and `archive/specs/150-fitl-policy-vm-wasm-port.md` when the prerequisite unblocks

## Out of Scope

- Production routing of preview-drive batches through scoring; ticket
  `150FITLWASM-010` owns that after this substrate is proven.
- Weakening the Spec 149 `<=250 ms` gate.
- FITL-specific encoded opcodes, ids, schemas, or bridge branches.
- Default-flipping policy evaluation or deleting closure-tree infrastructure.

## Acceptance Criteria

### Tests That Must Pass

1. Focused parity witness proves supported generic encoded preview-state
   substrate results match the TypeScript preview driver.
2. FITL same-seam inventory or an equivalent direct witness proves the current
   production preview-drive classes are substrate-supported, or records exact
   residual fail-closed classes and successor owner.
3. Unsupported preview-drive classes fail closed with deterministic diagnostics
   before scoring.
4. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
5. Existing suite: `pnpm -F @ludoforge/engine build`.

### Invariants

1. No JSON, host object graph walking, or FITL-specific ids on any route
   claimed as the supported hot FFI path.
2. Preview outcomes, depth caps, stochastic exits, hidden-sampling behavior,
   rollback/recovery compatibility, and replay identity remain equivalent to
   the TypeScript reference for supported classes.
3. Unsupported classes are deterministic and fail closed rather than merged
   with TypeScript fallback rows.

## Test Plan

### New/Modified Tests

1. Focused preview-drive/WASM parity tests for the new substrate.
2. Focused unsupported-class fail-closed tests for diagnostics and no fallback
   merge.

### Commands

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. Focused encoded preview-state substrate parity test command.
4. Focused unsupported-class fail-closed test command.
5. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-013-preview-state-substrate`.

## Outcome

Completed on 2026-05-03.

This ticket added the encoded preview-state slot substrate that the inventory
witness required before the next production preview-drive routing reassessment:

- ABI/layout identities advanced to ABI version `8` and preview-drive layout
  `0x1500_0013`.
- `policy-wasm-preview-drive.ts` now lets callers declare generic
  `previewStateSlots` and per-candidate `initialPreviewStateValues`, and
  `evaluatePreviewDriveBatch` returns candidate-local `previewStateValues`
  alongside outcome/depth/value rows.
- `policy-vm/src/preview_drive.rs` writes the requested preview-state slot
  matrix into a dedicated WASM output buffer. The current generic supported
  subset updates the primary slot through encoded initial-application deltas,
  greedy `chooseOne`, greedy `chooseN`, and scalar completion steps.
- Unsupported preview-drive classes still fail closed before scoring with the
  existing deterministic unsupported diagnostics.
- The focused preview-driver parity witness now compares the encoded
  preview-state slot output against the TypeScript preview driver for the
  supported generic fixtures.
- The FITL same-seam inventory probe now requires
  `previewStateSubstrateSupported=true`; support is no longer classified from
  scalar outcome/depth/value replay alone.

Final FITL same-seam inventory:

- Command: `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-013-preview-state-substrate`
- Result: completed as substrate inventory evidence, not production routing.
- `elapsedMs=6823.4`, `turnsCount=1`, `driveExitTotal=211`.
- Active existing routes remain healthy: `wasmScoreRowRouteCount=65`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowRouteCount=77`, and
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Inventory rows: `initialMoveApplication`, `decisionStackPublication`, and
  `completionExits` all report `supportedByEncodedPreviewDriveAbi=true` and
  `previewStateSubstrateSupported=true`, with successor owner
  `tickets/150FITLWASM-010.md`.
- Completion exits remain completed rows across all four baseline profiles plus
  two depth-cap exits (`us-baseline event`, `vc-baseline event`).

This unblocks `tickets/150FITLWASM-010.md` for the later production routing,
fail-closed diagnostics, and same-seam perf-gate work. This ticket did not
route production scoring through the preview-drive ABI and did not weaken the
Spec 149 `<=250 ms` gate.

Post-completion reassessment on 2026-05-03 corrected the handoff boundary:
this ticket completed an encoded preview-state slot inventory substrate, not
the full generic production preview-drive application/publication/materialization
substrate needed before production routing can truthfully resume. New active
ticket `tickets/150FITLWASM-014.md` owns that production substrate
prerequisite. `tickets/150FITLWASM-010.md` remains blocked until
`150FITLWASM-014` completes, then resumes as the production routing,
fail-closed diagnostics, and same-seam perf-gate owner.

Final verification:

- `node --check packages/engine/scripts/profile-fitl-preview-drive.mjs` —
  passed.
- `pnpm -F @ludoforge/engine-wasm build` — passed.
- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js` —
  passed, 8 tests.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-runtime.test.js` —
  passed, 15 tests.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-013-preview-state-substrate` —
  passed as final substrate inventory evidence.
- `pnpm run check:ticket-deps` — passed for 5 active tickets and 2202
  archived tickets.
