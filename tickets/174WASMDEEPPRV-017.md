# 174WASMDEEPPRV-017: Phase 4f — Materialize non-chooseNStep deep continuation decisions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — generic deep preview-drive continuation ABI/runtime and parity coverage
**Deps**: `archive/tickets/174WASMDEEPPRV-016.md`, `reports/174-phase-4e-train-choosenstep-residual.md`

## Problem

`reports/174-phase-4e-train-choosenstep-residual.md` shows that the bounded seed-1005 Phase 4e sample is dominated by `train:chooseNStep:add | continuedDeepening` and `train:chooseNStep:confirm | continuedDeepening`. The dominant unsupported owner is `production-deep-choosenstep-continuation.pickInnerDecision`: the completion policy selects a non-`chooseNStep` continuation decision, while the current deep WASM continuation path only lowers `chooseNStep` continuations.

This ticket owns the next non-overlapping generic implementation slice. It must either materialize the selected non-`chooseNStep` continuation decisions through the WASM/host continuation contract with TypeScript parity, or prove a smaller generic substrate that reduces the same owner without hiding unsupported provenance.

## Assumption Reassessment (2026-05-16)

1. `archive/tickets/174WASMDEEPPRV-016.md` completed diagnostic classification only; no runtime candidate was retained.
2. The Phase 4e bounded witness recorded seed `1005` wall time `62297.98 ms`, `train:chooseNStep:add` total `15159.23 ms`, and `train:chooseNStep:confirm` total `10001.11 ms`.
3. The dominant unsupported rows were `agent-guided-completion` / `production-deep-choosenstep-continuation.pickInnerDecision`, not a malformed `chooseNStep` state-patch row.

## Architecture Check

1. Foundation #20 requires the unsupported/fallback rows to remain explicit. Support for new continuation classes must not let fallback success count as route activation.
2. Foundation #1 forbids FITL-specific train/card/faction branches. The implementation must operate on generic published microturn decisions and state patches.
3. Foundation #14 keeps `tickets/174WASMDEEPPRV-010.md` rejected until a later measured gate records a Pass; this ticket must not delete A/B wiring or flip defaults.

## What to Change

### 1. Continuation support inventory

Inspect the non-`chooseNStep` decisions selected by `pickInnerDecision` inside `continuedDeepening` for the `train:chooseNStep` residual. Classify each decision kind, state-patch requirement, and unsupported/fail-closed reason before changing runtime code.

### 2. Generic continuation materialization

Extend the generic deep preview-drive continuation contract only for decision classes that can be represented deterministically through the existing GameDef, microturn, and state-patch model. Candidate owners include `chooseOne` continuation materialization or a shared apply-published-decision patch substrate.

### 3. Parity and activation proof

Prove TypeScript/WASM parity for every newly supported continuation class, including projected state, drive depth, outcome, candidate ordering, and Foundation-20 preview carriers. Prove route activation separately from fallback classification.

### 4. Bounded Phase 4f witness

Rerun the bounded seed-1005 witness and record whether the `production-deep-choosenstep-continuation.pickInnerDecision` unsupported rows decreased without moving the cost into an unowned bucket.

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify)
- `packages/engine/src/agents/policy-wasm-preview-drive-state-patch.ts` or adjacent state-patch codecs (modify only if the selected continuation class needs a new generic patch)
- `packages/engine/src/agents/policy-wasm-preview-drive.ts` (modify only if ABI rows need new generic continuation fields)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify only if host/guest route plumbing changes)
- `packages/engine-wasm/policy-vm/src/` (modify only if guest ABI support is needed)
- `packages/engine/test/**` (add or modify focused parity/activation tests)
- `reports/174-phase-4f-non-choosenstep-continuation.md` (new)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>-phase-4f-non-choosenstep-continuation-*.md` (new bounded witness report)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>-phase-4f-non-choosenstep-continuation-*.csv` (new bounded witness CSV)
- `specs/174-wasm-preview-drive-coverage-extension.md` (modify for outcome/ticket-list parity)

## Out of Scope

- No default flip or A/B wiring deletion; `tickets/174WASMDEEPPRV-010.md` remains rejected until a later measured gate records a Pass.
- No FITL-specific identifiers, train/card branches, faction branches, or profile-name checks in runtime code.
- No GameSpecDoc, policy profile, `depthCap`, `maxOptions`, `chooseNBeamWidth`, or `capClass` changes.
- No broad 15-seed final gate rerun unless the bounded Phase 4f evidence justifies it and the ticket outcome records the exact command.

## Acceptance Criteria

### Tests That Must Pass

1. A focused parity test proves each newly supported non-`chooseNStep` continuation class materializes the same projected state and preview outcome as the TypeScript path.
2. A route activation witness proves newly supported continuation rows increment route counts and no longer appear as `production-deep-choosenstep-continuation.pickInnerDecision` unsupported rows.
3. A bounded witness report records before/after `train:chooseNStep:add` and `train:chooseNStep:confirm` values, route counts, unsupported counts, batch counts, and reason-granular unsupported rows.
4. Existing engine suite remains green: `pnpm turbo test`.

### Invariants

1. Unsupported/fallback rows cannot count as supported WASM route activation.
2. Retained changes remain game-agnostic and deterministic across GameDef, state, seed, and actions.
3. Foundation #20 carriers and unavailable-preview provenance remain explicit across any changed deep continuation path.

## Test Plan

### New/Modified Tests

1. Add focused tests under `packages/engine/test/unit/agents/` or `packages/engine/test/integration/` after the supported continuation class is selected.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date <YYYY-MM-DD>-phase-4f-non-choosenstep-continuation --profile-buckets`
3. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
