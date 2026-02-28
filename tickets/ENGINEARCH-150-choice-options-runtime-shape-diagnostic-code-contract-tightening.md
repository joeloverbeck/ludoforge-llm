# ENGINEARCH-150: Tighten Choice-Options Runtime-Shape Diagnostic Code Contract

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel diagnostic helper contract typing hardening
**Deps**: archive/tickets/ENGINEARCH-147-choice-options-diagnostic-details-remove-redundant-alternatives-field.md

## Problem

The shared choice-options runtime-shape diagnostic helper currently accepts an unconstrained `string` diagnostic code. This allows taxonomy drift or typos to compile silently and weakens cross-surface contract integrity.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/choice-options-runtime-shape-diagnostic.ts` defines helper args with `code: string`.
2. Current call sites only pass two intended literals (`CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID` and `EFFECT_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID`).
3. Mismatch: implementation contract is looser than actual intended code taxonomy. Corrected scope is to encode the code taxonomy in types so invalid codes are rejected at compile time.

## Architecture Check

1. A closed code contract is cleaner and more robust than open-string forwarding because it prevents silent drift.
2. This is kernel-level diagnostic contract hardening and remains game-agnostic; no game-specific behavior is introduced.
3. No backwards-compatibility aliasing/shims; tighten to canonical literals directly.

## What to Change

### 1. Constrain helper diagnostic code input to a closed union

In `choice-options-runtime-shape-diagnostic.ts`, replace `code: string` with a local explicit union/type alias for the two supported code literals.

### 2. Keep call sites and tests aligned with strict code ownership

Update any impacted call sites/tests to satisfy stricter typing and add explicit assertions for the emitted code where helpful.

## Files to Touch

- `packages/engine/src/kernel/choice-options-runtime-shape-diagnostic.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify only if type alignment requires)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify only if type alignment requires)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.ts` (modify)

## Out of Scope

- Choice-options runtime-shape semantics changes.
- Message/suggestion wording changes.
- Any GameSpecDoc or visual-config schema/content changes.

## Acceptance Criteria

### Tests That Must Pass

1. Shared helper cannot be called with arbitrary diagnostic codes (enforced by TypeScript contract).
2. Compiler/validator paths still emit their canonical existing code literals unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Choice-options runtime-shape diagnostics preserve strict, explicit taxonomy ownership.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.ts` — assert emitted `code` matches exact canonical literal for each supported surface.
2. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` — keep compiler/validator code parity locked.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
6. `pnpm run check:ticket-deps`
