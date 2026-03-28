# 88PHAAWAACTFIL-005: Unify remaining kernel action-pipeline grouping behind one canonical index owner

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel annotation/validation ownership cleanup and test guards
**Deps**: specs/88-phase-aware-action-filtering.md, archive/tickets/88PHAAWAACTFIL/88PHAAWAACTFIL-004.md

## Problem

Ticket `88PHAAWAACTFIL-004` correctly centralized runtime action-pipeline grouping, but the kernel still has non-runtime callers that rescan `def.actionPipelines` directly.

Today the remaining duplication is in:
- `packages/engine/src/kernel/condition-annotator.ts` — three `.filter()` call sites for rule-card effect collection and pipeline section rendering
- `packages/engine/src/kernel/validate-gamedef-extensions.ts` — one `.filter()` call site for ambiguous multi-profile validation

That leaves action-pipeline ownership split between the shared helper module and independent caller-local grouping logic. The behavior is still correct, but the architecture is not yet ideal: future changes to action-pipeline grouping rules could diverge across runtime, tooltip/annotation, and validation paths.

## Assumption Reassessment (2026-03-28)

1. The canonical runtime helper from archived `88PHAAWAACTFIL-004` now exists at `packages/engine/src/kernel/action-pipeline-lookup.ts` and exports `getActionPipelineLookup()`, `getActionPipelinesForAction()`, and `hasActionPipeline()`.
2. The remaining direct scans are real and limited to kernel non-runtime consumers:
   - `packages/engine/src/kernel/condition-annotator.ts:320`
   - `packages/engine/src/kernel/condition-annotator.ts:538`
   - `packages/engine/src/kernel/condition-annotator.ts:553`
   - `packages/engine/src/kernel/validate-gamedef-extensions.ts:497`
3. Existing tests already own the relevant behavior surfaces:
   - `packages/engine/test/unit/kernel/condition-annotator.test.ts`
   - `packages/engine/test/integration/tooltip-pipeline-integration.test.ts`
   - `packages/engine/test/unit/validate-gamedef.test.ts`
4. The earlier micro-ticket split pattern in active `88PHAAWAACTFIL-002.md` and `88PHAAWAACTFIL-003.md` is still stale and should not be repeated here. This cleanup should remain one complete architectural unit: owner module + caller migration + proof.
5. `docs/FOUNDATIONS.md` requires no backwards-compatibility shims and architecturally complete fixes. If the shared module name is too runtime-specific for kernel-wide ownership, rename it in the same change rather than adding aliases.

## Architecture Check

1. The clean end-state is one canonical per-action pipeline index for all kernel consumers, not separate runtime and non-runtime grouping logic.
2. If the current `action-pipeline-lookup.ts` name is judged too narrow for kernel-wide ownership, the correct change is to rename it to a neutral owner such as `action-pipeline-index.ts` and update all imports in the same change. Do not introduce re-export aliases or transitional shims.
3. This remains fully game-agnostic: the grouping is derived only from generic `GameDef.actionPipelines` data and does not introduce any game-specific branching or schema.
4. Validation and annotation consumers must preserve their current semantics. This ticket is an ownership cleanup, not a semantic redesign of tooltip rendering or validator diagnostics.

## What to Change

### 1. Establish one canonical kernel-wide action-pipeline index owner

- Reassess whether `packages/engine/src/kernel/action-pipeline-lookup.ts` should remain the permanent owner name.
- Preferred end-state:
  - rename it to `packages/engine/src/kernel/action-pipeline-index.ts`
  - keep the existing helper surface (`getActionPipelineLookup`, `getActionPipelinesForAction`, `hasActionPipeline`) or rename the top-level getter consistently if needed
  - update `packages/engine/src/kernel/index.ts` and all internal imports in the same change
- If, after reassessment, the existing filename is already considered sufficiently neutral, keep the file path but document that decision in the ticket before implementation. Do not add duplicate modules.

### 2. Migrate remaining non-runtime kernel consumers

- Update `packages/engine/src/kernel/condition-annotator.ts` to use the canonical helper for:
  - `collectRuleCardEffects()`
  - applicable pipeline section rendering in `describeAction()`
  - fallback pipeline section rendering in the error-safe path
- Update `packages/engine/src/kernel/validate-gamedef-extensions.ts` so ambiguous multi-profile validation reads grouped profiles through the same canonical helper.
- Preserve current behavior exactly:
  - rule-card effect ordering still follows authored `actionPipelines` order
  - pipeline applicability filtering for annotation still behaves the same
  - validator ambiguity diagnostics still trigger on the same conditions and at the same paths

### 3. Strengthen tests around ownership and behavior parity

- Extend `packages/engine/test/unit/kernel/condition-annotator.test.ts` with coverage that proves pipeline-backed rule-card and section behavior remains unchanged.
- Extend `packages/engine/test/unit/validate-gamedef.test.ts` with coverage that proves ambiguous multi-profile diagnostics remain unchanged.
- Add source-guard assertions in the owning tests so these modules do not reintroduce direct `(def.actionPipelines ?? []).filter(...)` scans once the canonical owner is in place.
- If needed for broader confidence, extend `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` rather than creating a detached duplicate integration test.

## Files to Touch

- `packages/engine/src/kernel/action-pipeline-lookup.ts` or `packages/engine/src/kernel/action-pipeline-index.ts` (modify or rename)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/src/kernel/condition-annotator.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/test/unit/kernel/condition-annotator.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` (modify if needed)

## Out of Scope

- Changing `GameDef`, `GameDefRuntime`, schema artifacts, or action-pipeline semantics.
- Altering tooltip/verbalization content policy beyond what is necessary to preserve current behavior under the new owner module.
- Broad refactors unrelated to action-pipeline grouping ownership.
- Backwards-compatibility aliases, transitional re-exports, or duplicate helper modules.

## Acceptance Criteria

### Tests That Must Pass

1. Condition-annotator behavior tests still pass with no tooltip/rule-card regression.
2. Validator ambiguity tests still pass with no diagnostic regression.
3. Source-guard coverage proves the migrated kernel modules no longer rescan `def.actionPipelines` directly.
4. Existing suite: `pnpm turbo test`
5. `pnpm turbo typecheck`
6. `pnpm turbo lint`

### Invariants

1. All kernel consumers that need per-action action-pipeline grouping use one canonical owner module after this change.
2. No backwards-compatibility aliases or duplicate owner modules remain after any rename or path cleanup.
3. Pipeline order for a given action remains authored-order everywhere it is observed.
4. The index stays generic and game-agnostic, derived only from `GameDef.actionPipelines`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-annotator.test.ts` — proves annotation/rule-card behavior remains unchanged while pipeline grouping routes through the canonical owner.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — proves ambiguous multi-profile diagnostics remain unchanged after consumer migration.
3. `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` — optional integration proof if unit coverage alone does not sufficiently demonstrate tooltip parity.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/condition-annotator.test.js`
3. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
4. `node --test packages/engine/dist/test/integration/tooltip-pipeline-integration.test.js`
5. `pnpm turbo typecheck`
6. `pnpm turbo lint`
7. `pnpm turbo test`
