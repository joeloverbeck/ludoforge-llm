# SEATRES-054: Complete effect-runtime reason context contracts and guarded consumption

**Status**: COMPLETED (2026-03-03)
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — effect runtime reason schema typing, effect callsites, and runtime reason consumption sites
**Deps**: tickets/SEATRES-052-enforce-required-effect-runtime-context-args-by-reason.md, tickets/SEATRES-053-remove-unsafe-casts-from-effect-runtime-error-construction.md

## Problem

Most `EffectRuntimeReason` entries still map to generic `Record<string, unknown>` context. This limits compile-time guarantees and leaves reason payload contracts mostly implicit. Some consumers still inspect reasons via string literals instead of typed reason guards/constants.

## Assumption Reassessment (2026-03-03)

1. `EffectRuntimeContextByReason` currently defines explicit structure only for `turnFlowRuntimeValidationFailed`; all other effect runtime reasons still route through generic record context.
2. Callsites across effect modules emit reason-specific fields (for example `effectType`, selector diagnostics, bounds), but shared reason contracts do not yet encode those semantics beyond turn-flow.
3. Runtime reason consumption still uses raw string literals in multiple places, including:
   - `packages/engine/src/kernel/apply-move.ts` (`choiceRuntimeValidationFailed`)
   - `packages/engine/src/kernel/legal-choices.ts` (`choiceProbeAuthorityMismatch`)
4. Existing tests already include reason-matrix and guard coverage in `packages/engine/test/unit/effect-error-contracts.test.ts`; this ticket should extend that coverage rather than duplicating it.

## Architecture Check

1. Exhaustive reason-context typing yields cleaner, more robust architecture than ad-hoc payload bags.
2. This strengthens engine contracts while keeping GameSpecDoc/visual-config game data separate from game-agnostic runtime logic.
3. No compatibility shims: migrate all targeted callsites to canonical reason constants and reason guards directly.

## What to Change

### 1. Expand per-reason effect runtime context contracts

1. Replace generic `Record<string, unknown>` entries in `EffectRuntimeContextByReason` with explicit interfaces for active reasons.
2. Keep schemas focused on stable semantics (reason-level contracts), not callsite-local incidental keys.

### 2. Migrate effect emitters to explicit reason contracts

1. Update `effectRuntimeError` callsites to satisfy new per-reason types.
2. Ensure all required keys are present and typed per reason.

### 3. Standardize reason consumption

1. Replace raw reason string literal comparisons with `EFFECT_RUNTIME_REASONS.*` constants.
2. Prefer `isEffectRuntimeReason(...)` where context narrowing is needed.
3. Treat `apply-move` and `legal-choices` as mandatory conversion sites (both currently consume effect runtime reasons directly).

## Files to Touch

- `packages/engine/src/kernel/effect-error.ts` (modify)
- `packages/engine/src/kernel/effects-*.ts` (modify scoped subsets as needed)
- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify, if reason payload contracts require)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify/add)
- `packages/engine/test/unit/apply-move.test.ts` (modify/add if behavior assertions need guard-aligned updates)
- `packages/engine/test/unit/*` (modify/add targeted reason contract tests where affected)

## Out of Scope

- Changing error code taxonomy boundaries (`EFFECT_RUNTIME` vs kernel runtime error codes)
- Game-specific schema additions in `GameDef` or simulator runtime branches

## Acceptance Criteria

### Tests That Must Pass

1. `EffectRuntimeContextByReason` provides explicit context contracts for targeted runtime reasons with no fallback generic entries for those reasons.
2. Updated callsites compile without casts and satisfy reason-specific payload requirements.
3. Consumers use constants/guards for reason checks where context narrowing is required (`apply-move` + `legal-choices` minimum).
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Effect runtime reason contracts are centralized, explicit, and game-agnostic.
2. Runtime error handling uses stable semantic reason IDs, not fragile string literals.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effect-error-contracts.test.ts` — add exhaustive reason contract assertions for migrated reasons.
2. `packages/engine/test/unit/apply-move.test.ts` (or closest focused test file) — assert guarded reason-based behavior remains correct after migration from string literals.
3. `packages/engine/test/unit/legal-choices*.test.ts` (or closest focused test file) — assert reason-consumption behavior remains correct after guard migration.
4. Additional affected unit tests under `packages/engine/test/unit/` — update reason payload assertions to align with explicit contracts.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

1. Completed targeted reason-contract hardening by defining explicit `EffectRuntimeContextByReason` entries for all effect runtime reasons and requiring context for `choiceRuntimeValidationFailed`, `choiceProbeAuthorityMismatch`, and `turnFlowRuntimeValidationFailed`.
2. Completed guarded reason consumption migration at active runtime consumer sites:
   - `apply-move.ts`: replaced raw string comparison with `isEffectRuntimeReason(..., EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)`
   - `legal-choices.ts`: replaced raw string comparison with `isEffectRuntimeReason(..., EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH)`
3. Expanded and tightened unit contract coverage in `effect-error-contracts.test.ts`:
   - required/optional reason matrix updated
   - runtime enforcement assertions added for missing required choice contexts
   - source-guard assertions added to prevent regression to raw reason string checks in guard sites
4. Original broad emitter migration scope across all `effects-*.ts` was intentionally narrowed to contract and consumer guard layers for this ticket iteration; current emitter callsites remain compatible with strengthened contracts and can be migrated to constants in a dedicated follow-up if desired.
