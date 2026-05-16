# 174WASMDEEPPRV-019: Phase 4h — Rerun measured gate and identify next default-route owner

**Status**: COMPLETED — Phase 4h broad gate recorded Fail; no non-overlapping successor proven
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — profiling/gate evidence first; runtime changes only if the rerun exposes a small, generic, ticket-owned measurement blocker
**Deps**: `archive/tickets/174WASMDEEPPRV-018.md`, `archive/tickets/174WASMDEEPPRV-010.md`, `reports/174-phase-4g-decision-stack-digest-cost.md`, `archive/specs/174-wasm-preview-drive-coverage-extension.md`

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
- `archive/specs/174-wasm-preview-drive-coverage-extension.md` (modify for ticket-list/outcome parity)
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

## Outcome

Implementation completed on 2026-05-16.

Landed scope:
- Refreshed the engine build before the measurement so the witness consumed current `packages/engine/dist` output.
- Ran the broad post-4g 15-seed decomposition witness with the exact ticket command and date stem `2026-05-16-phase-4h-post-4g-gate`.
- Produced `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4h-post-4g-gate.md`.
- Produced `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4h-post-4g-gate.csv`.
- Produced `reports/174-phase-4h-post-4g-gate-decision.md`.
- Updated `archive/specs/174-wasm-preview-drive-coverage-extension.md` with the Phase 4h decision.

Gate verdict:

| Metric | Value |
|---|---:|
| Post-008 baseline slow-tier median | 27211.75 ms |
| Required final median for 25% improvement | <= 20408.8125 ms |
| Phase 4h post-4g slow-tier median | 28601.78 ms |
| Delta vs baseline | +1390.03 ms |
| Percent change vs baseline | +5.1082% |
| Improvement | -5.1082% |
| Verdict | Fail |

Slow-tier wall times:

| Seed | Phase 4h wall ms |
|---:|---:|
| 1005 | 64149.54 |
| 1011 | 33182.64 |
| 1008 | 28601.78 |
| 1013 | 7018.31 |
| 1009 | 9484.70 |

Activation and unsupported summary:

| Counter | Value |
|---|---:|
| WASM production preview-drive route count | 1253 |
| WASM production preview-drive unsupported count | 2313 |
| WASM production preview-drive batch count | 1711 |

Residual classification:
- Broad gate result: Fail; no default flip or A-B deletion is authorized.
- `archive/tickets/174WASMDEEPPRV-010.md` remains archived rejected evidence and was not edited or reopened.
- No `174WASMDEEPPRV-020` default-flip ticket was created because the broad gate did not pass.
- No new measured-owner ticket was created in this closeout. The top measured residual is again the zero-counter `coupArvnRedeployPolice:chooseOne | continuedDeepening` axis (`26887.27 ms`, `0` route, `0` unsupported, `0` batch), which overlaps the archived Phase 4d owner in `archive/tickets/174WASMDEEPPRV-015.md` instead of proving a fresh non-overlapping owner.
- Successor input preserved in the decision report: terminal-boundary projected-state rows under `production-deep-choosenstep-continuation.projectedState`, card-event unsupported rows, action-batch shared-scalar unsupported rows, and remaining train/govern digest/encode buckets. A future owner should start from this evidence and prove a non-overlapping measured seam before creating the next active ticket.

Generated/artifact fallout:
- Checked-in Phase 4h decision report, witness Markdown, and witness CSV were created.
- No source, test, schema, golden, GameSpecDoc, WASM ABI, generated JSON, or runtime artifact diff is retained.

Command ledger:
- Build prerequisite | `pnpm -F @ludoforge/engine build` | ran before the measurement | passed.
- What to Change/Test Plan | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-16-phase-4h-post-4g-gate --profile-buckets` | ran directly | passed; completed 15/15 seeds and wrote the Phase 4h witness Markdown/CSV.
- Test Plan | `pnpm run check:ticket-deps` | ran after final status/spec/report edits | passed for 1 active ticket and 2369 archived tickets.

Late-edit proof validity:
- The post-witness edits are report/ticket/spec transcription and ownership classification only. They do not alter runtime code, command semantics, measured threshold, or witness artifacts. The broad witness remains valid as measurement evidence for the final source state because no source or test diff is retained.
- No-invalidation: terminal status/proof/checker transcription only; no scope, acceptance, command semantics, touched-file ownership, follow-up ownership, dependency ownership, measured threshold, or witness artifact changed.
