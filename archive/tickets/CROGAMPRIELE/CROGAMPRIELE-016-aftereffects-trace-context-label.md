# CROGAMPRIELE-016: Distinguish afterEffects trace context from action effects

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — apply-move.ts trace context label
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-006-phase-action-defaults.md`

## Problem

In `apply-move.ts:886`, the afterEffects block uses `eventContext: 'actionEffect'` in its trace context. This is the same label used by direct action effects (line 811) and execution profile stage effects (line 830). When analyzing traces, there is no way to distinguish afterEffects entries from regular action effects without also parsing the `effectPathRoot` string (`action:doThing.afterEffects` vs `action:doThing.effects`). A dedicated `eventContext` value would make trace analysis, debugging, and trace-driven UI (e.g., effects panel in the browser runner) more straightforward.

## Assumption Reassessment (2026-03-03, corrected)

1. `apply-move.ts:895` — confirmed: `eventContext: 'actionEffect'` used for afterEffects trace context (the afterEffects block starts at line 886, the eventContext assignment is at line 895).
2. `effectPathRoot` at line 897 already distinguishes: `action:${actionId}.afterEffects` — so traces aren't ambiguous, just harder to filter by `eventContext` alone.
3. The `eventContext` field IS a typed union (`EffectTraceEventContext` in `types-core.ts:808-813`) with 5 members: `'actionCost' | 'actionEffect' | 'lifecycleEffect' | 'triggerEffect' | 'lifecycleEvent'`. Adding a new member is non-breaking but requires updating the union.
4. The browser runner effects panel (`packages/runner/src/ui/`) displays effect traces — a distinct context label would improve the UI grouping.
5. JSON schemas (`Trace.schema.json`, `EvalReport.schema.json`) enumerate eventContext values and are auto-generated from TypeScript via `buildSchemaArtifactMap()`. Regeneration is required after updating the union type.
6. A separate `eventContext: 'actionEffect'` site exists at line 996 for deferred event effects — not in scope for this ticket but noted for future differentiation.

## Architecture Check

1. Adding a `'phaseAfterEffect'` context value is a pure labeling improvement — no behavioral change, no new data flow.
2. Fully game-agnostic — this is engine trace infrastructure.
3. No backwards-compatibility concern — trace context labels are internal.
4. Schema regeneration is automatic via `pnpm -F @ludoforge/engine run schema:artifacts` — no manual schema edits needed.

## What to Change

### 1. Add `'phaseAfterEffect'` event context in `apply-move.ts`

Change line 886 from:
```typescript
eventContext: 'actionEffect',
```
to:
```typescript
eventContext: 'phaseAfterEffect',
```

### 2. Add `'phaseAfterEffect'` to the `EffectTraceEventContext` union

In `packages/engine/src/kernel/types-core.ts:808`, add `| 'phaseAfterEffect'` to the union type.

### 3. Regenerate JSON schema artifacts

Run `pnpm -F @ludoforge/engine run schema:artifacts` to propagate the new value into `Trace.schema.json` and `EvalReport.schema.json`.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify) — add `'phaseAfterEffect'` to `EffectTraceEventContext` union
- `packages/engine/src/kernel/schemas-core.ts` (modify) — add `z.literal('phaseAfterEffect')` to `EffectTraceProvenanceSchema` eventContext union
- `packages/engine/src/kernel/apply-move.ts` (modify) — change eventContext string at line 895
- `packages/engine/schemas/Trace.schema.json` (auto-regenerated)
- `packages/engine/schemas/EvalReport.schema.json` (auto-regenerated)

## Out of Scope

- Runner-side effects panel grouping changes (separate frontend ticket if desired).
- Differentiating the deferred event effects `eventContext` at apply-move.ts:996 (separate ticket if desired).

## Acceptance Criteria

### Tests That Must Pass

1. All 18 CROGAMPRIELE-006 tests remain green.
2. Any trace-assertion tests that check `eventContext` values are updated if they match on `'actionEffect'` for afterEffects.
3. Full suite: `pnpm turbo test --force`

### Invariants

1. afterEffects trace entries use `eventContext: 'phaseAfterEffect'`.
2. Regular action effects continue to use `eventContext: 'actionEffect'`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/apply-move-phase-action-defaults.test.ts` — optionally add a trace-inspection assertion verifying the `phaseAfterEffect` context label appears in result trace entries.

### Commands

1. `node --test packages/engine/dist/test/unit/apply-move-phase-action-defaults.test.js`
2. `pnpm turbo build && pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

**What changed vs originally planned:**

The ticket originally identified 2 files to touch (`apply-move.ts`, `effect-context.ts`). The actual implementation touched **3 source files** + 2 auto-regenerated schemas:

1. `types-core.ts` (not `effect-context.ts`) — the `EffectTraceEventContext` union lives here, not in effect-context.ts
2. `schemas-core.ts` — the Zod schema has its own separate eventContext enum that also needed updating (the ticket's "Out of Scope" claim about schemas was incorrect — the schemas are auto-generated from Zod, so updating the Zod schema was required)
3. `apply-move.ts` — as planned, single-line change at line 895

**Tests added:**
- `afterEffects trace entries use phaseAfterEffect eventContext` — verifies trace provenance uses the new label
- `action effects use actionEffect eventContext distinct from afterEffects` — verifies the two contexts are distinguishable

**Verification:** 3399 tests pass, 0 failures. Typecheck and lint clean.
