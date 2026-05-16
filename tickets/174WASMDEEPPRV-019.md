# 174WASMDEEPPRV-019: Phase 4h — Rerun measured gate and identify next default-route owner

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — profiling/gate evidence first; runtime changes only if the rerun exposes a small, generic, ticket-owned measurement blocker
**Deps**: `archive/tickets/174WASMDEEPPRV-018.md`, `archive/tickets/174WASMDEEPPRV-010.md`, `reports/174-phase-4g-decision-stack-digest-cost.md`, `specs/174-wasm-preview-drive-coverage-extension.md`

## Problem

Spec 174 exists because the production deep preview-drive path should eventually route supported `continuedDeepening` / `deep1024` chooseN work through WASM by default, rather than carrying a permanent TypeScript/A-B fallback for shapes that the WASM route can now represent. The rejected default-flip ticket, `archive/tickets/174WASMDEEPPRV-010.md`, was correct to reject the flip when the broad Phase 4 gate failed, but later Phase 4c-4g tickets continued removing generic blockers.

`archive/tickets/174WASMDEEPPRV-018.md` improved the bounded seed-1005 witness from the Phase 4f `63872.98 ms` baseline to `59610.96 ms`, with route/unsupported/batch counts unchanged at `310` / `221` / `199`. That is still only bounded single-seed evidence. The series now needs a fresh broad measured gate rerun after the Phase 4g state-patch hash reuse, plus a durable next-owner classification:

- if the broad gate passes, open a new default-flip/A-B-deletion ticket from the new evidence instead of resurrecting archived `174WASMDEEPPRV-010`;
- if the broad gate fails, identify the next measured owner using route counts, unsupported/fallback rows, hot buckets, and per-seed slow-tier data.

## Assumption Reassessment (2026-05-16)

1. `archive/tickets/174WASMDEEPPRV-010.md` is archived as the failed conditional default-flip attempt. It did not retain engine code and must not be reopened as a pass path.
2. The Phase 4a gate report required the slow-tier median for seeds `1005`, `1011`, `1008`, `1013`, and `1009` to improve by at least `25%` versus the post-008 baseline median `27211.75 ms`, with a required final median `<=20408.8125 ms`.
3. Phase 4g improved bounded seed `1005`, but did not run the broad `1000..1014` gate and did not authorize deleting A-B routing.
4. The architectural goal remains valid: once supported chooseN/deep preview-drive shapes are broadly proven faster and semantically equivalent, Foundation #14 requires deleting temporary A-B/default-fallback machinery instead of keeping it indefinitely.

## Architecture Check

1. Foundation #1: any new measured owner or retained runtime change must remain game-agnostic. No FITL action names, factions, cards, profile labels, or microturn-class-specific branches are allowed in runtime code.
2. Foundation #14: archived `174WASMDEEPPRV-010` stays rejected. A future default flip needs a fresh ticket grounded in a fresh broad measured Pass.
3. Foundation #16: the default route must be justified by automated parity, activation, unsupported provenance, and measured gate evidence, not by bounded single-seed improvement alone.
4. Foundation #20: unsupported/fallback rows remain explicit. Fallback success must not count as WASM route activation or scalar preview readiness.

## What to Change

### 1. Broad Phase 4h measured gate rerun

Rerun the broad 15-seed decomposition witness after the Phase 4g retained code:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>-phase-4h-post-4g-gate --profile-buckets
```

Record:

- slow-tier median for seeds `1005`, `1011`, `1008`, `1013`, and `1009`;
- comparison against the post-008 baseline median `27211.75 ms` and required pass threshold `<=20408.8125 ms`;
- per-seed wall time for the slow-tier seeds;
- production preview-drive route, unsupported, and batch counts;
- top unsupported/fallback rows by microturn class and reason when available;
- top hot-path buckets for the dominant failing or passing axes.

### 2. Gate decision report

Create `reports/174-phase-4h-post-4g-gate-decision.md` with:

- exact command and artifact paths;
- pass/fail verdict;
- gate math table;
- activation/unsupported/batch summary;
- if pass: the evidence needed for a new default-flip/A-B-deletion ticket;
- if fail: the next non-overlapping measured owner and why it is not archived `174WASMDEEPPRV-010`.

### 3. Fresh default-flip handoff only on Pass

If the broad gate records a Pass, create a new active default-flip ticket, expected next id `174WASMDEEPPRV-020`, that owns:

- deleting temporary A-B/default-fallback wiring for the now-proven supported route;
- updating default-route tests;
- rerunning the post-flip witness.

Do not edit or reopen `archive/tickets/174WASMDEEPPRV-010.md` except for a dated archival amendment if a path/reference correction is mechanically required.

### 4. Next-owner handoff on Fail

If the broad gate still fails, keep `archive/tickets/174WASMDEEPPRV-010.md` rejected and create or update the next non-overlapping measured-owner ticket only when the evidence is concrete. The owner must be grounded in the final report's route counts, unsupported/fallback provenance, hot buckets, and per-seed deltas.

## Files to Touch

- `reports/174-phase-4h-post-4g-gate-decision.md` (new)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>-phase-4h-post-4g-gate.md` (new)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>-phase-4h-post-4g-gate.csv` (new)
- `specs/174-wasm-preview-drive-coverage-extension.md` (modify for ticket-list/outcome parity)
- `174WASMDEEPPRV-020` default-flip ticket (new only if the broad gate records a Pass)
- next measured-owner ticket (new only if the broad gate fails and evidence identifies a concrete non-overlapping owner)

## Out of Scope

- No default flip or A-B wiring deletion in this ticket.
- No resurrection of `archive/tickets/174WASMDEEPPRV-010.md`.
- No FITL-specific runtime branches.
- No profile retuning, `depthCap`, `maxOptions`, `chooseNBeamWidth`, or `capClass` changes.
- No runtime optimization unless the broad rerun identifies a small, generic, ticket-owned blocker that can be proven without blurring the gate-decision scope.

## Acceptance Criteria

### Tests That Must Pass

1. Broad 15-seed gate rerun completes and records a pass/fail verdict against `<=20408.8125 ms` slow-tier median.
2. Gate decision report records activation, unsupported/fallback, batch, per-seed, and hot-bucket evidence.
3. If Pass: a fresh default-flip ticket exists and depends on this gate-decision ticket; archived `174WASMDEEPPRV-010` remains rejected.
4. If Fail: a concrete next measured owner is named, or the report explicitly says no non-overlapping owner was proven.
5. Ticket dependency integrity remains green: `pnpm run check:ticket-deps`.

### Invariants

1. Supported WASM route activation is measured separately from unsupported/fallback rows.
2. A broad gate Pass is required before any default flip or A-B deletion.
3. Archived `174WASMDEEPPRV-010` remains historical rejected evidence, not an active implementation path.
4. Any successor owner is non-overlapping and grounded in measured evidence.

## Test Plan

### New/Modified Tests

1. No focused source tests are required for the measurement-only path unless the rerun exposes a small generic runtime blocker that this ticket explicitly retains.

### Commands

1. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>-phase-4h-post-4g-gate --profile-buckets`
2. `pnpm run check:ticket-deps`
