# 70ACTTOOSYN-002: Compile actionSummaries and use them as authored action synopses

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — verbalization compilation + tooltip rule-card planning
**Deps**: `archive/tickets/70ACTTOOSYN-001.md`

## Problem

The codebase already supports macro-level summary messages in the tooltip pipeline, but it has no compiled action-level synopsis channel. Game YAML cannot currently author a concise summary per action and have that summary become the tooltip synopsis for that action.

As a result, actions without a macro-origin summary still fall back to planner-selected structural messages (`select` / `choose`) for their synopsis, even when authored action-level wording would be cleaner and more durable.

## Assumption Reassessment (2026-03-21)

1. `VerbalizationDef` is at `packages/engine/src/kernel/verbalization-types.ts` — confirmed.
2. `GameSpecVerbalization` is at `packages/engine/src/cnl/game-spec-doc.ts` — confirmed.
3. `compileVerbalization` is at `packages/engine/src/cnl/compile-verbalization.ts` — confirmed.
4. The ticket’s original unit-test path was wrong. The existing compile coverage lives at `packages/engine/test/unit/cnl/compile-verbalization.test.ts`, and there is also production-spec integration coverage at `packages/engine/test/integration/compile-verbalization-integration.test.ts`.
5. `scalarArray` handling is already implemented and tested in `packages/engine/src/kernel/tooltip-value-stringifier.ts` and `packages/engine/test/unit/kernel/tooltip-value-stringifier.test.ts`. That work is out of scope for this ticket.
6. `tooltip-template-realizer.ts` already supports `summary` messages in general because `realizeSynopsis()` delegates to `realizeMessage(plan.synopsisSource, ctx)`. No extra `summary` branch is needed there.
7. The live architecture gap is narrower:
   - there is no `actionSummaries` field in `GameSpecVerbalization` or `VerbalizationDef`;
   - `compileVerbalization()` cannot carry authored action summaries into `GameDef`;
   - the tooltip pipeline has no action-level synopsis input, so planner fallback remains `select` / `choose`.
8. The earlier spec/ticket proposal to emit a synthetic `SummaryMessage` from `tooltip-normalizer.ts` is not a good fit for the current architecture. Action summaries are action metadata, not normalized effect output.

## Architecture Check

1. The durable design is to treat `actionSummaries` as compiled verbalization metadata and feed it into rule-card synopsis selection at the action-planning seam, not the effect-normalization seam.
2. This is cleaner than the current architecture because it keeps responsibilities separated:
   - `compile-verbalization.ts` compiles authored verbalization data;
   - `tooltip-normalizer.ts` stays focused on converting effect AST into semantic effect messages;
   - rule-card planning/rendering chooses the best synopsis source for an action.
3. This is more beneficial than the original proposed implementation because injecting synthetic `SummaryMessage` objects into effect-normalizer output would blur the distinction between authored action metadata and effect-derived content, and it risks polluting step content with non-step messages.
4. No backward compatibility or aliasing should be added. Add the new field cleanly, use it directly, and update tests accordingly.
5. A future ideal architecture could make synopsis sourcing fully explicit in `ContentPlan` with a dedicated authored-synopsis field instead of overloading generic message selection. That is aligned with this ticket and acceptable if the implementation stays small and surgical.

## What to Change

### 1. Add `actionSummaries` to verbalization types

**Files**
- `packages/engine/src/kernel/verbalization-types.ts`
- `packages/engine/src/cnl/game-spec-doc.ts`

Add an optional `Readonly<Record<string, string>>` field to both compiled and raw verbalization types:

```typescript
readonly actionSummaries?: Readonly<Record<string, string>>;
```

For `GameSpecVerbalization`, follow existing raw-YAML conventions:

```typescript
readonly actionSummaries?: Readonly<Record<string, string>> | null;
```

### 2. Compile `actionSummaries` from YAML into `VerbalizationDef`

**File**
- `packages/engine/src/cnl/compile-verbalization.ts`

Pass `raw.actionSummaries` through in the same optional-field style used for `modifierClassification`:

```typescript
...(raw.actionSummaries != null ? { actionSummaries: raw.actionSummaries } : {}),
```

`actionSummaries` must stay `undefined` when omitted or `null`.

### 3. Use authored action summaries as synopsis input at rule-card planning time

**Files**
- `packages/engine/src/kernel/condition-annotator.ts`
- `packages/engine/src/kernel/tooltip-content-planner.ts`
- optionally `packages/engine/src/kernel/tooltip-template-realizer.ts` only if needed by the chosen clean design

The authored action summary should be retrieved once from `def.verbalization?.actionSummaries?.[String(action.id)]` during rule-card construction and passed into the synopsis-selection path.

Preferred behavior:
1. If an authored action summary exists, the final synopsis is `"{Action Label} — {Authored Summary}"`.
2. Otherwise preserve the current fallback behavior of using the first `select` / `choose` message.

