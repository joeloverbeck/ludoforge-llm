# 88PHAAWAACTFIL-005: Unify remaining kernel action-pipeline grouping behind one canonical index owner

**Status**: ✅ COMPLETED
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
3. Other `def.actionPipelines` reads still exist, but they are not per-action grouping duplicates:
   - `packages/engine/src/kernel/always-complete-actions.ts` builds a one-pass `Set<ActionId>` for a different question (`does any pipeline exist for this action while computing always-complete actions?`).
   - `packages/engine/src/kernel/validate-gamedef-extensions.ts` and `packages/engine/src/kernel/validate-events.ts` also retain whole-array validation walks that are not candidates for this lookup migration.
   This ticket should stay focused on the remaining caller-local per-action grouping logic rather than broadening into every `actionPipelines` read in the kernel.
4. Existing tests already own the relevant behavior surfaces:
   - `packages/engine/test/unit/kernel/condition-annotator.test.ts`
   - `packages/engine/test/unit/validate-gamedef.test.ts`
5. An integration tooltip test already exists, but the direct ownership points for this cleanup are the two unit suites above. Integration coverage is optional follow-up confidence, not the primary proof point for this refactor.
6. The earlier micro-ticket split pattern in active `88PHAAWAACTFIL-002.md` and `88PHAAWAACTFIL-003.md` is still stale and should not be repeated here. This cleanup should remain one complete architectural unit: owner module + caller migration + proof.
7. `docs/FOUNDATIONS.md` requires no backwards-compatibility shims and architecturally complete fixes. The existing module name `action-pipeline-lookup.ts` is already sufficiently generic for kernel-wide ownership; renaming it would add churn without improving the architecture.

## Architecture Check

1. The clean end-state is one canonical per-action pipeline index for all kernel consumers, not separate runtime and non-runtime grouping logic.
2. The current `action-pipeline-lookup.ts` file is already an acceptable owner name. It describes what the module does and is not runtime-specific in a way that blocks broader kernel reuse. The cleaner architecture is to reuse it directly rather than rename it.
3. This remains fully game-agnostic: the grouping is derived only from generic `GameDef.actionPipelines` data and does not introduce any game-specific branching or schema.
4. Validation and annotation consumers must preserve their current semantics. This ticket is an ownership cleanup, not a semantic redesign of tooltip rendering or validator diagnostics.
5. Ideal future architecture, if more pipeline-derived questions accumulate, would be to extend the canonical lookup module with additional derived indexes instead of letting new callers rescan raw arrays. That is not needed for this ticket because the current remaining duplication is only per-action grouping.

## What to Change

### 1. Keep one canonical kernel-wide action-pipeline index owner

- Keep `packages/engine/src/kernel/action-pipeline-lookup.ts` as the canonical owner.
- Reuse the existing helper surface (`getActionPipelineLookup`, `getActionPipelinesForAction`, `hasActionPipeline`) rather than introducing a parallel module or alternate access path.
- Do not rename the module unless implementation uncovers a concrete architectural problem that the current name causes. As of reassessment, no such problem exists.

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
- Use `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` only if unit coverage is insufficient. Do not add integration coverage by default when the unit ownership tests already prove behavior and source adoption.

## Files to Touch

- `packages/engine/src/kernel/action-pipeline-lookup.ts` (reuse existing owner; modify only if a helper-level adjustment becomes necessary)
- `packages/engine/src/kernel/condition-annotator.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/test/unit/kernel/condition-annotator.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)
- `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` (modify only if needed)

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
2. No duplicate owner modules, aliases, or alternate grouping helpers are introduced.
3. Pipeline order for a given action remains authored-order everywhere it is observed.
4. The index stays generic and game-agnostic, derived only from `GameDef.actionPipelines`.
5. Modules that answer different questions from raw `actionPipelines` data are not forced through this lookup unless they also need per-action grouped candidates.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-annotator.test.ts` — proves annotation/rule-card behavior remains unchanged while pipeline grouping routes through the canonical owner.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — proves ambiguous multi-profile diagnostics remain unchanged after consumer migration.
3. `packages/engine/test/integration/tooltip-pipeline-integration.test.ts` — optional integration proof only if unit coverage alone does not sufficiently demonstrate tooltip parity.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/condition-annotator.test.js`
3. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
6. `pnpm turbo test`

## Outcome

Completed: 2026-03-28

What actually changed:
- Kept `packages/engine/src/kernel/action-pipeline-lookup.ts` as the canonical owner after reassessment. The proposed rename was unnecessary churn rather than a cleaner architecture.
- Migrated the remaining per-action grouping callers in `packages/engine/src/kernel/condition-annotator.ts` and `packages/engine/src/kernel/validate-gamedef-extensions.ts` to `getActionPipelinesForAction(...)`.
- Added behavioral coverage proving authored pipeline order still reaches RuleCard generation and that ambiguous multi-profile validation still behaves correctly.
- Added source guards in the owning unit suites so these modules do not reintroduce direct per-action `def.actionPipelines` scans.

What changed versus the original plan:
- The ticket was corrected first to narrow scope to the real remaining duplication. Other `actionPipelines` reads that answer different questions were left out of scope intentionally.
- The optional integration tooltip test was not needed; the strengthened unit suites were sufficient proof for this ownership cleanup.

Verification:
- `pnpm turbo build`
- `node --test packages/engine/dist/test/unit/kernel/condition-annotator.test.js`
- `node packages/engine/dist/test/unit/validate-gamedef.test.js`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
- `pnpm turbo test`
