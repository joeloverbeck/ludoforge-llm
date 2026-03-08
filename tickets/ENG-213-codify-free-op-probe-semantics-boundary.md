# ENG-213: Codify Free-Op Probe Semantics Boundary

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel architecture boundary and probe contract hardening
**Deps**: tickets/ENG-210-extract-free-op-viability-probe-boundary.md, tickets/ENG-212-fix-sequence-probe-usability-false-negatives.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/effects-turn-flow.ts, packages/engine/test/unit/kernel/free-operation-discovery-export-surface-guard.test.ts

## Problem

Free-operation viability probing currently relies on implicit behavior through shared helper calls and synthetic blocker wiring. The boundary between "probe-time usability estimation" and "execution-time grant authorization/sequence lock" is not explicitly represented, which increases refactor risk.

## Assumption Reassessment (2026-03-08)

1. Viability probing and execution authorization currently share low-level helper paths and inferred semantics.
2. Existing boundary tickets cover module extraction and export/contract guards, but do not define an explicit semantic contract for probe mode vs execution mode.
3. Mismatch: architecture intent is clear layering, but semantic responsibilities are still implicit. Correction: introduce explicit probe contract surface and enforce via source-level guard tests.

## Architecture Check

1. Explicit probe semantics are cleaner and more extensible than relying on incidental behavior of authorization helpers.
2. This remains game-agnostic kernel design; no game-specific data/visual config leakage into runtime architecture.
3. No backward-compatibility aliases/shims: define one canonical probe API and migrate callsites directly.

## What to Change

### 1. Introduce explicit probe contract surface

Define a dedicated probe API (module or typed strategy surface) that declares sequence-handling semantics for viability evaluation, distinct from execution authorization checks.

### 2. Rewire callsites to canonical probe surface

Update eligibility/effects callsites to depend on the explicit probe contract rather than implicit shared helper behavior.

### 3. Add architecture guard tests for semantic boundaries

Add source-level guard tests that enforce:
- no direct execution-only helper coupling from probe consumers
- curated export surface for the probe boundary module

## Files to Touch

- `packages/engine/src/kernel/<free-op-viability-or-probe-module>.ts` (new/modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify if public API exposure is required; otherwise assert non-export)
- `packages/engine/test/unit/kernel/<free-op-probe-export-surface-guard>.test.ts` (new)
- `packages/engine/test/unit/kernel/<free-op-probe-boundary-guard>.test.ts` (new)

## Out of Scope

- FITL card data rewrites.
- Visual presentation changes in any `visual-config.yaml`.

## Acceptance Criteria

### Tests That Must Pass

1. Probe semantics are explicitly encoded and verified independent of execution authorization behavior.
2. Boundary guard tests fail if probe consumers import execution-only helper surfaces directly.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation probe and execution contracts remain deterministic and game-agnostic.
2. Kernel boundary ownership is explicit, acyclic, and test-enforced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/<free-op-probe-export-surface-guard>.test.ts` — enforce curated probe API.
2. `packages/engine/test/unit/kernel/<free-op-probe-boundary-guard>.test.ts` — enforce probe-vs-execution import layering.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — ensure behavioral parity under explicit probe contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
