# FITLEVENTARCH-006: Event Target Canonical Payload Ownership

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: High
**Engine Changes**: Yes — event target schema hardening + compiler lowering parity + event-data migration
**Deps**: archive/tickets/FITLEVENTARCH-001-event-target-application-semantics.md, archive/tickets/FITLEVENTARCH/FITLEVENTARCH-004-event-target-executability-crossvalidate-parity.md

## Problem

Current contract allows `application: aggregate` targets without `targets[].effects`, which preserves split ownership between target declaration and scope-level effects. This keeps authoring ambiguous and weakens the long-term canonical architecture.

## Assumption Reassessment (2026-03-07)

1. Target-local execution semantics are now first-class (`application` + `effects`), but schema only requires `effects` for `application: each`.
2. Large portions of event data still use target declarations whose executable payload lives outside the target.
3. Mismatch: canonical target-local ownership is not fully enforced yet; this leaves architectural ambiguity.

## Assumption Reassessment (2026-03-08)

1. Confirmed: `EventCardAggregateTargetSchema` still allows missing `targets[].effects` (`effects` optional), so canonical target payload ownership is not enforced at schema level.
2. Confirmed: cross-validation currently permits scope-level fallback payload (`effects`/`branches`/`lastingEffects`) for `targets` via `CNL_XREF_EVENT_DECK_TARGETS_EXECUTABILITY_MISSING`, which conflicts with strict canonical ownership.
3. Confirmed: FITL production data has **53 target declarations** (across **51 scopes**) with missing target-local `effects`, so migration scope is materially larger than originally estimated.
4. Additional discrepancy: event target effects are not lowered via `lowerEffectArray` in `compile-event-cards.ts`, unlike side/branch effects. This is an architectural consistency gap once target-local ownership is enforced.

## Architecture Check

1. Requiring executable payload at the target declaration keeps data intent local, explicit, and easier to evolve.
2. This is still game-agnostic in engine/runtime; only GameSpecDoc shape is normalized.
3. No backward-compatibility shims: adopt one strict canonical target contract and migrate authored data.

## What to Change

### 1. Tighten event target schema contract

Require non-empty `targets[].effects` for both `application` modes (`each` and `aggregate`).

### 2. Migrate existing authored event targets

Update event deck content to move target-relevant effects into the corresponding target `effects` arrays.
For multi-target scopes, preserve behavior by assigning effects according to binding ownership and target selection order.

### 3. Harden validation and tests

Add negative validation cases for targets missing `effects` regardless of `application`, and remove/replace tests that rely on legacy scope-level fallback executability for targets.

### 4. Compiler lowering parity for target effects

Lower `targets[].effects` with the same effect-lowering pipeline used by side/branch effects (macros and condition-aware lowering), preserving deterministic binding scope semantics.

## Files to Touch

- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/types-events.ts` (modify if optionality changes)
- `packages/engine/src/cnl/compile-event-cards.ts` (modify)
- `packages/engine/src/cnl/cross-validate.ts` (modify)
- `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)
- `packages/engine/test/unit/cross-validate.test.ts` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)

## Out of Scope

- Non-event DSL redesign
- Runner visual configuration changes
- Game-balance edits

## Acceptance Criteria

### Tests That Must Pass

1. Any event target missing `effects` is rejected by canonical schema/validation.
2. Migrated event deck data compiles and executes with unchanged gameplay behavior.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Event target effects support the same lowering surface as side/branch effects.

### Invariants

1. Event target declarations are self-contained for executable payload ownership.
2. GameDef/runtime remain game-agnostic with no per-game branching.
3. Event target effect lowering behavior is parity-consistent with side/branch effect lowering.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-top-level.test.ts` — reject missing target effects for both application modes.
2. `packages/engine/test/unit/cross-validate.test.ts` — remove legacy target executability fallback assertions and keep non-target cross-ref coverage.
3. `packages/engine/test/unit/compile-top-level.test.ts` — add/strengthen target-effect lowering assertions (macro/AST lowering parity).
4. `packages/engine/test/integration/fitl-events-1968-nva.test.ts` — assert migrated canonical target ownership shape where applicable.
5. `packages/engine/test/integration/cross-validate-production.test.ts` — ensure production compile has zero cross-ref diagnostics after migration.

### Commands

1. `pnpm -F @ludoforge/engine run schema:artifacts`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`

## Outcome

- Completion date: 2026-03-08
- What actually changed:
  - Enforced strict target-local payload ownership in engine schema for both `application: each` and `application: aggregate` (`targets[].effects` now required).
  - Updated `EventTargetDef` type contract so target effects are required at type level.
  - Removed legacy cross-validate fallback diagnostic path (`CNL_XREF_EVENT_DECK_TARGETS_EXECUTABILITY_MISSING`) that allowed non-canonical scope-level target executability.
  - Added compiler lowering parity for `targets[].effects` so target-local effects use the same lowering pipeline as side/branch effects.
  - Refined event execution ordering to resolve all target selections first, then run target effects; this enables clean multi-target workflows without shims.
  - Migrated FITL event deck content to canonical target-owned payloads, including structural cleanup for card-82 and card-90 and canonical target-effect normalization across affected cards.
  - Updated integration/unit coverage for the canonical target-owned shape and execution ordering.
- Deviations from original plan:
  - Migration scope was larger than initially estimated (53 target declarations across 51 scopes).
  - A required architectural addition (target-effect lowering parity + target effect ordering refactor) was implemented to keep the strict contract robust and avoid dummy/no-op payloads.
- Verification results:
  - `pnpm -F @ludoforge/engine run schema:artifacts`
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test` (pass)
  - `pnpm -F @ludoforge/engine lint` (pass)
  - `pnpm -F @ludoforge/engine typecheck` (pass)
