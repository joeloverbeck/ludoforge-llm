# 174WASMDEEPPRV-003: Phase 1b — Bounded decision-stack publication ABI

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — Rust `policy-vm` ABI + TS bridge
**Deps**: `archive/tickets/174WASMDEEPPRV-001.md`

## Problem

The chooseNStep:add and chooseNStep:confirm decision sequences dominate the slow-tier wall time per the post-008 witness (`train:chooseNStep:add` 1505 ms mean / 3792 ms max; `train:chooseNStep:confirm` 574 ms mean / 3409 ms max). These classes require bounded decision-stack publication semantics that the current WASM ABI does not represent — the TS runtime publishes a bounded sequence of decision frames per microturn, and without ABI support for that publication shape the WASM route falls closed for these classes. Phase 0 (ticket 001) inventories the exact unsupported reason strings; this ticket extends the ABI to encode them.

## Assumption Reassessment (2026-05-15)

1. Confirmed the existing Rust preview-drive ABI (`preview_drive.rs:31-180`) encodes outcomes and preview-state values per option but does not represent intra-option decision-stack frames.
2. Confirmed the TS side's bounded decision-stack publication is constructed by the runtime ahead of preview drive; the WASM route currently fails closed when this publication is non-trivial.
3. Phase 0 inventory (ticket 001) will name the specific unsupported-class strings this ticket closes.

## Architecture Check

1. Without decision-stack publication ABI, the hottest microturn classes (`*:chooseNStep:*` per witness) cannot route through WASM — closing this surface unlocks the largest residual wall-time contributor.
2. Engine-agnostic (F#1): decision-stack frames are generic — identity, depth, frame data — and carry no FITL-specific structure.
3. Bounded computation (F#10): all decision-stack frames are statically bounded by the existing publication budget; ABI rejects malformed inputs deterministically.
4. No backwards-compatibility shim (F#14): new ABI fields ship as a versioned extension; ABI version is bumped jointly with ticket 002's bump or in a separate version step coordinated with 002.

## What to Change

### 1. Rust ABI extension

In `packages/engine-wasm/policy-vm/src/preview_drive.rs` and `packages/engine-wasm/policy-vm/src/lib.rs`:
- Encode bounded decision-stack frames per option: frame identity, frame depth, deterministic ordering, max-depth bound.
- Validate identity, version, bounded counts; malformed buffers fail closed with a stable reason string.

### 2. TS bridge encoding

In `policy-wasm-production-preview-drive.ts`, `policy-wasm-production-preview-drive-types.ts`, `policy-wasm-production-preview-drive-lowering.ts`:
- Add type definitions for the decision-stack publication shape.
- Encode the TS-side publication into the WASM input buffer.
- Decode WASM output to confirm frame-identity round-trip.

### 3. Round-trip ABI test

`packages/engine/test/unit/agents/policy-wasm-preview-decision-stack-publication-abi.test.ts` (`@test-class: architectural-invariant`): for each combination of stack depth × frame variant within the bounded budget, encode → evaluate → decode and assert byte-equivalent stack representation. Malformed buffers fail closed deterministically.

## Files to Touch

- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-lowering.ts` (modify)
- `packages/engine/test/unit/agents/policy-wasm-preview-decision-stack-publication-abi.test.ts` (new)

## Out of Scope

- No production route activation (ticket 008).
- No signal-carrier work (ticket 002), preview-state slot work (ticket 004), candidate grouping (ticket 005), or completion semantics (ticket 006).
- No FITL-specific identifiers.

## Acceptance Criteria

### Tests That Must Pass

1. New round-trip ABI test passes.
2. Engine suite green: `pnpm turbo build && pnpm turbo test`.
3. Determinism gates green (same list as ticket 002).

### Invariants

1. Decision-stack frames round-trip byte-equivalently between TS and WASM for every bounded depth × variant in the Phase 0 inventory.
2. Malformed buffers fail closed with a stable reason string (no silent coercion).
3. Bounded by existing publication budget — no new budget surface introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-wasm-preview-decision-stack-publication-abi.test.ts` — round-trip parity for bounded decision-stack frames.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-decision-stack-publication-abi.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome (2026-05-15)

Phase 1b implementation landed the bounded decision-stack publication ABI substrate:

- ABI identity: `POLICY_WASM_ABI_VERSION` / Rust `ABI_VERSION` moved from `11` to `12`; preview-drive layout id moved from `0x1500_0014` to `0x1500_0015`.
- Rust preview-drive ABI now reads and validates per-candidate decision-stack publication metadata: max-depth bound, deterministic frame ordering by depth, non-negative frame identity/turn identity, nullable parent frame identity, generic frame variant, and stable context identity code. Malformed frame variants or invalid bounds fail closed with `STATUS_BAD_OPERAND` (`-12`).
- TS preview-drive codec now exposes `PolicyWasmDecisionStackPublication`, encodes it per candidate, allocates a dedicated output mirror, and decodes the round-tripped frame representation without changing kernel publication semantics.
- Production preview-drive lowering forwards candidate-level publication metadata into the existing preview-drive batch shape. `policy-wasm-production-preview-drive.ts` required no code change because its compile step already returns candidate batches through the lowering seam; production route activation remains owned by `tickets/174WASMDEEPPRV-008.md`.
- New architectural-invariant test `packages/engine/test/unit/agents/policy-wasm-preview-decision-stack-publication-abi.test.ts` covers depth x frame-variant round-trip plus malformed-buffer rejection.

Touched-file correction:

- Added live codec/runtime files not named in the draft `Files to Touch`: `packages/engine/src/agents/policy-wasm-preview-drive.ts` and `packages/engine/src/agents/policy-wasm-runtime.ts`.
- Named file verified-no-edit: `packages/engine/src/agents/policy-wasm-production-preview-drive.ts`.
- Generated fallout: WASM artifact rebuilt for verification; no checked-in schema, JSON schema, golden, or compiled GameDef artifact changed.

Source-size ledger:

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor |
|---|---:|---:|---|---|---|---|
| `packages/engine-wasm/policy-vm/src/lib.rs` | 1307 | 1307 | no; preexisting over guidance | version mirror only | canonical ABI/version hub; extraction would obscure the ticket seam | none |
| `packages/engine/src/agents/policy-wasm-runtime.ts` | 1353 | 1369 | no; preexisting over guidance | output buffer plumbing only | canonical WASM runtime bridge; extraction would widen this ABI ticket | none |

Verification:

- `cargo fmt --manifest-path packages/engine-wasm/policy-vm/Cargo.toml` — passed.
- `pnpm -F @ludoforge/engine-wasm build` — passed.
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-decision-stack-publication-abi.test.js` — passed before and after final broad lanes; final run passed 2/2 tests.
- `pnpm turbo build` — passed. Advisory emissions classified non-ticket-owned: existing runner chunk-size warning and Turbo `@ludoforge/engine-wasm#build` output-key warning.
- `pnpm turbo test` — passed: 5/5 tasks successful, with 3 cached prerequisite build tasks and both package test tasks executed.
- `pnpm turbo lint` — passed: 2/2 tasks successful, runner lint cache-hit supplemental.
- `pnpm turbo typecheck` — passed: 3/3 tasks successful, engine build cache-hit supplemental.
- `pnpm -F @ludoforge/engine test:determinism` — passed: 23/23 files.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence*.test.js` — passed: 11/11 tests.

Late-edit proof validity: terminal status and exact proof transcription only; no scope, acceptance, command semantics, touched-file ownership, follow-up ownership, or dependency classification changed after the final proof set. The focused compiled-output ABI test was rerun after the final Turbo lanes.
