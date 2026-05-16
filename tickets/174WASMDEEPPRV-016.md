# 174WASMDEEPPRV-016: Phase 4e — Diagnose train chooseNStep unsupported deepening residuals

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — diagnostic telemetry and generic preview-drive/deepening runtime only after measured owner is confirmed
**Deps**: `archive/tickets/174WASMDEEPPRV-015.md`, `reports/174-phase-4d-zero-counter-residual.md`

## Problem

Spec 174 still cannot reopen the default-flip path in `tickets/174WASMDEEPPRV-010.md`. The Phase 4d zero-counter owner reduced `coupArvnRedeployPolice:chooseOne | continuedDeepening` from the dominant residual to rank 3 in the bounded seed-1005 witness, but the same report says the bounded sample is now dominated by reason-granular unsupported `train:chooseNStep:add` and `train:chooseNStep:confirm` continued-deepening classes.

This ticket owns the next non-overlapping Phase 4 slice: diagnose those `train:chooseNStep` unsupported classes, determine whether they are actionable generic WASM preview-drive coverage, generic deep-continuation runtime work, or a measurement-boundary blocker, and retain only a proven generic improvement. It does not reopen the rejected default flip.

## Assumption Reassessment (2026-05-16)

1. `tickets/174WASMDEEPPRV-010.md` is rejected because `reports/174-phase-4-gate-decision.md` recorded a Fail verdict; no default flip or A/B deletion is authorized until a later gate records a Pass.
2. `archive/tickets/174WASMDEEPPRV-015.md` completed the zero-counter owner slice and archived after reducing the previously dominant `coupArvnRedeployPolice:chooseOne | continuedDeepening` residual.
3. `reports/174-phase-4d-zero-counter-residual.md` now names reason-granular unsupported `train:chooseNStep:add` and `train:chooseNStep:confirm` continued-deepening classes as the dominant bounded-sample residual, so a new ticket is needed instead of reusing 010.

## Architecture Check

1. Foundation #20 requires unsupported preview-drive provenance to stay explicit. This ticket must preserve reason-granular unsupported/fallback evidence instead of letting fallback success count as WASM activation.
2. Foundation #1 forbids FITL-specific runtime branches. Any retained implementation must be generic over encoded preview-drive, chooseNStep continuation, token/query, or publication mechanics.
3. Foundation #14 keeps `tickets/174WASMDEEPPRV-010.md` rejected until the measured gate passes; this ticket may produce the evidence or implementation needed for a later gate, but it does not delete A/B wiring or flip defaults.

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
- `specs/174-wasm-preview-drive-coverage-extension.md` (modify for outcome/ticket-list parity)

## Out of Scope

- No default flip or A/B wiring deletion; `tickets/174WASMDEEPPRV-010.md` remains rejected until a later measured gate records a Pass.
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
