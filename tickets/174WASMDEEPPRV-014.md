# 174WASMDEEPPRV-014: Phase 4c — Diagnose failed post-011 residual owner

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — diagnostic telemetry or measurement harness only, unless reassessment identifies a smaller generic runtime owner
**Deps**: `tickets/174WASMDEEPPRV-009.md`

## Problem

`tickets/174WASMDEEPPRV-009.md` recorded a Phase 4 **Fail** verdict after the post-011 15-seed witness. The slow-tier median regressed from the post-008 baseline `27211.75 ms` to `62042.20 ms`, while the witness recorded production preview-drive route count `181` and unsupported count `3394`.

The architectural blocker is not yet narrow enough for a default flip or a direct optimization ticket. The largest residual class, `coupArvnRedeployPolice:chooseOne`, recorded `275891.21 ms` of measured agent-call time with `0` production preview-drive route and `0` unsupported counts. Several other slow classes record large unsupported counts, but the current witness only exposes unsupported activity by microturn class, not by the lower-level `unsupportedDriveClass` / `unsupportedOwner` reason.

## Assumption Reassessment (2026-05-16)

1. `reports/174-phase-4-gate-decision.md` records a Fail verdict and explicitly blocks `tickets/174WASMDEEPPRV-010.md`.
2. `reports/174-phase-4-architectural-blocker.md` identifies both unsupported-count residuals and zero-counter high-wall-time residuals.
3. The existing witness CSV now records `wasmProductionPreviewDriveRouteCount`, `wasmProductionPreviewDriveUnsupportedCount`, and `wasmProductionPreviewDriveBatchCount` per decision, but not the exact unsupported reason per row.

## Architecture Check

1. Foundation #20 requires unsupported preview-drive provenance to remain explicit; this ticket must expose the missing reason-granular evidence rather than treating unsupported counts as scalar noise.
2. Foundation #1 still forbids FITL-specific runtime branches. Any retained code must be generic over preview-drive classes, token/query workloads, or measurement telemetry.
3. Foundation #16 requires the next owner to prove the residual classification through a repeatable witness before reopening the default-flip path.

## What to Change

### 1. Reason-granular residual evidence

Extend the smallest generic telemetry or witness surface needed to attribute production preview-drive unsupported counts by `unsupportedDriveClass` and owner/reason. Preserve the existing counter totals.

### 2. Zero-counter residual classification

Explain why `coupArvnRedeployPolice:chooseOne` and other high-wall-time classes record no production preview-drive route or unsupported counts. Classify each dominant zero-counter class as:

- bypassing the preview-drive route;
- hidden unsupported/fallback without reason-granular telemetry;
- dominated by token/query/runtime work outside the preview-drive route; or
- measurement-boundary artifact.

### 3. Next-owner decision

Produce a short report that names the next non-overlapping implementation owner, or records why no further Spec 174 default-flip path remains valid without a respec.

## Files to Touch

- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (modify if witness telemetry needs reason-granular fields)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify only if the existing runtime counters cannot expose reason-granular telemetry through a narrower script-side seam)
- `reports/174-phase-4c-residual-owner.md` (new)
- `tickets/174WASMDEEPPRV-010.md` (modify only if a later Pass path is reauthorized)

## Out of Scope

- No default flip or A/B deletion.
- No FITL-specific runtime branch.
- No profile retuning, GameSpecDoc changes, or budget weakening.

## Acceptance Criteria

### Tests That Must Pass

1. The residual-owner report names the exact reason-granular unsupported classes or records why the live route exposes no unsupported reason for a dominant class.
2. If telemetry code changes, focused tests prove the new diagnostic fields do not change route activation semantics.
3. Existing engine suite remains green: `pnpm turbo test`.

### Invariants

1. Unsupported/fallback success cannot count as supported WASM route activation.
2. The next owner is non-overlapping with rejected ticket 010's default-flip path.

## Test Plan

### New/Modified Tests

1. Add or update focused telemetry tests only if production code changes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds <bounded set> --timeout-ms 400000 --date <YYYY-MM-DD>-phase-4c-residual --profile-buckets`
3. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
