# ANIMDIAG-008: E2E Verification and Cleanup

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: ANIMDIAG-007

## Problem

After all code changes are in place, the full pipeline needs manual E2E verification to confirm that diagnostic data flows correctly from trace processing through to JSON export. Additionally, CLAUDE.md needs updating to reflect the new diagnostic infrastructure in the project status and file layout documentation.

## Assumption Reassessment (2026-02-22)

1. All ANIMDIAG-001 through 007 are implemented and tests pass.
2. Texas Hold'em is the primary manual test game (available via `pnpm -F @ludoforge/runner dev`).
3. CLAUDE.md contains project status, architecture tables, and directory descriptions that reference the animation system.

## Architecture Check

1. Manual E2E verification is necessary because automated E2E tests for browser animation rendering are brittle and not worth the maintenance cost for a dev-only diagnostic tool.
2. CLAUDE.md updates ensure future sessions have visibility into the diagnostic infrastructure.
3. No backwards-compatibility concerns.

## What to Change

### 1. Manual E2E verification

Run the dev server and verify the full diagnostic pipeline:

1. `pnpm -F @ludoforge/runner dev`
2. Play several turns of Texas Hold'em
3. Click "Download Log" button
4. Open the JSON file and verify it contains:
   - Multiple `DiagnosticBatch` entries with incrementing `batchId`
   - `trace` arrays with serialized effect trace entries
   - `descriptors` arrays with serialized animation descriptors
   - `spriteResolutions` with `resolved: true` entries showing positions
   - `tweens` with preset names, durations, and from/to positions
   - `faceControllerCalls` with `setFaceUp` values and context strings
   - `tokenVisibilityInits` for moved tokens
   - `meta` header with export timestamp and batch count
5. Verify ring buffer cap: after 100+ animation batches, `getBatches().length <= 100` (check via browser console: `__animDiagnosticBuffer.getBatches().length`)

### 2. Update CLAUDE.md

- Add `diagnostic-buffer.ts` to the animation directory description in the Architecture table
- Note the diagnostic logger in the animation system description line
- If the completed ticket series list is updated, add ANIMDIAG

### 3. Verify no regressions

- `pnpm -F @ludoforge/runner typecheck` — no type errors
- `pnpm -F @ludoforge/runner test` — all tests pass
- `pnpm turbo test` — full suite passes

## Files to Touch

- `CLAUDE.md` (modify — documentation update)

## Out of Scope

- Automated E2E tests for diagnostic download (too brittle for dev-only tooling)
- Production-mode diagnostic support
- Log viewer UI beyond the download button

## Acceptance Criteria

### Tests That Must Pass

1. Manual verification: downloaded JSON contains all expected diagnostic data sections.
2. Manual verification: ring buffer capped at 100 batches after extended play.
3. Manual verification: download button only visible in dev mode.
4. `pnpm -F @ludoforge/runner typecheck` — passes
5. `pnpm -F @ludoforge/runner test` — passes
6. `pnpm turbo test` — passes

### Invariants

1. CLAUDE.md accurately reflects the new diagnostic-buffer.ts file and its purpose.
2. No production bundle size increase from diagnostic infrastructure.
3. Diagnostic data accurately reflects actual animation pipeline decisions.

## Test Plan

### New/Modified Tests

1. No new automated tests — this ticket is manual verification and documentation.

### Commands

1. `pnpm -F @ludoforge/runner dev` (manual testing)
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm turbo test`
