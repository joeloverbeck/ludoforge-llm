# ENGINEARCH-070: Complete EffectContext test-builder consolidation to eliminate contract drift

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — test architecture refactor (EffectContext builder consolidation)
**Deps**: ENGINEARCH-069

## Problem

EffectContext construction logic is still duplicated across multiple unit/integration tests. Partial helper migration reduced some duplication, but incomplete consolidation leaves drift risk whenever EffectContext contracts evolve (for example required mode, trace fields, runtime index handling).

## Assumption Reassessment (2026-02-26)

1. A shared EffectContext test helper exists (`packages/engine/test/helpers/effect-context-test-helpers.ts`) and already supports execution/discovery mode-specific constructors.
2. Local EffectContext literals/builders remained in a broader set of tests than originally implied, including FITL integration coverage and kernel trace/parity tests.
3. Local builders were repeating the same envelope fields (`rng`, `activePlayer`, `actorPlayer`, `bindings`, `moveParams`, `collector`, `mode`, `adjacencyGraph`) with only def/state/trace variants changing.
4. Helper capability gap check: no blocker found. Existing helper options already covered fields used by the remaining local builders, including `traceContext` and `effectPath`.
5. **Mismatch + correction applied**: migrated practical duplicate EffectContext envelope builders in targeted tests, while leaving test-local def/state fixture factories in place for readability.

## Architecture Check

1. Consolidating test EffectContext envelope construction through one helper is more robust than many local literals because future contract changes become one-touch updates.
2. Keeping local def/state fixture factories while centralizing the envelope preserves readability and avoids over-abstraction.
3. This is test-infrastructure architecture hygiene only; no runtime behavior changes and no game-specific branching are introduced.
4. No backwards-compatibility aliases/shims are introduced.

## What Changed

### 1. Migrated duplicate EffectContext envelope builders

Replaced in-scope local EffectContext literal/builders with shared helper usage (`makeExecutionEffectContext` / `makeDiscoveryEffectContext`).

### 2. Preserved local fixture intent

Kept per-test `makeDef` / `makeState` / token fixtures local; centralized only EffectContext envelope assembly.

### 3. Strengthened helper contract coverage

Extended helper-focused tests to verify passthrough of trace-centric fields (`traceContext`, `effectPath`, custom `collector`) used by trace-contract suites.

## Files Touched

- `packages/engine/test/unit/effect-context-test-helpers.test.ts`
- `packages/engine/test/integration/fitl-removal-ordering.test.ts`
- `packages/engine/test/integration/fitl-patrol-sweep-movement.test.ts`
- `packages/engine/test/integration/fitl-sweep-activation.test.ts`
- `packages/engine/test/integration/fitl-faction-costs.test.ts`
- `packages/engine/test/integration/fitl-production-stacking-constraints.test.ts`
- `packages/engine/test/integration/texas-blind-escalation.test.ts`
- `packages/engine/test/unit/effects-reveal.test.ts`
- `packages/engine/test/unit/trace-contract.test.ts`
- `packages/engine/test/unit/execution-trace.test.ts`
- `packages/engine/test/unit/execution-warnings.test.ts`
- `packages/engine/test/unit/dynamic-sourcing.test.ts`
- `packages/engine/test/unit/resource-transfer-trace.test.ts`
- `packages/engine/test/unit/spatial-effects.test.ts`
- `packages/engine/test/unit/effects-var.test.ts`
- `packages/engine/test/unit/kernel/choice-membership-parity.test.ts`
- `packages/engine/test/unit/kernel/evaluate-subset.test.ts`

## Out of Scope

- Runtime/kernel production behavior changes
- Changes to GameSpecDoc/GameDef contracts

## Acceptance Criteria

### Tests That Must Pass

1. In-scope duplicate EffectContext envelope builders are consolidated through shared helper APIs.
2. Trace-oriented tests preserve behavior with helper-supplied contexts.
3. Engine test suite remains green.
4. `pnpm -F @ludoforge/engine build`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`

### Invariants

1. EffectContext envelope duplication is materially reduced in test code.
2. Future EffectContext contract changes require minimal touch points.
3. Test infrastructure remains game-agnostic.

## Test Plan

### New/Modified Tests

1. Modified unit/integration tests currently using local EffectContext envelope builders — refactor-only updates preserving assertions and behavior.
2. Modified helper-focused unit tests — verify explicit constructors preserve mode and advanced field passthrough.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Reassessed and corrected ticket assumptions/scope before implementation.
  - Consolidated remaining in-scope duplicate EffectContext envelope builders onto shared test helpers.
  - Added helper test coverage for trace-centric field passthrough used by trace tests.
  - Removed resulting lint-only dead imports introduced during migration.
- Deviations from original plan:
  - Scope expanded versus initial wording to include additional real duplicate builders discovered in integration and kernel-adjacent tests (including Texas blind escalation and trace suites).
  - No helper API changes were required; existing helper capability was sufficient.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test` passed (295/295).
  - `pnpm -F @ludoforge/engine lint` passed.
