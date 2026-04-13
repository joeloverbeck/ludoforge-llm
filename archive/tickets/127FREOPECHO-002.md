# 127FREOPECHO-002: Fix free-operation completion across overlapping grants + later-decision unsat

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — free-operation discovery/overlay + completion path
**Deps**: `archive/tickets/127FREOPECHO-001.md`

## Problem

The original draft for this ticket was too narrow. The historical seed-1000 An Loc witness exposed two distinct failures:

1. The first free-operation destination `chooseN` is not clamped by the governing singleton grant constraint (`count($targetSpaces) == 1`).
2. Even after the destination count is clamped to `1`, `completeTemplateMove` can still walk into later illegal branches because its completion path consumes discovery-only pending requests that do not preserve legality-ranked options.

There is also a live overlapping-grant detail the original draft missed:

- the effect-time overlay's `zoneFilter` is a merged legality union across applicable grants
- for the stuck witness, that union becomes an `or`
- ticket 001's extraction utility intentionally does not infer binding-count bounds through `or`

So the original proposed fix:

```ts
extractBindingCountBounds(env.freeOperationOverlay?.zoneFilter, bind)
```

is insufficient for this witness even though the FITL event itself correctly requires a singleton City March.

## Rule Alignment

The FITL rule-authoritative source is correct and must remain unchanged.

- `data/games/fire-in-the-lake/41-events/065-096.md` defines card 71 ("An Loc") shaded as a free NVA March into exactly one City followed by two same-city Attacks.
- The shaded March grant encodes `count($targetSpaces) == 1`.
- Existing integration coverage in `packages/engine/test/integration/fitl-events-an-loc.test.ts` already treats this event as an exactly-one-city sequence.

This ticket is therefore an engine coordination fix, not a FITL rules correction.

## Reassessment (2026-04-13)

Verified in the live codebase:

1. The stuck March witness has multiple applicable free-operation grants:
   - `freeOpEffect:1:nva:2` with `zoneFilter: in($zone, grantContext.selectedSpaces)`
   - `freeOp:1:2:event:0` with the An Loc singleton-city `and` filter
2. The current free-operation overlay exposes a merged legality `zoneFilter`, not the stronger governing grant's concrete filter.
3. The correct singleton clamp source is the **highest-priority applicable grant** under the existing free-operation priority contract.
4. When completion is driven through the right governing filter, the first `$targetSpaces` pending request exposes `max = 1`.
5. `legalChoicesEvaluate` for that first request already knows more than discovery:
   - `3 legal`
   - `26 illegal`
6. The remaining end-to-end `unsatisfiable` result comes from later completion decisions losing legality guidance, not from the original unclamped `29`-destination count alone.
7. The original seed-1000 full-game reproducer has drifted and no longer reaches the old stuck state on the live codebase, so acceptance must use a bounded synthetic overlapping-grant witness instead of a stale simulator trace.

## Architecture Check

1. Foundation 1: the fix must stay game-agnostic. No FITL-specific IDs, event names, or branch logic may appear in kernel or agent code.
2. Foundation 8: grant-priority selection and any completion guidance must be deterministic.
3. Foundation 10: completion must remain bounded. No recursive or circular legality/completion loops.
4. Foundation 15: the fix must address both parts of the live root cause:
   - wrong governing filter for binding-count clamping
   - later-decision unsat after the first singleton destination is chosen

## What to Change

### 1. Introduce a completion-only governing filter

Preserve the existing merged legality `zoneFilter` behavior, but also thread a second generic overlay field carrying the highest-priority applicable grant's concrete `zoneFilter` for completion-time binding-count extraction.

Expected touchpoints:

- `packages/engine/src/kernel/free-operation-discovery-analysis.ts`
- `packages/engine/src/kernel/free-operation-overlay.ts`
- `packages/engine/src/kernel/free-operation-preflight-overlay.ts`
- `packages/engine/src/kernel/effects-choice.ts`

### 2. Clamp `chooseN.max` from the governing filter

Reuse ticket 001's extraction utility against the completion-only governing filter, not the merged legality union.

The first `$targetSpaces` request in the witness must expose `max = 1`.

### 3. Complete later decisions without illegal branch drift

The max clamp is necessary but not sufficient. The completion path must remain bounded and deterministic while avoiding already-illegal later branches in the bounded overlapping-grant witness.

Acceptable directions:

- a bounded legality-guided completion step for unresolved pending requests
- another generic, deterministic mechanism that prevents completion from following known-illegal branches

Unacceptable directions:

- recursive singleton probe logic in `legal-choices.ts`
- circular `legalChoices -> completion -> legalChoices` evaluation chains
- new budget constants as a workaround
- FITL-specific agent/kernel logic

## Regression Test

File: `packages/engine/test/integration/fitl-free-operation-march-completion.test.ts`

The regression must:

1. Build a minimal game-agnostic witness state with 2 overlapping applicable free-operation grants for the same action:
   - a higher-priority singleton `and(count($targetSpaces) == 1, ...)` grant
   - a lower-priority overlapping grant that broadens legality
2. Assert there are 2 legal free-operation templates for the target action.
3. Assert the merged legality `zoneFilter` is an `or`, and that ticket 001's extractor returns no binding-count bounds from that merged filter.
4. Assert the completion-only governing filter still yields `max === 1` for `$targetSpaces`.
5. Assert guided singleton completion succeeds.
6. Assert unguided random completion succeeds end-to-end and takes the legal later branch.

## Files to Touch

- `packages/engine/src/kernel/free-operation-discovery-analysis.ts`
- `packages/engine/src/kernel/free-operation-overlay.ts`
- `packages/engine/src/kernel/free-operation-preflight-overlay.ts`
- `packages/engine/src/kernel/effects-choice.ts`
- completion-path files as needed (`move-completion.ts`, `move-decision-*`, or equivalent bounded generic layer)
- `packages/engine/test/integration/fitl-free-operation-march-completion.test.ts`

## Out of Scope

- Changing FITL game data, macros, or event authoring
- FITL-specific logic in any kernel or agent file
- Simulator `agentStuck` handling changes
- New budget constants
- Resolution classification changes
- Recursive singleton probe logic inside `legal-choices.ts`

## Acceptance Criteria

1. Guided singleton completion returns `completed`.
2. The first `$targetSpaces` pending request exposes `max = 1`.
3. Unguided random completion returns `completed`, not `unsatisfiable`.
4. `pnpm -F @ludoforge/engine test` passes.
5. `pnpm turbo typecheck` passes.
6. `pnpm turbo lint` passes.
7. `pnpm turbo test` passes.

## Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-free-operation-march-completion.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
6. `pnpm turbo test`

## Outcome

Implemented the generic fix in the engine:

- free-operation discovery/overlay now preserves both:
  - the merged legality `zoneFilter`
  - a completion-only `bindingCountZoneFilter` from the highest-priority applicable grant
- `effects-choice.ts` clamps free-operation `chooseN.max` from that governing filter
- `completeTemplateMove` now re-evaluates one decision per pass only for free-operation templates, which prevents later-branch drift without widening global completion semantics
- the regression file now uses a bounded synthetic overlapping-grant witness that proves the owned invariant directly on the live codebase

## Verification

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-free-operation-march-completion.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm -F @ludoforge/engine test:integration:fitl-events`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
- `pnpm turbo test`

All passed on the final patch.
