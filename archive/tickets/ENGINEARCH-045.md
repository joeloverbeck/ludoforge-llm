# ENGINEARCH-045: Canonicalize selector/zone resolution error normalization across all effect handlers

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel effect runtime contract unification + tests
**Deps**: none

## Problem

Selector/zone resolution failures are normalized to `EFFECT_RUNTIME` in var/resource handlers, but several other effect handlers still call resolver primitives directly and can surface raw eval-layer errors (`EvalError`) instead of effect-runtime failures. This creates a split runtime contract by effect family and weakens simulator-level reliability guarantees.

## Assumption Reassessment (2026-02-26)

1. `effects-var.ts` and `effects-resource.ts` already normalize selector/zone resolver failures through `scoped-var-runtime-access.ts` helpers.
2. `effects-token.ts` and `effects-reveal.ts` still call `resolveZoneRef` / `resolvePlayerSel` directly.
3. `effects-choice.ts` still calls `resolveZoneRef` directly in marker-space handlers (`setMarker` and `shiftMarker`).
4. **Mismatch + correction**: prior ticket wording implied the whole choice family was affected; only marker-space choice handlers are part of this issue.
5. Discovery-mode decision probing relies on raw resolver errors for existing legality probing behavior; normalization should target execution-mode effect runtime contracts.
6. Existing unit tests do not consistently assert normalized error context for unresolved selector/zone bindings in token/reveal/marker-space paths.

## Architecture Check

1. A single normalization path for resolver failures is cleaner and more robust than per-file ad hoc behavior.
2. This change is kernel/runtime plumbing only and remains game-agnostic (`GameSpecDoc`/YAML boundaries unchanged).
3. No backwards-compatibility aliases/shims are introduced; resolver failures should surface through one effect-runtime contract.

## What to Change

### 1. Extend shared normalization usage to remaining affected handlers

Refactor affected effect handlers to route selector/zone resolution through shared normalization helpers so resolver failures consistently become `EFFECT_RUNTIME` with structured context.

### 2. Normalize diagnostics shape consistency

Ensure normalization context includes effect type, field/scope, source selector/zone payload, and source eval error code where available.
Preserve discovery-mode probing semantics by leaving discovery resolver errors unwrapped.

### 3. Add regression tests across affected paths

Add focused tests in token/reveal/choice marker-space suites proving unresolved selector/zone bindings produce normalized `EFFECT_RUNTIME` failures with deterministic context.

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
- GameSpecDoc schema changes
- Runner/UI error rendering changes

## Acceptance Criteria

### Tests That Must Pass

1. Resolver failures in token/reveal/marker-space choice effects are normalized to `EFFECT_RUNTIME` with deterministic context during execution mode.
2. Existing successful selector/zone execution behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Effect runtime contracts for selector/zone resolution failures are consistent across affected effect families.
2. Kernel/runtime remains game-agnostic; no game-specific branches are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-token-move-draw.test.ts` — unresolved zone selector/binding paths emit normalized `EFFECT_RUNTIME` (includes source eval metadata).
2. `packages/engine/test/unit/effects-reveal.test.ts` — unresolved zone/player selector bindings emit normalized `EFFECT_RUNTIME`.
3. `packages/engine/test/unit/effects-choice.test.ts` — unresolved marker `space` zone selectors emit normalized `EFFECT_RUNTIME`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-token-move-draw.test.js packages/engine/dist/test/unit/effects-reveal.test.js packages/engine/dist/test/unit/effects-choice.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Generalized shared resolver-normalization helpers in `scoped-var-runtime-access.ts`.
  - Routed selector/zone resolution in `effects-token.ts`, `effects-reveal.ts`, and marker-space handlers in `effects-choice.ts` through shared normalization.
  - Preserved discovery-mode probing behavior by leaving discovery resolver errors unwrapped.
  - Added regression tests for token/reveal/choice normalization plus one discovery-mode invariant test in `scoped-var-runtime-access.test.ts`.
- Deviations from original plan:
  - Added one extra unit test file update (`packages/engine/test/unit/scoped-var-runtime-access.test.ts`) to cover the discovery-mode invariant exposed during implementation.
  - Expanded focused test command to include `scoped-var-runtime-access.test.js`.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - Focused unit tests for token/reveal/choice/scoped-var-runtime-access passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
