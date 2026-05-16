# 174WASMDEEPPRV-004: Phase 1c — Preview-state slot ABI extensions

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — Rust `policy-vm` ABI + TS bridge
**Deps**: `archive/tickets/174WASMDEEPPRV-001.md`

## Problem

The current preview-drive ABI's `preview_state` buffer (`preview_drive.rs:37-38`, `preview_drive.rs:100-104`) is fixed at a per-call slot count, and Rust uses operations like `add_to_primary_preview_state_value` / `set_primary_preview_state_value` that target a single primary slot. For `continuedDeepening` / `deep1024` configs, the deep pass requires extended preview-state slot semantics: multi-slot publication, slot lifetime across deepening iterations, and slot identity stable across rebroadcast. Without these extensions, the deep-phase route falls closed for any config whose preview-state slot count exceeds 1 or whose slots reuse across iterations.

## Assumption Reassessment (2026-05-15)

1. Confirmed `preview_drive.rs:100-118` allocates a `preview_state_slot_count`-sized vector per call and reads `cursor` for slot values; there is no multi-slot lifetime concept.
2. Confirmed TS-side preview-state slot wiring lives in `policy-wasm-production-preview-feature-slots.ts` and `policy-wasm-production-preview-values.ts` — the extension surface spans both files plus the Rust ABI.
3. Phase 0 inventory (ticket 001) names which classes fail closed today specifically because of single-slot ABI assumptions.

## Architecture Check

