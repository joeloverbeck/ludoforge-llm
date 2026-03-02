# CROGAMPRIELE-016: Distinguish afterEffects trace context from action effects

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — apply-move.ts trace context label
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-006-phase-action-defaults.md`

## Problem

In `apply-move.ts:886`, the afterEffects block uses `eventContext: 'actionEffect'` in its trace context. This is the same label used by direct action effects (line 811) and execution profile stage effects (line 830). When analyzing traces, there is no way to distinguish afterEffects entries from regular action effects without also parsing the `effectPathRoot` string (`action:doThing.afterEffects` vs `action:doThing.effects`). A dedicated `eventContext` value would make trace analysis, debugging, and trace-driven UI (e.g., effects panel in the browser runner) more straightforward.

## Assumption Reassessment (2026-03-02)

1. `apply-move.ts:886` — confirmed: `eventContext: 'actionEffect'` used for afterEffects trace context.
2. `effectPathRoot` at line 888 already distinguishes: `action:${actionId}.afterEffects` — so traces aren't ambiguous, just harder to filter by `eventContext` alone.
3. The `eventContext` field is a string (not a union type) in the trace context — adding a new value is non-breaking.
4. The browser runner effects panel (`packages/runner/src/ui/`) displays effect traces — a distinct context label would improve the UI grouping.

## Architecture Check

1. Adding a `'phaseAfterEffect'` context value is a pure labeling improvement — no behavioral change, no new data flow.
2. Fully game-agnostic — this is engine trace infrastructure.
3. No backwards-compatibility concern — trace context labels are internal.

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

### 2. Update trace context type if it's a typed union

If `eventContext` is constrained by a type union, add `'phaseAfterEffect'` to it.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify) — change eventContext string
- `packages/engine/src/kernel/effect-context.ts` (modify, if eventContext is typed) — add union member

## Out of Scope

- Runner-side effects panel grouping changes (separate frontend ticket if desired).
- Adding afterEffects to trace log schema — the `effectPathRoot` already captures this.

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
