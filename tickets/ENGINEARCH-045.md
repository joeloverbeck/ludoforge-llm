# ENGINEARCH-045: Canonicalize selector/zone resolution error normalization across all effect handlers

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel effect runtime contract unification + tests
**Deps**: none

## Problem

Selector/zone resolution failures are now normalized to `EFFECT_RUNTIME` in var/resource handlers, but other effect handlers still call resolver primitives directly and can surface raw eval-layer errors. This creates a split runtime contract by effect type and weakens simulator-level reliability guarantees.

## Assumption Reassessment (2026-02-26)

1. `effects-var.ts` and `effects-resource.ts` now use shared selector/zone normalization helpers.
2. `effects-token.ts`, `effects-reveal.ts`, and `effects-choice.ts` still resolve selectors/zones directly without the same normalization envelope.
3. **Mismatch + correction**: effect runtime error contracts are currently inconsistent; normalization must be canonicalized across effect handlers that resolve selectors/zones.

## Architecture Check

1. A single normalization path for resolver failures is cleaner and more robust than per-file ad hoc behavior.
2. This is kernel/runtime plumbing only and remains game-agnostic (`GameSpecDoc`/`visual-config.yaml` data boundaries remain unchanged).
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Extend shared normalization usage to remaining effect handlers

Refactor effect handlers that resolve player/zone selectors to route through shared normalization helpers so resolver failures consistently become `EFFECT_RUNTIME` with structured context.

### 2. Normalize diagnostics shape consistency

Ensure normalization context includes effect type, scope/field, source selector/zone payload, and source eval error code where available.

### 3. Add regression tests across affected effect families

Add focused tests in token/reveal/choice effect suites proving unresolved selector/zone bindings produce normalized `EFFECT_RUNTIME` failures.

## Files to Touch

- `packages/engine/src/kernel/effects-token.ts` (modify)
- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify only if helper API needs light generalization)
- `packages/engine/test/unit/effects-token-move-draw.test.ts` (modify/add)
- `packages/engine/test/unit/effects-reveal.test.ts` (modify/add)
- `packages/engine/test/unit/effects-choice.test.ts` (modify/add)

## Out of Scope

- New effect types or gameplay mechanics
- GameSpecDoc schema or visual-config.yaml schema changes
- Runner/UI error rendering changes

## Acceptance Criteria

### Tests That Must Pass

1. Resolver failures in token/reveal/choice effects are normalized to `EFFECT_RUNTIME` with deterministic context.
2. Existing successful selector/zone execution behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Effect runtime contracts for selector/zone resolution failures are consistent across effect families.
2. Kernel/runtime remains game-agnostic; no game-specific branches are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-token-move-draw.test.ts` — unresolved zone selector paths emit normalized `EFFECT_RUNTIME`.
2. `packages/engine/test/unit/effects-reveal.test.ts` — unresolved zone/player selector paths emit normalized `EFFECT_RUNTIME`.
3. `packages/engine/test/unit/effects-choice.test.ts` — unresolved marker-space selector paths emit normalized `EFFECT_RUNTIME`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-token-move-draw.test.js packages/engine/dist/test/unit/effects-reveal.test.js packages/engine/dist/test/unit/effects-choice.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
