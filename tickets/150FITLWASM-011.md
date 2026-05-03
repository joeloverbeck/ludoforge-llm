# 150FITLWASM-011: Generic encoded preview-drive substrate prerequisite

**Status**: PENDING
**Priority**: HIGH
**Effort**: XL
**Engine Changes**: Yes — generic encoded preview-drive application/runtime substrate, WASM/buffer ABI, parity proof
**Deps**: `specs/150-fitl-policy-vm-wasm-port.md`, `archive/tickets/150FITLWASM-009.md`

## Problem

Ticket `150FITLWASM-010` was reassessed on 2026-05-03 and cannot truthfully
implement a production preview-drive WASM/runtime handoff yet. The live WASM
crate owns generic policy bytecode, candidate-feature rows, and score-row
evaluation, but the remaining hot path still applies preview moves and drives
bounded preview completions through the TypeScript kernel/runtime before WASM
can consume scalar preview rows.

The missing prerequisite is a generic encoded preview-drive substrate: enough
encoded action/effect application and bounded completion-drive runtime support
to produce the same preview outcomes as the TypeScript path for a supported
generic subset, while rejecting unsupported classes before production scoring.

## Architecture Check

1. Keep the engine generic. The substrate must consume compiled generic
   artifacts, encoded state/action/effect buffers, and preview-drive control
   buffers. No FITL-specific ids, card/action branches, schemas, or score
   shortcuts.
2. Preserve the one-rules protocol. Any supported WASM preview-drive route must
   prove the same executable preview decision frontier as the TypeScript
   preview path for the supported subset. Unsupported publication or completion
   classes must fail closed rather than falling back silently.
3. Preserve deterministic preview semantics: outcome, failure, gated,
   stochastic, depth-cap, replay identity, hidden-sampling visibility, and
   integer-only arithmetic must match the TypeScript reference.
4. Preserve the public immutability contract. WASM memory and encoded buffers
   may be mutable only as private scoped execution state; caller-visible
   `GameState` inputs must not mutate.
5. Keep this as prerequisite groundwork. Ticket `150FITLWASM-010` remains the
   production routing and same-seam perf-gate owner after this substrate exists.

## What to Change

### 1. Current-corpus preview-drive support inventory

Add a repeatable inventory or focused test helper that classifies the current
Spec 150 same-seam preview drives by generic runtime class: initial move
application requirements, decision-stack publication requirements, completion
microturn kinds, effect/query classes, depth caps, stochastic exits, gated
exits, and unsupported classes.

The inventory must make clear which generic classes are supported by this
ticket, which fail closed, and which later ticket owns any residual class.

### 2. Encoded preview-drive ABI substrate

Design and implement the smallest generic buffer-oriented substrate that can
apply supported preview moves and drive supported bounded completions without
walking TypeScript host object graphs on the hot FFI path. The ABI must validate
magic/version/layout identity, encoded state/action/effect program identity,
candidate count, preview depth cap, and output buffer sizes before evaluation.

Unsupported classes must return deterministic unsupported status codes with
enough TypeScript-side context to report profile owner, candidate count, action
or feature owner, and unsupported drive class.

### 3. TypeScript reference parity

Add focused parity witnesses comparing the new substrate against the TypeScript
preview path for supported generic fixtures. Include at least one production
FITL same-seam representative only if the inventory proves it exercises the
supported substrate; otherwise keep FITL as fail-closed inventory evidence and
create the next substrate owner before `150FITLWASM-010` resumes.

### 4. Failure and immutability proof

Add focused witnesses proving unsupported preview-drive classes fail closed
before scoring and proving the caller-visible input state is not mutated by the
substrate or bridge.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` or nearby preview-drive helpers if the reference bridge needs a generic probe seam
- `packages/engine/src/agents/policy-wasm-runtime.ts` for the ABI/API and diagnostics
- `packages/engine-wasm/policy-vm/src/lib.rs` for Rust/WASM substrate support
- focused unit/integration witnesses near the changed production and WASM seams
- `tickets/150FITLWASM-010.md` when this prerequisite unblocks it
- this ticket (modify Outcome before closeout)

## Out of Scope

- Production routing of supported preview-drive batches through policy
  evaluation; ticket `150FITLWASM-010` owns that after this substrate lands.
- Default-flipping policy evaluation or deleting closure-tree infrastructure.
- Weakening the original Spec 149 `<=250 ms` target.
- Adding FITL-specific opcodes, ids, schemas, or bridge branches.
- Pretending precomputed TypeScript preview outcomes are the preview-drive
  handoff. They may be used only as reference/parity input or explicit
  inventory evidence.

## Acceptance Criteria

### Tests That Must Pass

1. A focused inventory/probe classifies the current same-seam preview-drive
   runtime classes and records supported versus fail-closed classes.
2. Supported encoded preview-drive substrate parity matches the TypeScript
   reference for the owned generic fixtures.
3. Unsupported preview-drive classes fail closed with deterministic diagnostics
   and do not merge TypeScript fallback preview outcomes into a WASM result
   path.
4. Input-state immutability is proven for the bridge/substrate.
5. Existing suite: `pnpm -F @ludoforge/engine-wasm build`.
6. Existing suite: `pnpm -F @ludoforge/engine build`.

### Invariants

1. No JSON, host object graph walking, or FITL-specific ids on the hot FFI path.
2. Encoded preview-drive ABI activation is explicit, deterministic, and
   fail-closed.
3. Integer-only deterministic semantics remain aligned with the TypeScript
   preview application and bounded completion path.
4. The public `applyMove` / preview-drive contract remains immutable; private
   WASM or bridge mutation cannot leak outside the execution scope.

## Test Plan

1. `pnpm -F @ludoforge/engine-wasm build`.
2. `pnpm -F @ludoforge/engine build`.
3. Focused encoded preview-drive substrate parity test command.
4. Focused unsupported-class fail-closed test command.
5. Focused immutability regression command.
