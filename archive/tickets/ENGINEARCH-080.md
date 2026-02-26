# ENGINEARCH-080: Make ticket archival collision-safe and history-preserving

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — repository workflow/tooling only
**Deps**: None

## Problem

Ticket archival currently has no enforced collision guard. A completed ticket can be moved into `archive/tickets/` and overwrite an existing file with the same name, causing historical data loss.

## Assumption Reassessment (2026-02-26)

1. Archival steps are documented in `AGENTS.md`/`CLAUDE.md`, but there is no required collision-check command in that flow.
2. The repository already has evidence that archive name collisions are realistic: several IDs already exist in multiple archived filenames (for example `ENGINEARCH-040.md` and `ENGINEARCH-040-reassessed-2026-02-26.md`).
3. Mismatch + correction: current instructions say "move to archive" but do not mandate a guard command. Process docs alone are insufficient; archival must be enforced by deterministic tooling that blocks overwrite-by-default and requires an explicit non-colliding destination when needed.

## Architecture Check

1. A single archival entry point with collision checks is cleaner and more robust than ad hoc `mv` usage.
2. This is repository process infrastructure only; no game-specific behavior or engine/runtime coupling is introduced.
3. No backwards-compatibility aliasing/shims: collision attempts should fail hard unless caller provides a non-colliding destination path.

## What to Change

### 1. Add archive-ticket utility with collision guard

Create a script under `scripts/` that:
- accepts source path + destination directory or explicit destination file path,
- verifies source exists,
- rejects destination collisions by default,
- supports explicit rename path to resolve collisions,
- exits non-zero on unsafe/invalid operations.

### 2. Wire documentation to require guarded archival flow

Update archival instructions in:
- `AGENTS.md`
- `CLAUDE.md`
- `tickets/README.md`

So all archival guidance uses the guarded command, not raw `mv`.

### 3. Add tests for the archival guard script

Add tests that cover:
- success on non-colliding move,
- failure on existing destination,
- success when explicit non-colliding rename is provided,
- failure when source is missing.
- failure when destination parent directory does not exist.

## Files to Touch

- `scripts/archive-ticket.mjs` (new)
- `scripts/` test file for archival utility (new)
- `AGENTS.md` (modify)
- `CLAUDE.md` (modify)
- `tickets/README.md` (modify)

## Out of Scope

- Bulk renaming legacy archived tickets
- Changing ticket ID scheme
- Any engine/runtime/runner behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Archival script fails on destination collision and leaves existing archive file untouched.
2. Archival script succeeds for non-colliding moves and explicit rename paths.
3. Archival script fails with a clear error when source is missing or destination parent directory is invalid.
4. Existing suite: `pnpm turbo test --force`
5. Existing suite: `pnpm turbo lint`

### Invariants

1. Archive history is append-only and collision-safe by default.
2. Archival workflow remains deterministic and tool-enforced.

## Test Plan

### New/Modified Tests

1. `scripts/archive-ticket.test.mjs` — validates non-colliding move success, collision rejection, explicit rename success, missing-source failure, and invalid-destination failure.

### Commands

1. `node --test <scripts archival test file>`
2. `pnpm turbo test --force`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Added `scripts/archive-ticket.mjs` as the canonical collision-safe archival command.
  - Added `scripts/archive-ticket.test.mjs` covering non-colliding move success, collision failure, explicit rename success, missing source failure, and invalid destination-parent failure.
  - Updated archival instructions in `AGENTS.md`, `CLAUDE.md`, and `tickets/README.md` to require `node scripts/archive-ticket.mjs ...` instead of raw `mv`.
- Deviations from original plan:
  - No scope expansion beyond ticket goals; implementation stayed tooling/process-only.
  - Error/success output was implemented with synchronous writes to ensure deterministic CLI diagnostics in automation.
- Verification results:
  - `node --test scripts/archive-ticket.test.mjs` passed.
  - `pnpm turbo test --force` passed.
  - `pnpm turbo lint` passed.