1. Multi-slot publication and slot-lifetime semantics are required by `continuedDeepening` / `deep1024` shape — closing this surface unblocks the deep-phase route for the relevant Phase 0 classes.
2. Engine-agnostic (F#1): slot semantics are encoded as `(slot_id, slot_kind, value, lifetime)` tuples — no game-specific structure.
3. Bounded computation (F#10): slot counts and lifetimes are bounded by the existing `capClass` (`deep1024`); ABI rejects out-of-bound inputs deterministically.
4. No backwards-compatibility shim (F#14): new fields ship as a versioned ABI extension.

## What to Change

### 1. Rust ABI extension

In `packages/engine-wasm/policy-vm/src/preview_drive.rs` and `packages/engine-wasm/policy-vm/src/lib.rs`:
- Encode multi-slot publication: per-slot id, kind, value, lifetime (single-iteration vs cross-iteration).
- Support slot identity stable across rebroadcast — slot id remains canonical across deepening iterations.
- Add ABI-level rejection for out-of-bound slot counts or invalid lifetime markers.

### 2. TS bridge encoding

In `policy-wasm-production-preview-feature-slots.ts`, `policy-wasm-production-preview-values.ts`, `policy-wasm-production-preview-drive.ts`, `policy-wasm-production-preview-drive-types.ts`:
- Add type definitions for multi-slot publication shape.
- Write extended slot metadata into the WASM input buffer.
- Read back unchanged after evaluation.

### 3. Round-trip ABI test

`packages/engine/test/unit/agents/policy-wasm-preview-state-slots-abi.test.ts` (`@test-class: architectural-invariant`): for each combination of slot count × lifetime × kind within the bounded `deep1024` budget, encode → evaluate → decode and assert byte-equivalence. Out-of-bound configurations fail closed.

## Files to Touch

- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify)
- `packages/engine-wasm/policy-vm/src/lib.rs` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-feature-slots.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-values.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts` (modify)
- `packages/engine/test/unit/agents/policy-wasm-preview-state-slots-abi.test.ts` (new)

## Out of Scope

- No production route activation (ticket 008).
- No signal-carrier work (002), decision-stack publication (003), candidate grouping (005), or completion semantics (006).
- No change to the existing `capClass` value (`deep1024`); existing bounds remain authoritative.

## Acceptance Criteria

### Tests That Must Pass

1. New round-trip ABI test passes.
2. Engine suite green.
3. Determinism gates green (same list as ticket 002).

### Invariants

1. Slot identity stable across rebroadcast — round-trip preserves slot id ordering.
2. Out-of-bound slot counts or invalid lifetime markers fail closed with stable reason strings.
3. `capClass` (`deep1024`) remains the sole authority for slot-count bounds.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-wasm-preview-state-slots-abi.test.ts` — multi-slot × lifetime × kind round-trip parity.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-state-slots-abi.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome (2026-05-15)

Phase 1c implementation extends the preview-state slot ABI substrate without production route activation:

- ABI identity: `POLICY_WASM_ABI_VERSION` / Rust `ABI_VERSION` move from `12` to `13`; preview-drive layout id moves from `0x1500_0015` to `0x1500_0016`.
- Rust preview-drive ABI now reads and validates per-slot metadata as `(slot_id_code, slot_kind, slot_lifetime)` and mirrors that metadata back through a dedicated output buffer. Invalid slot kind/lifetime markers and slot counts above the current bounded `depthCap` fail closed with `STATUS_BAD_OPERAND` (`-12`).
- TS preview-drive codec now exposes `PolicyWasmPreviewStateSlot`, `PolicyWasmPreviewStateSlotKind`, and `PolicyWasmPreviewStateSlotLifetime`, encodes slot metadata, decodes the mirrored metadata, and continues keying `previewStateValues` by stable slot id.
- Production preview-drive input now carries typed slot descriptors. `policy-wasm-score-routing.ts`, the preview-drive profiler, and existing preview-drive tests were migrated from raw slot strings to typed descriptors so the repository does not retain the old raw-string ABI surface.
- New architectural-invariant test `packages/engine/test/unit/agents/policy-wasm-preview-state-slots-abi.test.ts` covers slot count x lifetime x kind round-trip, multi-slot value preservation, invalid lifetime rejection, and out-of-bound slot-count rejection.
- Production route activation remains explicitly deferred to `tickets/174WASMDEEPPRV-008.md`.

Post-review correction:

- Replaced the preview-state slot id ordering comparator in `packages/engine/src/agents/policy-wasm-score-routing.ts` with an ordinal string comparator. This keeps the touched WASM preview-drive route free of system-locale-dependent ordering while preserving the same canonical slot-id set and ABI shape.

Touched-file correction:

- Added live codec/runtime/route files not listed in the draft `Files to Touch`: `packages/engine/src/agents/policy-wasm-preview-drive.ts`, `packages/engine/src/agents/policy-wasm-runtime.ts`, `packages/engine/src/agents/policy-wasm-score-routing.ts`, `packages/engine/scripts/profile-fitl-preview-drive.mjs`, and existing ABI/unit tests that construct preview-drive batches.
- Named file verified-no-edit: `packages/engine/src/agents/policy-wasm-production-preview-values.ts`; the value helpers already consume slot ids through callers and required no separate ABI edit.
- Generated fallout: WASM artifact rebuilt for verification; no checked-in schema, JSON schema, golden, or compiled GameDef artifact is expected to change.

Source-size ledger:

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor |
|---|---:|---:|---|---|---|---|
| `packages/engine-wasm/policy-vm/src/preview_drive.rs` | 552 | 615 | no | ABI slot metadata validation/output | stays below cap; extracting the compact ABI reader/writer would obscure the current FFI seam | none |
| `packages/engine-wasm/policy-vm/src/lib.rs` | 1307 | 1307 | no; preexisting over guidance | version mirror only | canonical ABI/version hub; extraction is unrelated to this ticket | none |
| `packages/engine/src/agents/policy-wasm-preview-drive.ts` | 556 | 665 | no | slot metadata types/codec | below cap; helper extraction not needed yet | none |
| `packages/engine/src/agents/policy-wasm-runtime.ts` | 1369 | 1378 | no; preexisting over guidance | FFI output buffer plumbing | canonical WASM runtime bridge; extracting the call wrapper would widen the ABI ticket | none |
| `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` | 779 | 786 | no | typed production slot descriptor helper | near cap but below hard cap; helper is local to the production bridge seam | none |

Verification:

- `cargo fmt --manifest-path packages/engine-wasm/policy-vm/Cargo.toml` — passed.
- `pnpm -F @ludoforge/engine-wasm build` — passed.
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-state-slots-abi.test.js` — passed before and after final Turbo lanes; final run passed 2/2 tests.
- `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-decision-stack-publication-abi.test.js` — passed 2/2 tests.
- `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-signal-carriers.test.js` — passed 2/2 tests.
- `pnpm turbo build` — passed: 3/3 tasks successful, no cache hits. Advisory emissions classified non-ticket-owned: existing runner chunk-size warning and Turbo `@ludoforge/engine-wasm#build` output-key warning.
- `pnpm -F @ludoforge/engine test:determinism` — passed: 23/23 files.
- `pnpm turbo test` — passed: 5/5 tasks successful, with 3 cached build prerequisites and both package test tasks executed. Advisory emissions classified non-ticket-owned: runner jsdom canvas-not-implemented output and intentional crash-recovery stderr from runner tests.
- `pnpm turbo lint` — passed: 2/2 tasks successful, runner lint cache-hit supplemental.
- `pnpm turbo typecheck` — passed: 3/3 tasks successful, engine build cache-hit supplemental.
- Post-review `pnpm -F @ludoforge/engine build` — passed after the ordinal comparator cleanup.
- Post-review focused ABI reruns:
  - `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-state-slots-abi.test.js` — passed before and after the refreshed Turbo lanes; final rerun passed 2/2 tests.
  - `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-decision-stack-publication-abi.test.js` — passed 2/2 tests.
  - `node --test packages/engine/dist/test/unit/agents/policy-wasm-preview-signal-carriers.test.js` — passed 2/2 tests.
- Post-review `pnpm turbo build` — passed: 3/3 tasks successful, with `@ludoforge/engine-wasm#build` cache-hit replay and the existing runner large-chunk advisory classified non-ticket-owned.
- Post-review `pnpm -F @ludoforge/engine test:determinism` — passed: 23/23 files.
- Post-review `pnpm turbo test` — passed: 5/5 tasks successful, with 3 cached build prerequisites and both package test tasks executed. Existing runner jsdom canvas and intentional crash-recovery stderr advisories remain non-ticket-owned.
- Post-review `pnpm turbo lint` — passed: 2/2 tasks successful, runner lint cache-hit supplemental.
- Post-review `pnpm turbo typecheck` — passed: 3/3 tasks successful, engine build cache-hit supplemental.

Late-edit proof validity: terminal status, post-review ordinal comparator cleanup, and exact proof transcription only; no scope, acceptance, command semantics, touched-file ownership, follow-up ownership, or dependency classification changed after the final proof set. The focused compiled-output slot ABI test was rerun after final Turbo lanes.
