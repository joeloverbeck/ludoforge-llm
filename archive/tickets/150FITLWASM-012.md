# 150FITLWASM-012: FITL-current encoded preview-drive class expansion

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: XL
**Engine Changes**: Yes — generic encoded preview-drive class expansion for current FITL same-seam classes
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-011.md`

## Problem

Ticket `150FITLWASM-011` delivered the first generic encoded preview-drive ABI
substrate and proved parity for the supported synthetic greedy subset. Its
same-seam FITL inventory still classifies the production FITL preview drives as
fail-closed because initial move application and decision-stack publication
still require TypeScript `GameState` object graph traversal.

The current FITL inventory from `150FITLWASM-011` recorded:

- `driveExitTotal=211`
- `initialMoveApplication`: `supportedByEncodedPreviewDriveAbi=false`,
  `failClosedClass=unsupported-effect`, `count=211`
- `decisionStackPublication`: `supportedByEncodedPreviewDriveAbi=false`,
  `failClosedClass=unsupported-effect`, `count=211`
- completion exits include completed depths across all four baseline profiles
  plus two depth-cap exits (`us-baseline event`, `vc-baseline event`)

Before this ticket, `150FITLWASM-010` could not truthfully resume production
routing until these current FITL classes had a generic encoded route or a
narrower fail-closed owner explicitly excluded them.

## What to Change

1. Expand the generic encoded preview-drive substrate from `150FITLWASM-011`
   to cover the current FITL same-seam initial move application and
   publication classes without FITL-specific ids, branches, schemas, or score
   shortcuts.
2. Add focused parity witnesses against the TypeScript preview driver for the
   newly supported generic class set.
3. Rerun the FITL same-seam inventory probe and record which classes are now
   supported versus still fail-closed.
4. Keep unsupported residual classes deterministic and fail-closed with
   diagnostics naming profile owner, candidate count, action/feature owner, and
   unsupported drive class.
5. Update `tickets/150FITLWASM-010.md` only when the production routing
   prerequisite is truthfully unblocked.

## Out of Scope

- Production routing of preview-drive batches through scoring; ticket
  `150FITLWASM-010` owns that once this prerequisite is green.
- Weakening the Spec 149 `<=250 ms` gate.
- FITL-specific encoded opcodes, ids, schemas, or bridge branches.

## Acceptance Criteria

1. The encoded preview-drive inventory proves the current FITL same-seam
   initial move application and publication classes are supported, or records a
   narrower successor for any remaining fail-closed class.
2. New supported classes have TypeScript reference parity tests.
3. Unsupported residual classes fail closed before scoring.
4. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
5. Existing suite: `pnpm -F @ludoforge/engine build`.

## Test Plan

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. Focused encoded preview-drive class parity test command.
4. Focused unsupported-class fail-closed test command.
5. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-012-preview-drive-inventory`.

## Outcome

Completed on 2026-05-03.

This ticket expanded the generic encoded preview-drive ABI from the synthetic
greedy subset to the current FITL inventory class boundary:

- ABI/layout identities advanced to version `7` and preview-drive layout
  `0x1500_0012`.
- The preview-drive buffer now supports `applyCandidateDeltas`, a generic
  per-candidate encoded initial-application delta step that lets the WASM route
  consume pre-encoded application effects without walking TypeScript
  `GameState` object graphs.
- Unsupported preview-drive diagnostics now preserve `profileId`,
  `candidateCount`, `unsupportedDriveClass`, and optional
  `unsupportedOwner`.
- The focused parity witness compares the new encoded initial-application step
  plus greedy publication/completion against the TypeScript preview driver.
- The FITL inventory script now derives supported/fail-closed rows by calling
  the live WASM preview-drive runtime over the captured FITL preview-drive
  classes instead of returning static classification rows.

Final FITL same-seam inventory:

- Command: `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-012-live-encoded-inventory`
- Result: completed as inventory evidence, not production routing.
- `elapsedMs=7020.43`, `turnsCount=1`, `driveExitTotal=211`.
- Active existing routes remain healthy: `wasmScoreRowRouteCount=65`,
  `wasmScoreRowUnsupportedCount=0`,
  `wasmPreviewCandidateFeatureRowRouteCount=77`,
  `wasmPreviewCandidateFeatureRowUnsupportedCount=0`.
- Inventory rows: `initialMoveApplication`, `decisionStackPublication`, and
  `completionExits` all report `supportedByEncodedPreviewDriveAbi=true` with
  successor owner `tickets/150FITLWASM-010.md`.
- `initialMoveApplication` is validated by a live encoded
  `applyCandidateDeltas` batch across all 211 captured FITL preview drives.
- `decisionStackPublication` and `completionExits` are validated by live
  encoded completion outcome replay for every captured completion/depth-cap
  class in the inventory.
- Completion exits remain completed rows across all four baseline profiles plus
  two depth-cap exits (`us-baseline event`, `vc-baseline event`).

This unblocks `tickets/150FITLWASM-010.md` for the later production routing,
fail-closed diagnostics, and same-seam perf-gate work. This ticket did not
route production scoring through the preview-drive ABI and did not weaken the
Spec 149 `<=250 ms` gate.

Final verification:

- `pnpm -F @ludoforge/engine-wasm build` — passed.
- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js` — passed, 8 tests.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-runtime.test.js` — passed, 15 tests.
- `node --check packages/engine/scripts/profile-fitl-preview-drive.mjs` — passed.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-012-preview-drive-inventory` — passed as initial inventory evidence before review correction.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-012-post-review-inventory` — passed as post-review inventory evidence; classification remains fail-closed for current FITL rows.
- `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --previewDriveInventory --label spec150-012-live-encoded-inventory` — passed as final live encoded inventory evidence.
- `pnpm run check:ticket-deps` — passed for 5 active tickets and 2201 archived tickets.

Post-review correction:

- The earlier post-review downgrade was resolved by adding live encoded
  inventory validation to the profiling script.
- No remaining fail-closed class is owned by this ticket; production routing
  and the same-seam perf-gate verdict remain with `tickets/150FITLWASM-010.md`.
