# SEATRES-066: Generalize effect-runtime reason literal guard to kernel-wide invariant

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel source-guard policy coverage for canonical effect runtime reason usage
**Deps**: archive/tickets/SEATRES/SEATRES-054-complete-effect-runtime-reason-context-contracts-and-guarded-consumption.md

## Problem

Current guard coverage for canonical `EFFECT_RUNTIME_REASONS.*` usage is limited to a hardcoded list of emitter files. This allows newly added emitter/normalization files to regress to raw reason string literals without failing tests.

## Assumption Reassessment (2026-03-03)

1. `packages/engine/test/unit/effect-error-contracts.test.ts` currently enforces literal-free reason calls only for a fixed `emitterFiles` array.
2. Engine kernel has multiple reason surfaces (`effectRuntimeError(...)`, selector normalization `code` payloads, and scoped-var routing) where raw literals can be reintroduced outside that fixed list.
3. No active ticket currently establishes a kernel-wide invariant for effect-runtime reason constant usage.

## Architecture Check

1. A kernel-wide invariant guard is cleaner than per-file manual curation and prevents silent contract drift as modules evolve.
2. This is contract-hardening in agnostic engine code and does not introduce game-specific branching into `GameDef`/runtime/simulator.
3. No compatibility aliasing/shims: the guard enforces canonical constants directly.

## What to Change

### 1. Replace hardcoded guard scope with discoverable kernel scope

1. Update source-guard logic to scan `packages/engine/src/kernel/` for effect-runtime reason usage sites.
2. Exclude allowed definition files (for example `runtime-reasons.ts`) from literal checks.

### 2. Enforce literal-free reason usage across both major surfaces

1. Guard `effectRuntimeError(...)` call arguments against raw string reason literals.
2. Guard object payload `code` fields (for selector/scoped-var normalization paths) against raw reason literals where the field type is `EffectRuntimeReason`.

### 3. Keep guard deterministic and review-friendly

1. Prefer AST/source-structure checks with clear failure messages naming offending file and pattern.
2. Keep exception list explicit and minimal.

## Files to Touch

- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify)
- `packages/engine/test/helpers/kernel-source-guard.ts` (modify, if helper expansion is needed)

## Out of Scope

- Redesigning runtime reason taxonomy
- Changing runtime error message text
- GameSpecDoc/visual-config schema changes

## Acceptance Criteria

### Tests That Must Pass

1. Introducing a raw reason string literal in any kernel emitter/normalization file fails the guard test.
2. Canonical `EFFECT_RUNTIME_REASONS.*` usage passes guard tests without requiring manual file-list updates.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Kernel effect-runtime reason usage is constant-based and centrally governed.
2. Guard policy remains game-agnostic and independent of any specific game data model.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effect-error-contracts.test.ts` — replace hardcoded emitter list with kernel-wide invariant checks and explicit exclusions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
