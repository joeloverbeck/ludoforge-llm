# 174WASMDEEPPRV-013: Phase 3b prerequisite - chooseNStep continuation state-patch ABI

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes - generic chooseNStep continuation compiler/materialization ABI, TypeScript host bridge, Rust preview-drive mirror
**Deps**: `archive/tickets/174WASMDEEPPRV-012.md`

## Problem

`tickets/174WASMDEEPPRV-011.md` cannot truthfully wire `runDeepPass` to consume WASM-produced projected state yet. The archived 012 substrate landed a generic state-patch/materialization ABI for the existing production preview-drive compiler, but that compiler is still rooted in root action `Move` / action-pipeline programs. `runDeepPass` operates on already-published `chooseNStep` microturn continuations and currently derives its projected states by calling `continueChooseNStepInnerPreviewDrive`.

Using TypeScript to apply the deep `chooseNStep` continuation and then counting a WASM row would make host-produced state look like accelerated-route activation. This violates Foundations #5, #9, #16, and #20.

This ticket lands the missing prerequisite: a generic WASM/host representation for `chooseNStep` continuation materialization so ticket 011 can consume the WASM-produced projected `GameState` without TypeScript being the hidden state producer.

## Assumption Reassessment (2026-05-16)

1. `archive/tickets/174WASMDEEPPRV-012.md` added ABI version 16, state-patch op encoding, TypeScript host materialization, and action-pipeline-rooted state-patch proof.
2. Live `compileProductionPreviewDrive` still selects one shared action program from candidate `actionId` / `move.actionId`; it does not compile a published `chooseNStep` continuation decision.
3. Live `runDeepPass` still calls `continueChooseNStepInnerPreviewDrive`, which publishes the next microturn, picks the next inner decision, and applies `chooseNStep` decisions in TypeScript.
4. `tickets/174WASMDEEPPRV-011.md` was reassessed on 2026-05-16 and blocked because 012 is not sufficient to prove that WASM produced the deep projected state consumed by `runDeepPass`.

## Architecture Check

1. Foundation #5: continuation materialization must remain part of the one rules protocol; the WASM route must represent the same published `chooseNStep` decision semantics as the TypeScript reference.
2. Foundations #9 and #16: activation can be counted only when the route produces the projected state consumed by the public deep-preview result, with a byte-equivalent TypeScript oracle.
3. Foundation #20: preview status, no-signal, unavailable, fallback, and depth-cap provenance must remain explicit when a continuation is unsupported or when no usable deep signal is produced.
4. Foundation #1: the ABI must stay game-agnostic. It may encode generic published microturn/decision/state-patch data; it must not inspect FITL identifiers, authored profile names, or game-specific rule concepts.

## What to Change

### 1. chooseNStep continuation compiler boundary

Add a generic host-side lowering path that can encode a supported `chooseNStep` continuation from the published microturn and candidate decision into preview-drive ABI input.

The boundary must include:
- decision key/context identity required to validate the continuation;
- selected/add/confirm command classification;
- candidate stable keys and ordering;
- bounded depth/cap metadata;
- completion/fallback provenance needed for the public `PolicyPreviewDriveTrace`.

Unsupported continuation shapes must fail closed with stable owner/reason strings.

### 2. WASM state-patch production for continuations

Extend the preview-drive ABI/Rust mirror only as needed for `chooseNStep` continuation state-patch production. The output must be materializable by the existing TypeScript state-patch host decoder or by a narrowly extended generic decoder.

Supported rows must include the state patch that reconstructs the projected `GameState` consumed by `runDeepPass`; unsupported rows must not increment supported activation.

### 3. Source-size gate resolution

Resolve the inherited source-size gate before this prerequisite completes. The previous substrate left the canonical TypeScript/Rust preview-drive hubs over the repo's 800-line guidance; this continuation ABI work touches the same hubs and must either:
- extract a narrow helper/module that reduces or stops active growth in the oversized hubs, or
- use a user-approved 1-3-1 deferral recorded in this ticket and in `tickets/174WASMDEEPPRV-011.md` before terminal closeout.

### 4. Focused prerequisite tests

Add focused tests proving:
- supported `chooseNStep` continuation rows return a WASM-produced state patch;
- unsupported continuation classes fail closed with explicit owner/reason provenance;
- materialized projected states are byte-equivalent to the TypeScript `continueChooseNStepInnerPreviewDrive` reference through `serializeGameState`;
- activation counters remain zero for unsupported continuation classes.

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify only if a small probe/wiring helper is required; production consumption remains ticket 011)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` (modify or extract shared continuation helpers as needed)
- `packages/engine/src/agents/policy-wasm-preview-drive.ts` (modify or extract ABI helper)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify if FFI call shape or counters change)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify or split continuation lowering from action-pipeline lowering)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` (modify)
- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify or split ABI helper)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify if ABI export shape/version changes)
- `packages/engine/test/unit/agents/` (new/modified ABI/unsupported tests)
- `packages/engine/test/integration/` (new/modified continuation projected-state parity tests)

## Out of Scope

- No production `runDeepPass` activation/consumption flip; ticket 011 owns consuming this prerequisite.
- No Phase 4 measurement or default flip; tickets 009 and 010 remain gated on 011.
- No FITL-specific code.
- No policy-profile retuning or GameSpecDoc changes.

## Acceptance Criteria

### Tests That Must Pass

1. New `chooseNStep` continuation ABI/materialization tests pass.
2. Unsupported continuation classes fail closed with stable provenance and do not increment supported activation.
3. TypeScript and WASM materialized continuation projected states are byte-equivalent through `serializeGameState`.
4. Existing state-patch materialization test from ticket 012 remains green.
5. Engine suite green: `pnpm turbo build && pnpm turbo test`.
6. Determinism gates green (same list as ticket 002).

### Invariants

1. No supported activation is counted unless WASM produced the projected state consumed by the continuation materialization witness.
2. The continuation ABI is generic and bounded; it contains no game-specific identifiers beyond normal serialized `GameDef`/microturn/action/decision ids.
3. Unsupported, hidden, stochastic, failed, depth-capped, and no-signal classes remain explicit and cannot silently contribute scalar preview values.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/` continuation ABI/fail-closed tests - prove malformed and unsupported continuation surfaces are rejected deterministically.
2. `packages/engine/test/integration/` continuation projected-state parity test - compares WASM-materialized projected states with `continueChooseNStepInnerPreviewDrive` through `serializeGameState`.

### Commands

1. `pnpm -F @ludoforge/engine-wasm build`
2. `pnpm -F @ludoforge/engine build && node --test <compiled continuation projected-state parity test>`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
4. `pnpm run check:ticket-deps`
