# 150FITLWASM-012: FITL-current encoded preview-drive class expansion

**Status**: PENDING
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

Ticket `150FITLWASM-010` cannot truthfully resume production routing until these
current FITL classes have a generic encoded route or a narrower fail-closed
owner explicitly excludes them.

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
