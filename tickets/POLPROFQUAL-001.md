# POLPROFQUAL-001: Make policy-profile-quality reporting resilient when no report artifact is produced

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — workflow / reporting script only
**Deps**: `docs/FOUNDATIONS.md`, `.github/workflows/engine-determinism.yml`

## Problem

The latest `Engine Determinism Parity` run shows a secondary failure in the `policy-profile-quality` post-processing step:

- the lane is `continue-on-error: true`,
- the annotation step runs unconditionally,
- `packages/engine/scripts/emit-policy-profile-quality-report.mjs` is invoked with `--input policy-profile-quality-report.ndjson`,
- the file does not exist,
- the step fails with `ENOENT`.

This is not the core engine failure. It is a workflow/reporting robustness bug that obscures the real result.

Per the Foundations appendix, policy-profile-quality is a witness/reporting lane, not the determinism proof itself. If the run did not produce a report, the reporting path must degrade cleanly and say so explicitly.

## Assumption Reassessment (2026-04-21)

1. The missing file may occur because the policy-profile-quality lane terminated early or produced no report before the post-step executed.
2. The current failure is in reporting, not in the authoritative rules engine.
3. The correct fix is to make the reporting/annotation path tolerant of absent input, not to reinterpret the missing report as a successful quality run.

## Architecture Check

1. This ticket changes reporting only; it does not weaken engine determinism or policy-quality assertions.
2. The workflow should surface the primary engine or witness failure clearly instead of replacing it with an `ENOENT` post-step crash.
3. No compatibility shim is needed beyond explicit absent-input handling.

## What to Change

### 1. Harden the annotation script or workflow guard

Choose one consistent approach:

- guard the workflow step and skip emission when the report file is absent, or
- make `emit-policy-profile-quality-report.mjs` print a clear no-report summary and exit successfully when the input is missing.

The chosen approach must still make it obvious that the witness lane did not produce data.

### 2. Preserve baseline comparison behavior when artifacts do exist

Do not regress the normal path:

- baseline download still optional,
- comparison still runs when both current and baseline reports exist,
- artifact upload remains useful for later inspection.

## Files to Touch

- `.github/workflows/engine-determinism.yml` (modify)
- `packages/engine/scripts/emit-policy-profile-quality-report.mjs` (modify if script-side handling is chosen)

## Out of Scope

- Changing the determinism proof lane status.
- Hiding a real policy-profile-quality regression.
- Timeout or memory tuning for the underlying engine run.

## Acceptance Criteria

### Tests That Must Pass

1. A run with no `policy-profile-quality-report.ndjson` does not fail the annotation step with `ENOENT`.
2. A run with a valid report still emits annotations/comments as before.
3. `pnpm turbo lint && pnpm turbo typecheck` remain green.

### Invariants

1. Reporting failures do not replace or obscure the underlying engine/witness failure.
2. The distinction in `docs/FOUNDATIONS.md` appendix between determinism proof and profile-quality witness remains intact.

## Test Plan

### New/Modified Tests

1. Script-level absent-input guard test, or documented workflow reproduction proving skip/no-op behavior

### Commands

1. `node packages/engine/scripts/emit-policy-profile-quality-report.mjs --input <missing-file>` or equivalent guarded workflow reproduction
2. `pnpm turbo lint && pnpm turbo typecheck`
