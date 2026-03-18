# 68RUNPRESLIFE-004: Make Visual Config Validation Fail Closed at Runner Boundaries

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-001-presentation-scene-contract.md, archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-006-complete-scene-migration-for-tokens-and-announcements.md, archive/specs/42-per-game-visual-config.md, archive/tickets/FITLTOKLANLAY/67FITLTOKLANLAY-004-fitl-visual-config-migration.md

## Problem

The repo already has a mostly-correct strict validation architecture for visual config:

- `resolveBootstrapConfig()` already parses `visual-config.yaml` strictly and rejects invalid cross-references once the compiled `GameDef` is available
- `validateAndCreateProvider()` already provides a generic schema + reference validation path

The remaining architectural leak is narrower than originally described: `packages/runner/src/config/visual-config-loader.ts` still exposes a permissive schema-only loader that degrades invalid YAML into `null` with a warning. That permissive path is used by the pre-game screen, which means one runner entrypoint can still silently discard invalid presentation config before the canonical bootstrap path rejects it.

That is the wrong contract. Presentation config should never be silently ignored by runner-owned boundaries.

## Assumption Reassessment (2026-03-18)

1. Strict parsing and ref validation already exist in `parseVisualConfigStrict()`, `validateVisualConfigRefs()`, and `validateAndCreateProvider()` — confirmed in `packages/runner/src/config/validate-visual-config-refs.ts`.
2. The active bootstrap/runtime path is already fail-closed for schema and cross-reference errors. `resolveBootstrapConfig()` parses visual config strictly up front and rejects invalid references when `resolveGameDef()` builds the validation context — confirmed in `packages/runner/src/bootstrap/resolve-bootstrap-config.ts` and `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts`.
3. The remaining permissive path is the schema-only helper in `packages/runner/src/config/visual-config-loader.ts`, currently used by `packages/runner/src/ui/PreGameConfigScreen.tsx`.
4. Production visual-config coverage already includes substantial FITL and Texas content assertions, but the current file-level tests are still mostly bespoke fixtures rather than one generic quality gate that validates every production `visual-config.yaml` against its compiled `GameDef`.
5. Archived ticket `68RUNPRESLIFE-001` only moved overlays and regions onto canonical scene nodes. Validation for token scene semantics and announcement scene semantics still needs an upstream owner, which is now covered by ticket `68RUNPRESLIFE-006`.

## Architecture Check

1. Failing closed is cleaner than warning and continuing. Presentation-only data belongs in `visual-config.yaml`; if it is invalid, the runner should refuse to operate on an ambiguous or partially defaulted presentation contract.
2. The current architecture is already directionally correct: schema validation can happen immediately, while reference validation should happen only once the compiled `GameDef` exists. The fix should reinforce that split, not duplicate validation logic in multiple entrypoints.
3. The permissive loader is architectural duplication. It reintroduces a weaker contract next to the strict path and should be converted to the same strict schema semantics, not preserved for compatibility.
4. No backwards-compatibility shim should preserve the warn-and-default path.

## What to Change

### 1. Remove the permissive schema-only loader behavior

Update `packages/runner/src/config/visual-config-loader.ts` so it no longer warns and returns `null` for malformed non-null config. The loader helper should use the same strict schema semantics as `parseVisualConfigStrict()`.

This keeps `null`/`undefined` as the explicit "no visual config" case, but makes malformed config an immediate error.

### 2. Keep full cross-reference validation at the `GameDef` boundary

Do not move reference validation into bootstrap-registry or the pre-game screen. Those layers do not own a compiled `GameDef`. Instead, strengthen the existing `resolveBootstrapConfig()` and production validation tests so the fail-closed boundary is explicit and well-covered.

### 3. Make the production quality gate explicit

Add or strengthen a deterministic runner test that validates every production `data/games/*/visual-config.yaml` against the compiled `GameDef` it accompanies using the existing strict parse + ref-validation pipeline.

### 4. Only add semantic validation that is already generic and justified

The current ticket should not speculate about unrelated future semantic checks. Add only the generic invariants that the existing runner actually depends on and that are not already enforced elsewhere. At reassessment time, the already-implemented generic lane satisfiability check is confirmed in `validate-visual-config-refs.ts`.

## Files to Touch

- `packages/runner/src/config/visual-config-loader.ts` (modify)
- `packages/runner/src/ui/PreGameConfigScreen.tsx` (likely unchanged unless a clearer error boundary is needed)
- `packages/runner/test/config/visual-config-loader.test.ts` (modify)
- `packages/runner/test/ui/PreGameConfigScreen.test.tsx` (modify/add if strict loader behavior surfaces here)
- `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` (modify if needed to better express existing fail-closed contract)
- `packages/runner/test/config/visual-config-files.test.ts` (modify)
- `packages/runner/test/config/validate-visual-config-refs.test.ts` (modify only if a truly missing generic invariant is added)

## Out of Scope

- moving reference validation into layers that do not have a compiled `GameDef`
- rewriting the visual-config schema for unrelated features
- FITL-specific runtime branches
- non-runner engine/compiler changes

## Acceptance Criteria

### Tests That Must Pass

1. Invalid non-null visual config prevents provider creation instead of warning and returning defaults.
2. Runner bootstrap continues to fail closed on schema and reference errors against the compiled `GameDef`.
3. Production visual-config validation covers schema and generic reference/semantic invariants against compiled game defs for every shipped game.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Runner-owned entrypoints do not silently ignore malformed presentation config.
2. Presentation-specific data remains sourced from `visual-config.yaml`, not backfilled from `GameDef`.
3. Reference validation remains generic and game-agnostic.
4. Validation responsibilities stay separated cleanly: schema checks at load time, cross-reference checks at `GameDef` boundary.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-files.test.ts` — production schema/ref validation for every shipped visual config
2. `packages/runner/test/config/visual-config-loader.test.ts` — malformed non-null config fails closed instead of warning + defaulting
3. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` — bootstrap fail-closed behavior remains explicit
4. `packages/runner/test/ui/PreGameConfigScreen.test.tsx` — pre-game screen behavior remains correct under strict loader semantics if needed

### Commands

1. `pnpm -F @ludoforge/runner test -- visual-config-files.test.ts visual-config-loader.test.ts resolve-bootstrap-config.test.ts PreGameConfigScreen.test.tsx`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - corrected the ticket assumptions before implementation to reflect that bootstrap was already fail-closed at the `GameDef` boundary
  - removed the permissive schema-only fallback from `packages/runner/src/config/visual-config-loader.ts`, so malformed non-null visual config now throws immediately instead of degrading to defaults
  - strengthened runner tests to cover strict loader behavior, strict pre-game screen behavior, bootstrap schema failure, and generic production visual-config validation against every shipped compiled `GameDef`
- Deviations from original plan:
  - did not modify `packages/runner/src/bootstrap/bootstrap-registry.ts`; reassessment showed it was not the right validation owner
  - did not add new semantic validators in `validate-visual-config-refs.ts`; the reassessment showed the existing generic validation path was already the correct architecture for this ticket
  - implemented the quality gate as stronger tests rather than adding a separate validation script
- Verification results:
  - `pnpm -F @ludoforge/runner test -- visual-config-files.test.ts visual-config-loader.test.ts resolve-bootstrap-config.test.ts PreGameConfigScreen.test.tsx`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
