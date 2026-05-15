# 174WASMDEEPPRV-005: Phase 1d — Candidate grouping ABI

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — Rust `policy-vm` ABI + TS bridge
**Deps**: `archive/tickets/174WASMDEEPPRV-001.md`

## Problem

The `continuedDeepening` preview generates candidate groups — option subsets sharing a common decision-stack prefix that the broad pass evaluates jointly. The current ABI evaluates candidates flat; no grouping metadata crosses the FFI boundary, so the WASM route cannot honour grouping-dependent semantics (shared budget across a group, group-aware ordering). Phase 0 inventory (ticket 001) confirms which classes fail closed today because of missing candidate-grouping ABI.

## Assumption Reassessment (2026-05-15)

1. Confirmed the Rust ABI evaluates per-option without group identity (`preview_drive.rs:69-180`).
2. Confirmed TS-side candidate grouping logic exists in the broad-phase score routing; the WASM route currently strips it before the FFI call.
3. Phase 0 inventory (ticket 001) will identify which unsupported-class strings this ticket closes.

## Architecture Check

1. Without group-aware ABI, the WASM route cannot encode group-shared-budget semantics — closing this surface preserves the TS semantics under WASM evaluation.
2. Engine-agnostic (F#1): grouping is encoded as `(candidate_id, group_id)` tuples — no game-specific structure.
3. Determinism (F#8): intra-group ordering is deterministic and canonical; ABI enforces stable ordering.
4. No backwards-compatibility shim (F#14): new fields ship as a versioned ABI extension.

## What to Change

### 1. Rust ABI extension

In `packages/engine-wasm/policy-vm/src/preview_drive.rs` and `packages/engine-wasm/policy-vm/src/lib.rs`:
- Encode candidate grouping: per-candidate group id, group boundary markers, deterministic intra-group ordering.
- Validate that grouping metadata is internally consistent — invalid groupings fail closed with stable reason strings.

### 2. TS bridge encoding

In `policy-wasm-production-preview-drive.ts`, `policy-wasm-production-preview-drive-types.ts`, `policy-wasm-production-preview-drive-lowering.ts`:
- Add type definitions for grouping metadata.
- Derive grouping from the existing TS-side preview model and write it into the WASM input buffer.

### 3. Round-trip ABI test

`packages/engine/test/unit/agents/policy-wasm-preview-candidate-grouping-abi.test.ts` (`@test-class: architectural-invariant`): for each group count × group size variant within bounded budgets, encode → evaluate → decode and assert byte-equivalent grouping in output ordering.

## Files to Touch

- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-lowering.ts` (modify)
- `packages/engine/test/unit/agents/policy-wasm-preview-candidate-grouping-abi.test.ts` (new)

## Out of Scope

- No production route activation (ticket 008).
- No signal-carrier work (002), decision-stack publication (003), preview-state slots (004), or completion semantics (006).

## Acceptance Criteria

### Tests That Must Pass

1. New round-trip ABI test passes.
2. Engine suite green.
3. Determinism gates green (same list as ticket 002).

### Invariants

1. Intra-group ordering is deterministic and stable across encode → evaluate → decode.
2. Invalid grouping metadata fails closed with stable reason strings.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-wasm-preview-candidate-grouping-abi.test.ts` — grouping round-trip parity.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-candidate-grouping-abi.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-16

Implemented the candidate-grouping ABI as a versioned preview-drive extension:

1. Bumped the policy WASM ABI from `13` to `14` and the preview-drive layout from `0x1500_0016` to `0x1500_0017`.
2. Added per-candidate group metadata words `(group_id_code, ordinal_in_group, group_size)` to the TS encoder, Rust FFI call, Rust validator, Rust mirror output, and TS decoder.
3. Forwarded production preview-drive candidate grouping through the existing lowering path and the score-routing broad-pass grouping source.
4. Added architectural-invariant ABI coverage for deterministic group round-trip variants and malformed grouping rejection.
5. Updated adjacent raw ABI tests for the new FFI argument shape and output buffer.

Post-review correction (2026-05-16): tightened the TS candidate-group decoder so mirrored group metadata is byte-equivalent across all group fields, not just the group id. The decoder now rejects mismatched ordinal or size metadata from the WASM output buffer, and the ABI test includes a focused regression assertion for that mismatch.

Boundary corrections against the original draft:

1. The live production bridge did not need direct edits in `packages/engine/src/agents/policy-wasm-production-preview-drive.ts`; grouping is carried through `policy-wasm-production-preview-drive-types.ts`, `policy-wasm-production-preview-drive-lowering.ts`, and `policy-wasm-score-routing.ts`.
2. The existing WASM ABI fail-closed path reports stable numeric statuses, not reason strings. Malformed grouping metadata now fails closed with `STATUS_BAD_OPERAND` (`-12`), matching the established raw ABI pattern instead of adding a new string-reason channel.
3. No production route activation or completion-semantics behavior was added; those remain out of scope for later 174 tickets.

Source-size ledger:

1. `packages/engine-wasm/policy-vm/src/preview_drive.rs`: 615 -> 694 lines. The growth is ticket-owned ABI parsing, validation, and mirror output; still below the 800-line hard cap.
2. `packages/engine-wasm/policy-vm/src/lib.rs`: 1307 -> 1307 lines. Preexisting over-guidance export hub; only the ABI version constant changed.
3. `packages/engine/src/agents/policy-wasm-preview-drive.ts`: 665 -> 742 lines. The growth is ticket-owned shared encoder/decoder surface plus post-review mirror-validation tightening; still below the 800-line hard cap.
4. `packages/engine/src/agents/policy-wasm-runtime.ts`: 1378 -> 1388 lines. Preexisting over-guidance WASM runtime bridge; the active growth is limited to the new FFI buffer/argument plumbing.
5. `packages/engine/src/agents/policy-wasm-score-routing.ts`: 566 -> 580 lines. The growth is the minimal route from existing candidate data to deterministic action groups.

Verification:

1. `cargo fmt --manifest-path packages/engine-wasm/policy-vm/Cargo.toml` — passed.
2. `pnpm -F @ludoforge/engine-wasm build` — passed.
3. `pnpm -F @ludoforge/engine build` — passed.
4. `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-candidate-grouping-abi.test.js` — passed before and after the broad lanes.
5. `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-state-slots-abi.test.js` — passed.
6. `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-decision-stack-publication-abi.test.js` — passed.
7. `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-signal-carriers.test.js` — passed.
8. `pnpm -F @ludoforge/engine test:determinism` — passed (`23/23` files).
9. `pnpm turbo build` — passed. Advisory only: existing runner chunk-size warning and Turbo's engine-wasm no-output warning.
10. `pnpm turbo test` — passed (`5/5` tasks; engine `81/81` files; runner `205` files / `2019` tests). Broad test prerequisites replayed from the immediately preceding build cache; engine and runner test tasks executed. Existing runner jsdom canvas/recovery stderr appeared.
11. `pnpm turbo lint` — passed (`2/2` tasks; runner lint cached, engine lint executed).
12. Post-review focused regression red step: `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-candidate-grouping-abi.test.js` — failed before the decoder fix because mirrored ordinal mismatch was accepted.
13. Post-review focused ABI proof: `pnpm -F @ludoforge/engine build`, `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-candidate-grouping-abi.test.js`, `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-state-slots-abi.test.js`, and `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-decision-stack-publication-abi.test.js` — passed.
14. Post-review broad acceptance proof: `pnpm turbo build` — passed (`3/3` tasks; engine-wasm build cached). Advisory only: existing runner chunk-size warning.
15. Post-review broad acceptance proof: `pnpm turbo lint` — passed (`2/2` tasks; runner lint cached, engine lint executed).
16. Post-review broad acceptance proof: `pnpm turbo typecheck` — passed (`3/3` tasks; engine build cached, engine and runner typecheck executed).
17. Post-review broad acceptance proof: `pnpm turbo test` — passed (`5/5` tasks; engine `81/81` files; runner `205` files / `2019` tests). Broad build prerequisites replayed from the immediately preceding build cache; engine and runner test tasks executed. Existing runner jsdom canvas/recovery/ticker stderr appeared.

Final post-review ticket edits after the refreshed proof only transcribed the review correction, updated source-size counts, and copied exact proof results; no further code/test/scope changes followed those refreshed lanes.
