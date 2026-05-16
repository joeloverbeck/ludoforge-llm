# 174WASMDEEPPRV-016: Phase 4e — Diagnose train chooseNStep unsupported deepening residuals

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — diagnostic telemetry and generic preview-drive/deepening runtime only after measured owner is confirmed
**Deps**: `archive/tickets/174WASMDEEPPRV-015.md`, `reports/174-phase-4d-zero-counter-residual.md`

## Problem

Spec 174 still cannot reopen the default-flip path in `archive/tickets/174WASMDEEPPRV-010.md`. The Phase 4d zero-counter owner reduced `coupArvnRedeployPolice:chooseOne | continuedDeepening` from the dominant residual to rank 3 in the bounded seed-1005 witness, but the same report says the bounded sample is now dominated by reason-granular unsupported `train:chooseNStep:add` and `train:chooseNStep:confirm` continued-deepening classes.

This ticket owns the next non-overlapping Phase 4 slice: diagnose those `train:chooseNStep` unsupported classes, determine whether they are actionable generic WASM preview-drive coverage, generic deep-continuation runtime work, or a measurement-boundary blocker, and retain only a proven generic improvement. It does not reopen the rejected default flip.

## Assumption Reassessment (2026-05-16)

1. `archive/tickets/174WASMDEEPPRV-010.md` is rejected because `reports/174-phase-4-gate-decision.md` recorded a Fail verdict; no default flip or A/B deletion is authorized until a later gate records a Pass.
2. `archive/tickets/174WASMDEEPPRV-015.md` completed the zero-counter owner slice and archived after reducing the previously dominant `coupArvnRedeployPolice:chooseOne | continuedDeepening` residual.
3. `reports/174-phase-4d-zero-counter-residual.md` now names reason-granular unsupported `train:chooseNStep:add` and `train:chooseNStep:confirm` continued-deepening classes as the dominant bounded-sample residual, so a new ticket is needed instead of reusing 010.

## Architecture Check

1. Foundation #20 requires unsupported preview-drive provenance to stay explicit. This ticket must preserve reason-granular unsupported/fallback evidence instead of letting fallback success count as WASM activation.
2. Foundation #1 forbids FITL-specific runtime branches. Any retained implementation must be generic over encoded preview-drive, chooseNStep continuation, token/query, or publication mechanics.
3. Foundation #14 keeps `archive/tickets/174WASMDEEPPRV-010.md` rejected until the measured gate passes; this ticket may produce the evidence or implementation needed for a later gate, but it does not delete A/B wiring or flip defaults.

## What to Change

### 1. Re-establish the dominant residual

Run the smallest bounded witness that still exposes the current `train:chooseNStep:add` and `train:chooseNStep:confirm` continued-deepening residuals. Confirm per-row route, unsupported, batch, and reason-granular unsupported counters before changing runtime code.

### 2. Diagnose unsupported owner classes

Classify each dominant `train:chooseNStep` unsupported row by `unsupportedDriveClass`, `unsupportedOwner`, and measured bucket. Determine whether the residual is:

- missing generic WASM preview-drive coverage;
- deep chooseNStep continuation materialization still failing closed;
- generic publication/token/query runtime work outside WASM preview-drive; or
- a measurement-boundary artifact.

### 3. Retain only a generic proven improvement

If the diagnostic evidence identifies a safe generic owner, implement the smallest runtime or telemetry change that reduces that owner without changing GameSpecDoc data, profile bounds, legality, publication semantics, or preview signal semantics. Revert any candidate that regresses the decisive bounded witness or only moves cost into another unowned bucket.

### 4. Record the Phase 4e decision

Produce `reports/174-phase-4e-train-choosenstep-residual.md` with the before/after residual classification, retained/rejected candidate ledger, and whether a later full Phase 4 gate rerun is now justified.

## Files to Touch

- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (modify only if witness output needs additional generic reason/bucket fields)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` (modify only if report rendering needs additional generic summaries)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify only if the confirmed owner is deep chooseNStep continuation routing)
- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify only if the confirmed owner is broad preview-drive unsupported classification or routing)
- `packages/engine/src/kernel/` (modify only if the confirmed owner is generic publication, token/query, or continuation runtime work)
- `packages/engine/test/**` (add or modify focused tests after the generic owner is known)
- `reports/174-phase-4e-train-choosenstep-residual.md` (new)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>-phase-4e-train-choosenstep-*.md` (new bounded witness report)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>-phase-4e-train-choosenstep-*.csv` (new bounded witness CSV)
- `archive/specs/174-wasm-preview-drive-coverage-extension.md` (modify for outcome/ticket-list parity)

## Out of Scope

- No default flip or A/B wiring deletion; `archive/tickets/174WASMDEEPPRV-010.md` remains rejected until a later measured gate records a Pass.
- No FITL-specific identifiers, faction/card branches, or profile-name checks in runtime code.
- No GameSpecDoc, policy profile, `depthCap`, `maxOptions`, `chooseNBeamWidth`, or `capClass` changes.
- No broad 15-seed final gate rerun unless the bounded Phase 4e evidence justifies it and the ticket outcome records the exact command.

## Acceptance Criteria

### Tests That Must Pass

1. A bounded witness report names the `train:chooseNStep:add` and `train:chooseNStep:confirm` residual before/after values, route counts, unsupported counts, batch counts, and reason-granular unsupported classes.
2. Any retained runtime change has focused correctness coverage for the generic owner it changes.
3. Existing engine suite remains green: `pnpm turbo test`.

### Invariants

1. Unsupported/fallback rows cannot count as supported WASM route activation.
2. Retained changes remain game-agnostic and deterministic across GameDef, state, seed, and actions.
3. Foundation #20 carriers and unavailable-preview provenance remain explicit across any changed preview-drive or deepening path.

## Test Plan

### New/Modified Tests

1. Add focused tests only after the diagnostic identifies the generic owner. Candidate placements:
   - `packages/engine/test/unit/agents/` for unsupported reason/counter telemetry.
   - `packages/engine/test/integration/` for preview-drive route or parity behavior.
   - `packages/engine/test/unit/kernel/` for generic publication, token/query, or continuation runtime behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds <bounded train residual seed set> --timeout-ms 400000 --date <YYYY-MM-DD>-phase-4e-train-choosenstep --profile-buckets`
3. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Implementation completed on 2026-05-16.

Outcome amended: 2026-05-16 after post-ticket-review archival.

Outcome amended: 2026-05-16 after Phase 4f archival.

Landed scope:
- Produced the bounded Phase 4e witness at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4e-train-choosenstep-baseline.md` and `.csv`.
- Produced `reports/174-phase-4e-train-choosenstep-residual.md`.
- Classified the dominant `train:chooseNStep` residual as `agent-guided-completion` / `production-deep-choosenstep-continuation.pickInnerDecision`: the completion policy selects a non-`chooseNStep` continuation decision, while the current deep WASM continuation path only lowers `chooseNStep` continuations.
- Retained no runtime code because the safe implementation owner is a broader generic continuation-ABI/runtime coverage slice, not a Phase 4e micro-optimization.
- Created `archive/tickets/174WASMDEEPPRV-017.md` as the next non-overlapping owner for generic non-`chooseNStep` deep continuation materialization; that owner has now completed route/support coverage without a Phase 4 performance-gate pass.
- Updated `archive/specs/174-wasm-preview-drive-coverage-extension.md` with the Phase 4e diagnostic result and Phase 4f ticket-list parity.

Residual classification:
- Seed `1005` completed terminal in `62297.98 ms` across `790` decisions.
- WASM production preview-drive route count `12`, unsupported count `519`, batch count `199`.
- `train:chooseNStep:add | continuedDeepening`: total `15159.23 ms`, route count `2`, unsupported count `148`, batch count `0`.
- `train:chooseNStep:confirm | continuedDeepening`: total `10001.11 ms`, route count `8`, unsupported count `97`, batch count `0`.
- Dominant reason rows: `train:chooseNStep:add` recorded `143` and `train:chooseNStep:confirm` recorded `94` occurrences of `deep preview-drive selected a non-chooseNStep continuation decision` under `production-deep-choosenstep-continuation.pickInnerDecision`.
- Smaller terminal-boundary rows remain: `train:chooseNStep:add` recorded `5` and `train:chooseNStep:confirm` recorded `3` occurrences of `deep preview-drive reached a terminal boundary before materializing a WASM projected state`.

Generated/artifact fallout:
- Checked-in report and CSV artifacts only.
- No schema, golden, GameSpecDoc, WASM ABI, generated JSON, source, or test diff is retained in this ticket.

Command ledger:
- Test Plan | `pnpm -F @ludoforge/engine build` | ran before the bounded witness; passed.
- Test Plan | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds <bounded train residual seed set> --timeout-ms 400000 --date <YYYY-MM-DD>-phase-4e-train-choosenstep --profile-buckets` | substituted with bounded seed `1005` and exact date stem `2026-05-16-phase-4e-train-choosenstep-baseline`; passed and wrote the Phase 4e witness Markdown/CSV.
- Test Plan | `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` | split and ran as `pnpm turbo test`, `pnpm turbo lint`, and `pnpm turbo typecheck`; all passed from Turbo cache. Cache classification: cache-covered for this diagnostic/report-only ticket because no source, test, schema, generated runtime artifact, GameSpecDoc, or package code changed.
- Ticket graph integrity | `pnpm run check:ticket-deps` | passed after terminal status and successor/spec graph edits: `Ticket dependency integrity check passed for 3 active tickets and 2365 archived tickets.`

Source-size ledger:
- No source file was edited.

Late-edit proof validity:
- The post-witness edits are report/ticket/spec/successor transcription and ownership classification only; they do not alter runtime code, command semantics, measured threshold, or witness artifacts. The bounded witness remains valid as diagnostic evidence for the final source state because no source or test diff was retained.
- No-invalidation: this terminal status/proof transcription records already-run proof and the already-written Phase 4e owner map; it does not change scope, acceptance, command semantics, touched-file ownership, follow-up ownership, or dependency classification.
- No-invalidation: the ticket-dependency result transcription is exact command-result recording only and does not change graph edges or status.

Archive status: archived by `$post-ticket-review` on 2026-05-16.
Next workflow: Phase 4f completed in `archive/tickets/174WASMDEEPPRV-017.md`; `archive/tickets/174WASMDEEPPRV-010.md` remains rejected until a later measured gate records a Pass.
