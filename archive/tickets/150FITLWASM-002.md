# 150FITLWASM-002: WASM policy bytecode execution parity

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — Rust/WASM policy VM plus TypeScript bridge parity path
**Deps**: `archive/specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-001.md`

## Problem

Ticket `150FITLWASM-001` created the Phase 5 Rust/WASM package, raw ABI smoke,
and Node bridge. Spec 150 Phase 2 now needs the generic policy bytecode VM
ported behind that WASM boundary and proven equivalent to the existing
TypeScript VM before any encoded-state/action batch bridge or performance gate
work can be trusted.

## Assumption Reassessment (2026-05-02)

1. The live skeleton package is `packages/engine-wasm`, with Rust crate
   `packages/engine-wasm/policy-vm` and bridge
   `packages/engine/src/agents/policy-wasm-runtime.ts`.
2. The existing TypeScript policy VM and corpus live under
   `packages/engine/src/agents/policy-vm/` and
   `packages/engine/test/fixtures/bytecode-equivalence-corpus.json`.
3. This ticket owns value-equivalence for generic policy bytecode execution, not
   the later encoded-state/action batch FFI shape or same-seam performance gate.
4. Live corpus reassessment found that the current TypeScript VM still exposes a
   mix of supported generic bytecode and explicitly dynamic/unsupported bytecode
   that falls back to the closure evaluator in production. This ticket therefore
   owns WASM parity for the supported generic core and fail-closed rejection for
   unsupported bytecode; it does not move fallback or preview/application logic
   across the FFI boundary.

## Architecture Check

1. The Rust code must execute generic `PolicyBytecode`-derived opcodes and
   generic encoded-state feature references only; no FITL-specific ids, cards,
   actions, branches, or schemas are allowed.
2. The ABI remains compact binary/integer data with explicit version and layout
   identity. JSON may be used by tests or fixture loading outside the hot FFI
   path, but not inside the runtime bridge path being introduced.
3. The TypeScript VM remains the reference implementation for parity during
   this staged proof. No default flip, compatibility fallback, or closure-tree
   deletion is authorized by this ticket.

## What to Change

### 1. Rust policy bytecode executor

Extend `packages/engine-wasm/policy-vm` from the smoke opcode into the smallest
generic policy bytecode execution slice that can evaluate supported bytecode
from the existing parity corpus. Preserve deterministic integer semantics,
including `Math.trunc`-style division and explicit overflow/error handling.

### 2. Binary ABI and bridge

Extend `packages/engine/src/agents/policy-wasm-runtime.ts` to pass policy
bytecode, constants, feature-table/layout identity, and encoded-state feature
inputs through compact buffers. Reject ABI, layout, or unsupported-opcode
mismatches before producing scores.

### 3. Parity proof

Add or extend a focused test that compares WASM VM values against the existing
TypeScript VM on supported current bytecode-equivalence corpus expressions. The
test must also prove unsupported opcode or ABI mismatch cases fail closed rather
than silently falling back to TypeScript.

### 4. Handoff update

If parity proves the current Phase 2 scope is too broad for one implementation
slice, update this ticket and `archive/specs/150-fitl-policy-vm-wasm-port.md` with the
truthful narrowed opcode/feature subset and create the next non-overlapping
ticket before final proof.

## Files to Touch

- `tickets/150FITLWASM-002.md`
- `archive/specs/150-fitl-policy-vm-wasm-port.md` if the parity boundary changes
- `packages/engine-wasm/policy-vm/` (modify)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify)
- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` or a
  nearby focused WASM parity test (modify/new)
- relevant WASM package build files if new Rust dependencies or outputs are
  required

## Out of Scope

- Default-flipping policy evaluation to WASM.
- Deleting closure-tree runtime code.
- Porting preview application, legal move publication, or kernel rule
  evaluation into WASM.
- The encoded-state/action batch bridge and same-seam `<=250 ms` performance
  gate, unless parity evidence proves a smaller split is impossible.
- Weakening the `<=250 ms` target.

## Acceptance Criteria

### Tests That Must Pass

1. WASM package/crate builds: `pnpm -F @ludoforge/engine-wasm build`.
2. Focused WASM policy-bytecode parity test proves WASM VM and TypeScript VM
   values match on the supported current parity corpus bytecode subset.
3. Existing engine build remains green: `pnpm -F @ludoforge/engine build`.

### Invariants

1. No FITL-specific Rust, bridge, schemas, or hardcoded rule branches.
2. No JSON on the hot FFI path.
3. ABI/version/layout mismatches and unsupported opcodes fail closed.
4. TypeScript VM remains available only as the staged reference path; no
   production default flip occurs here.

## Test Plan

### New/Modified Tests

1. Focused WASM policy-bytecode parity test — proves the Rust/WASM VM values
   match the TypeScript VM on the supported bytecode-equivalence corpus subset,
   while unsupported dynamic bytecode remains fail-closed.

### Commands

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-runtime.test.js`.
4. `timeout 180 pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js`.

## Outcome

Completed on 2026-05-02. Implemented a compact binary WASM bytecode evaluation
path alongside the Phase 1 smoke ABI. The Rust VM now parses ABI/version/layout
identity, bytecode instructions/constants, feature refs, zone kinds, encoded
state arrays, and marker bitsets from integer buffers; it executes the supported
generic VM core and rejects unsupported/dynamic bytecode without TypeScript
fallback. The TypeScript bridge serializes the binary buffer and decodes tagged
WASM values. The focused unit and integration witnesses prove the bridge
contract, supported corpus parity, layout mismatch rejection, and unsupported
bytecode rejection.

Final proof:

1. `pnpm -F @ludoforge/engine-wasm build` — passed.
2. `pnpm -F @ludoforge/engine build` — passed.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-runtime.test.js` — passed, 4 tests.
4. `timeout 180 pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — passed in about 28 seconds.

Closeout status/proof transcription is clerical only and does not change scope,
acceptance criteria, command semantics, or implementation behavior; no proof
lane was invalidated by this final status update.
