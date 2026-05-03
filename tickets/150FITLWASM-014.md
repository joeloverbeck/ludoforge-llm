# 150FITLWASM-014: Generic production preview-drive substrate for WASM routing

**Status**: PENDING
**Priority**: HIGH
**Effort**: XL
**Engine Changes**: Yes — generic production preview-drive state/effect/publication substrate, WASM/buffer ABI, parity witnesses
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-011.md`, `archive/tickets/150FITLWASM-012.md`, `archive/tickets/150FITLWASM-013.md`

## Problem

Reassessment of `tickets/150FITLWASM-010.md` on 2026-05-03 found that archived
ticket `150FITLWASM-013` completed an encoded preview-state slot inventory
substrate, but it did not complete the generic production preview-drive
substrate needed before production routing can truthfully stop using the
TypeScript preview drive.

The live production route in `packages/engine/src/agents/policy-preview.ts`
still owns initial candidate `GameState` application, microturn publication,
bounded completion drive, hidden-sampling/stochastic/depth-cap/failure
semantics, canonical preview-state materialization, preview metadata,
preview-state features, preview surfaces, and granted-operation consumers.

The live WASM preview-drive ABI consumes already-authored encoded scalar steps
such as `applyCandidateDeltas`, `chooseOneGreedy`, `chooseNGreedy`,
`addGlobal`, and `stochastic`, then returns outcome/depth/value rows plus
requested scalar preview-state slots. That is useful proof machinery, but it is
not the one-rules production application/publication substrate required by
Foundations #5 and #16. `150FITLWASM-010` remains the later production routing
and same-seam perf-gate owner after this prerequisite.

## Assumption Reassessment (2026-05-03)

1. `archive/tickets/150FITLWASM-013.md` is complete as an encoded
   preview-state slot substrate and FITL inventory witness.
2. `150FITLWASM-013` does not make WASM the owner of generic production
   preview application, publication, bounded completion, or full preview-state
   materialization.
3. Closing `150FITLWASM-010` on the current scalar replay/slot ABI would
   misstate production routing and would weaken the proof required by
   `docs/FOUNDATIONS.md`.

## Architecture Check

1. The substrate must remain generic. No FITL-specific ids, card logic,
   branch tables, schemas, or bridge shortcuts may appear in TypeScript or
   Rust/WASM.
2. The one-rules protocol remains authoritative. Supported WASM preview-drive
   results must be equivalent to the kernel-owned publication/application
   contract for the supported subset; unsupported classes fail closed before
   scoring.
3. Determinism, boundedness, and immutability are required. WASM may mutate
   private buffers internally, but caller-visible state, replay identity, and
   preview outcomes must match the TypeScript reference.
4. This ticket may evolve the ABI, but it must not introduce a compatibility
   fallback in any route counted as WASM-supported production routing.

## What to Change

### 1. Generic production application/publication substrate

Design and implement the smallest generic encoded substrate that can execute
the production preview-drive transition classes needed by the current FITL
same-seam surface without TypeScript applying the candidate move or driving the
completion loop for a route counted as WASM-supported.

### 2. Preview-state materialization contract

Expose a generic output artifact that the TypeScript policy runtime can consume
without walking the TypeScript `GameState` object graph on the supported hot
path. The artifact may be an encoded preview-state buffer, generic preview
surface rows, or another buffer-oriented contract, but it must be sufficient
for `150FITLWASM-010` to route production scoring through the supported WASM
drive path.

### 3. Fail-closed diagnostics

Unsupported production preview-drive classes must reject deterministically
before scoring and report at least profile id, candidate count, unsupported
class, and owner. A TypeScript fallback result must not be merged into a result
path counted as WASM-supported.

### 4. Handoff back to production routing

When the substrate is proven, update `tickets/150FITLWASM-010.md`,
`tickets/149FITLEVNUMVM-016.md`, `tickets/149FITLEVNUMVM-022.md`, and
`specs/150-fitl-policy-vm-wasm-port.md` so the successor graph returns to
production routing and the same-seam perf gate.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` or adjacent generic preview-drive helpers
- `packages/engine/src/agents/policy-wasm-preview-drive.ts`
- `packages/engine/src/agents/policy-wasm-runtime.ts`
- `packages/engine-wasm/policy-vm/src/preview_drive.rs`
- focused unit/integration witnesses near the preview-drive and WASM seams
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` if the proof harness needs a substrate diagnostic
- dependent tickets/specs listed above when the prerequisite unblocks

## Out of Scope

- Production policy scoring/routing through the new substrate; `150FITLWASM-010`
  owns that after this prerequisite is complete.
- Weakening the Spec 149 `<=250 ms` gate.
- FITL-specific opcodes, ids, schemas, or bridge branches.
- Default-flipping policy evaluation or deleting closure-tree infrastructure.

## Acceptance Criteria

### Tests That Must Pass

1. Focused parity witness proves supported generic production preview-drive
   substrate results match the TypeScript preview driver.
2. A FITL same-seam direct witness proves current production preview-drive
   classes are substrate-supported without relying on TypeScript-produced
   preview `GameState` materialization for the route counted as supported, or
   records exact residual fail-closed classes and successor owner.
3. Unsupported production preview-drive classes fail closed with deterministic
   diagnostics and no TypeScript fallback merge.
4. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
5. Existing suite: `pnpm -F @ludoforge/engine build`.

### Invariants

1. No JSON, host object graph walking, or FITL-specific ids on the supported
   hot FFI path.
2. Preview outcomes, depth caps, stochastic exits, hidden-sampling behavior,
   rollback/recovery compatibility, and replay identity remain equivalent to
   the TypeScript reference for supported classes.
3. Unsupported classes are deterministic and fail closed rather than merged
   with TypeScript fallback rows.

## Test Plan

### New/Modified Tests

1. Focused preview-drive/WASM parity tests for the production substrate.
2. Focused unsupported-class fail-closed tests for diagnostics and no fallback
   merge.

### Commands

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. Focused production preview-drive substrate parity test command.
4. Focused unsupported-class fail-closed test command.
5. A FITL same-seam direct witness or inventory command proving the route no
   longer depends on TypeScript preview `GameState` materialization for
   supported rows.