Important architectural constraint:
- Do **not** fabricate action-summary `TooltipMessage` entries inside `tooltip-normalizer.ts`. That module should remain effect-AST normalization only.

### 4. Add authored summaries to current production verbalization data

**Files**
- `data/games/fire-in-the-lake/05-verbalization.md`
- `data/games/texas-holdem/05-verbalization.md`

Add an `actionSummaries:` block for the actions covered by Spec 70.

Scope notes:
1. Use real action IDs from the current production specs, not speculative IDs.
2. Keep summary text concise, player-facing, and action-level.
3. Avoid duplicating macro-profile summaries where action-level wording is unnecessary unless the action itself needs a better synopsis than the structural fallback.

## Files to Touch

- `packages/engine/src/kernel/verbalization-types.ts`
- `packages/engine/src/cnl/game-spec-doc.ts`
- `packages/engine/src/cnl/compile-verbalization.ts`
- `packages/engine/src/kernel/condition-annotator.ts`
- `packages/engine/src/kernel/tooltip-content-planner.ts`
- `packages/engine/test/unit/cnl/compile-verbalization.test.ts`
- `packages/engine/test/unit/kernel/tooltip-content-planner.test.ts` or another focused tooltip pipeline unit test at the actual seam used
- `packages/engine/test/integration/compile-verbalization-integration.test.ts`
- `packages/engine/test/integration/tooltip-pipeline-integration.test.ts`
- `data/games/fire-in-the-lake/05-verbalization.md`
- `data/games/texas-holdem/05-verbalization.md`

## Out of Scope

- Reworking the already-completed `scalarArray` humanization fix from ticket `70ACTTOOSYN-001`
- Injecting synthetic summary messages into `tooltip-normalizer.ts`
- Refactoring the entire tooltip pipeline
- Changing ActionTooltip React rendering
- Event-card synopsis changes
- Adding compatibility shims or alias paths for old verbalization shapes

## Acceptance Criteria

### Tests That Must Pass

1. `compileVerbalization({ actionSummaries: { fold: 'Surrender hand' } })` preserves `actionSummaries.fold`.
2. `compileVerbalization({})` leaves `actionSummaries` undefined.
3. `compileVerbalization({ actionSummaries: null })` leaves `actionSummaries` undefined.
4. Production FITL and Texas compilation preserve the authored `actionSummaries` block into `GameDef.verbalization`.
5. A tooltip pipeline test proves that when an authored action summary exists, synopsis uses it instead of the `select` / `choose` fallback.
6. A tooltip pipeline test proves that when no authored action summary exists, the previous fallback behavior still applies.
7. `pnpm -F @ludoforge/engine test`
8. `pnpm turbo typecheck`
9. `pnpm turbo lint`

### Invariants

1. `VerbalizationDef` remains pure serializable data.
2. `compileVerbalization()` remains pure and non-mutating.
3. `tooltip-normalizer.ts` remains responsible only for effect-derived tooltip messages.
4. Existing macro-origin summaries continue to work unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-verbalization.test.ts`
   Verify `actionSummaries` pass-through, omission, and `null` handling.
2. Focused tooltip planning/rule-card test at the actual seam
   Verify authored action summary takes precedence over structural synopsis fallback.
3. `packages/engine/test/integration/compile-verbalization-integration.test.ts`
   Verify production FITL and Texas specs compile with `actionSummaries` available in compiled verbalization.
4. `packages/engine/test/integration/tooltip-pipeline-integration.test.ts`
   Verify real action synopses in FITL and Texas use the authored action summary text.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Added `actionSummaries` to raw and compiled verbalization types and compiled them from YAML.
  - Routed authored action synopses through rule-card planning/rendering without injecting synthetic tooltip messages into `tooltip-normalizer.ts`.
  - Added authored action summary data to the FITL and Texas production verbalization files.
  - Extended unit and integration coverage for compilation and synopsis precedence.
  - Updated strict verbalization schema validation and verbalization section fingerprinting so the new field is first-class in the architecture.
- Deviations from original plan:
  - The ticket was corrected before implementation because its original scope still referenced already-completed `scalarArray` work and placed action-summary behavior in the wrong layer.
  - `packages/engine/src/kernel/schemas-core.ts` and `packages/engine/src/cnl/section-identifier.ts` also had to change. Without those updates, the new verbalization field would have been partially integrated and schema checks would fail.
- Verification results:
  - `pnpm turbo build`
  - `node --test packages/engine/dist/test/unit/cnl/compile-verbalization.test.js packages/engine/dist/test/unit/kernel/tooltip-template-realizer.test.js packages/engine/dist/test/integration/compile-verbalization-integration.test.js packages/engine/dist/test/integration/tooltip-pipeline-integration.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
