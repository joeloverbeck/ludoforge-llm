# ENG-210: Extract Free-Operation Viability Probe Boundary

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel boundary refactor for free-operation viability probing
**Deps**: tickets/ENG-208-harden-free-operation-discovery-api-surface.md, tickets/ENG-209-strengthen-kernel-boundary-cycle-guards.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/effects-turn-flow.ts

## Problem

Free-operation issue-time viability probing logic is currently owned by `turn-flow-eligibility.ts` and reused by `effects-turn-flow.ts`, creating cross-module coupling in core kernel code. This increases boundary drift risk and makes future refactors harder.

## Assumption Reassessment (2026-03-08)

1. `effects-turn-flow.ts` imports viability probe helpers from `turn-flow-eligibility.ts` to enforce effect-issued grant policies.
2. Existing boundary tickets primarily guard `legal-choices -> turn-flow-eligibility` and free-operation discovery exports, not this new edge.
3. Mismatch: current dependency shape works but is not the cleanest long-term boundary. Correction: move viability probe logic to a dedicated, source-agnostic kernel module.

## Architecture Check

1. A dedicated viability-probe module is cleaner than coupling effect execution to eligibility orchestration.
2. The extracted module stays fully game-agnostic: it consumes generic `GameDef`/`GameState`/grant contracts only.
3. No backwards-compatibility aliases/shims: update callsites to the canonical new module path.

## What to Change

### 1. Extract shared viability probe module

Create a dedicated module (for example `free-operation-viability.ts`) that owns:
- grant viability policy resolution
- require-usable policy classification
- issue-time usability probing

### 2. Rewire callsites and tighten boundaries

Update `turn-flow-eligibility.ts` and `effects-turn-flow.ts` to import only from the new module. Keep orchestrator files focused on their own responsibilities.

### 3. Add boundary guard tests

Add/strengthen architecture tests to forbid direct `effects-turn-flow.ts -> turn-flow-eligibility.ts` viability imports and enforce curated export surface for the new module.

## Files to Touch

- `packages/engine/src/kernel/free-operation-viability.ts` (new)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/test/unit/kernel/<free-op-viability-export-surface-guard>.test.ts` (new)
- `packages/engine/test/unit/kernel/<free-op-viability-boundary-guard>.test.ts` (new/modify)

## Out of Scope

- Free-operation policy semantics changes beyond module ownership/boundaries.
- Game/card data changes.

## Acceptance Criteria

### Tests That Must Pass

1. No direct viability helper imports from `effects-turn-flow.ts` to `turn-flow-eligibility.ts`.
2. New viability module export surface is explicitly guarded.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Kernel boundaries stay acyclic and explicit.
2. Viability behavior remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/<free-op-viability-export-surface-guard>.test.ts` — enforce curated API.
2. `packages/engine/test/unit/kernel/<free-op-viability-boundary-guard>.test.ts` — enforce module-edge contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
