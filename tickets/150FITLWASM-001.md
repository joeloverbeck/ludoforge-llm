# 150FITLWASM-001: Phase 5 WASM architecture and ABI skeleton

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new WASM package/build path plus engine bridge skeleton
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `tickets/149FITLEVNUMVM-022.md`

## Problem

Spec 149 Phase 4B missed the original evolution-readiness budget after the TypeScript policy VM and generic runtime-closure slices landed. The final VM-on same-seam profile was `6702.65 ms` per card against the `<=250 ms` target. More TypeScript-local tuning is no longer the Foundation-aligned default; this ticket starts the Phase 5 Rust/WASM owner without weakening the target.

## Assumption Reassessment (2026-05-02)

1. Ticket `149FITLEVNUMVM-022` records the final red Phase 4B gate and the user-approved decision to proceed with Phase 5/WASM.
2. Spec 149 already described Phase 5 as the next-stage answer when Phase 4 cannot reach `<=250 ms`; this ticket moves that deferred branch into an active owner.
3. The current ticket is an architecture/ABI skeleton only. It does not default the runtime to WASM and does not delete closure-tree code; ticket `149FITLEVNUMVM-016` still owns the later F14 cut after the budget is truthful.

## Architecture Check

1. The implementation must introduce a generic Rust/WASM backend for policy bytecode and encoded buffers, not FITL-specific fast paths.
2. GameSpecDoc remains declarative YAML; WASM consumes compiled GameDef/PolicyBytecode/FeatureTable/EncodedState-derived artifacts only.
3. Temporary TS/WASM A/B routing is allowed only as proof machinery. Per F14, it must be removed by the later default-flip ticket.

## What to Change

### 1. Workspace and build skeleton

Create the repo-approved Rust/WASM package or crate location, wire a repeatable build command, and document the Node-side loading path.

### 2. Deterministic ABI draft

Define the first compact integer/binary ABI for a minimal policy bytecode smoke. The ABI must include version/layout identity and reject mismatches rather than silently interpreting incompatible buffers.

### 3. Node bridge smoke

Add a TypeScript bridge or test helper that loads the built WASM artifact and executes a no-op or minimal integer opcode smoke from Node.

### 4. Follow-up decomposition

If the skeleton proves a different crate/package layout is required, update `specs/150-fitl-policy-vm-wasm-port.md` before implementation continues and create the next ticket for policy-bytecode parity.

## Files to Touch

- `specs/150-fitl-policy-vm-wasm-port.md` (modify if ABI/package details change)
- `tickets/150FITLWASM-001.md`
- `packages/engine-wasm/` or repo-approved equivalent (new)
- `packages/engine/src/agents/policy-wasm-runtime.ts` or repo-approved equivalent bridge (new)
- relevant workspace/package build files (modify)
- targeted WASM smoke test (new)

## Out of Scope

- Default-flipping policy evaluation to WASM.
- Deleting closure-tree runtime code.
- Weakening the `<=250 ms` target.
- Porting the full preview application pipeline unless the ABI skeleton proves that a smaller policy-VM-only port cannot feed the hot path.

## Acceptance Criteria

### Tests That Must Pass

1. WASM package/crate builds from a documented command.
2. Node-side smoke test loads the WASM artifact and proves deterministic integer execution for the minimal opcode/ABI slice.
3. Existing engine build remains green: `pnpm -F @ludoforge/engine build`.

### Invariants

1. No FITL-specific code, identifiers, schemas, or hardcoded rule branches.
2. No JSON on the hot FFI path.
3. No production compatibility fallback beyond explicit temporary proof routing.

## Test Plan

### New/Modified Tests

1. Targeted WASM smoke test — proves Node can load the artifact and execute the minimal deterministic ABI.

### Commands

1. `<repo-approved WASM build command decided by this ticket>`.
2. `<targeted WASM smoke test command decided by this ticket>`.
3. `pnpm -F @ludoforge/engine build`.
