# ENGINEARCH-044: Encode zoneVar int-only invariants directly in behavior-validator type contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — validator contract hardening + focused regression coverage
**Deps**: none

## Problem

Behavior validation still uses a shared scoped-var type lookup that models `zoneVar` as `int | boolean | undefined`, then guards boolean checks with runtime scope branches. This works functionally, but it keeps an impossible state (`zoneVar:boolean`) in helper contracts and broadens the drift surface between structure-layer invariants and behavior-layer assumptions.

## Assumption Reassessment (2026-02-26)

1. `GameDef.zoneVars` is enforced as int-only in structure validation (`ZONE_VAR_TYPE_INVALID`) and reflected in `ValidationContext.zoneVarTypesByName: ReadonlyMap<string, 'int'>`.
2. `validate-gamedef-behavior.ts` currently has a shared helper (`getScopedVarType`) returning `'int' | 'boolean' | undefined` for all scopes including `zoneVar`, then filters impossible `zoneVar` boolean cases with scope checks.
3. Existing tests already cover the intended layering behavior:
   - boolean-target diagnostics still fire for global/per-player vars,
   - malformed boolean `zoneVar` definitions remain diagnosed at structure layer,
   - behavior layer does not emit boolean-target diagnostics for `zoneVar` paths.
4. **Scope correction**: This ticket should focus on helper-contract hardening and only add tests where coverage is actually missing, rather than re-adding assertions already present.

## Architecture Check

1. Scope-specific helper contracts are cleaner and more robust than broad unions that encode impossible states.
2. Hardening should stay inside generic validator internals with no game-specific branching.
3. No compatibility aliases/shims: prefer direct contract tightening and update impacted tests if they fail.

## What to Change

### 1. Refine behavior-validator helper contracts

Replace the broad scoped-var type lookup usage in `validate-gamedef-behavior.ts` with scope-specific contracts for boolean-capable variable checks (`global`/`pvar` only). Avoid modeling `zoneVar` as boolean-capable in helper signatures.

### 2. Remove impossible-state checks

Eliminate helper/callsite patterns that represent `zoneVar:boolean` as a possible behavior-layer state. Keep ownership of `zoneVar` type rejection in structure validation.

### 3. Keep/extend regression coverage only where needed

Retain existing tests that assert layering behavior; add or strengthen tests only if implementation exposes an uncovered invariant.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify only if additional coverage is needed)

## Out of Scope

- Runtime effect execution changes
- CNL compiler diagnostic indexing work
- Game-specific GameSpecDoc or visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Behavior-validator helper contracts for boolean-target checks no longer model `zoneVar` as potentially boolean.
2. Existing global/pvar boolean-target diagnostics remain intact.
3. Existing structure-layer ownership of boolean `zoneVar` diagnostics remains intact.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `zoneVar` int-only rule remains encoded consistently across structure and behavior layers.
2. Validator contracts stay explicit, local, and game-agnostic.

## Test Plan

### Baseline Existing Coverage (already present)

1. `packages/engine/test/unit/validate-gamedef.test.ts` — rejects boolean `addVar` targets for global vars.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — rejects boolean `addVar` targets for per-player vars.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — keeps boolean `zoneVar` diagnostics at structure layer for `addVar`.
4. `packages/engine/test/unit/validate-gamedef.test.ts` — rejects boolean `transferVar` targets for global/per-player vars.
5. `packages/engine/test/unit/validate-gamedef.test.ts` — keeps boolean `zoneVar` diagnostics at structure layer for `transferVar`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Tightened behavior-validator helper contracts in `validate-gamedef-behavior.ts` so boolean-capable type lookup is scoped to `global`/`pvar` only (no `zoneVar` boolean-capable contract).
  - Updated `addVar` boolean-target validation to use the narrowed helper contract directly.
  - Added one regression test for `transferVar.to` with malformed boolean `zoneVar` definitions to ensure boolean-target diagnostics remain structure-layer-only for `zoneVar`.
- Deviations from original plan:
  - Ticket scope was corrected before implementation because several proposed “new” assertions already existed in `validate-gamedef.test.ts`.
  - Instead of broad test additions, only one missing edge-case regression was added.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
