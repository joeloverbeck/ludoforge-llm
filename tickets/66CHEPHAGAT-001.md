# 66CHEPHAGAT-001: Add `phases` field to checkpoint type, schema, and evaluateVictory gating

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel types, Zod schema, terminal evaluation
**Deps**: None

## Problem

The engine evaluates `duringCoup` and `finalCoup` victory checkpoints after every phase transition within a Coup round. There is no mechanism to restrict checkpoint evaluation to specific Coup phases. This causes premature game termination when a faction crosses its victory threshold during a non-victory Coup phase (e.g., VC agitation during Support).

## Assumption Reassessment (2026-04-11)

1. `VictoryCheckpointDef` in `packages/engine/src/kernel/types-victory.ts:5` has fields `id`, `seat`, `timing`, `when` — no `phases` field exists yet. Confirmed.
2. `VictoryCheckpointSchema` in `packages/engine/src/kernel/schemas-extensions.ts:501` uses `.strict()` — adding `phases` requires schema update or Zod will reject it. Confirmed.
3. `evaluateVictory()` in `packages/engine/src/kernel/terminal.ts:135` scans all checkpoints matching timing + condition with no phase filter. Code at lines 148-149 and 176-177 matches spec description exactly.
4. `state.currentPhase` is available in `evaluateVictory()` via the `state: GameState` parameter (line 139). Confirmed.
5. `terminalResult()` is called in `phase-advance.ts:606` inside a `while` loop after every phase transition. Confirmed.

## Architecture Check

1. The `phases` field is a generic, game-agnostic schema addition. The engine filters by phase ID without knowing what the phases represent — no FITL-specific logic enters engine code.
2. The field is optional with backward-compatible semantics: absent `phases` means "evaluate on every phase transition," preserving existing behavior for games that don't need gating.
3. No backwards-compatibility shims — just a new optional field on an existing interface.

## What to Change

### 1. Add `phases` to `VictoryCheckpointDef` type

In `packages/engine/src/kernel/types-victory.ts`, add an optional `phases` field:

```typescript
export interface VictoryCheckpointDef {
  readonly id: string;
  readonly seat: string;
  readonly timing: VictoryTiming;
  readonly phases?: readonly string[];  // only evaluate when currentPhase is in this list
  readonly when: ConditionAST;
}
```

### 2. Update `VictoryCheckpointSchema` Zod schema

In `packages/engine/src/kernel/schemas-extensions.ts`, add `phases` as an optional array of strings to the schema object (before `.strict()`):

```typescript
export const VictoryCheckpointSchema = z
  .object({
    id: StringSchema.min(1),
    seat: StringSchema.min(1),
    timing: VictoryTimingSchema,
    phases: z.array(StringSchema.min(1)).optional(),
    when: ConditionASTSchema,
  })
  .strict();
```

### 3. Add phase-gating filter in `evaluateVictory()`

In `packages/engine/src/kernel/terminal.ts`, update both the `duringCoup` checkpoint search (line 148) and the `finalCoup` checkpoint search (line 176) to skip checkpoints whose `phases` array is defined and does not include `state.currentPhase`:

For `duringCoup` (line 148-149):
```typescript
const duringCheckpoint = checkpoints.find(
  (checkpoint) =>
    checkpoint.timing === 'duringCoup' &&
    (checkpoint.phases === undefined || checkpoint.phases.includes(String(state.currentPhase))) &&
    evaluateConditionWithCache(checkpoint.when, baseCtx),
);
```

For `finalCoup` (line 176-177):
```typescript
const finalCheckpoint = checkpoints.find(
  (checkpoint) =>
    checkpoint.timing === 'finalCoup' &&
    (checkpoint.phases === undefined || checkpoint.phases.includes(String(state.currentPhase))) &&
    evaluateConditionWithCache(checkpoint.when, baseCtx),
);
```

### 4. Unit tests for phase-gated terminal evaluation

Create `packages/engine/test/unit/terminal-phase-gating.test.ts` with tests for:

1. **Phase-gated checkpoint skipped in wrong phase**: A `duringCoup` checkpoint with `phases: ['coupVictory']` is not triggered when `currentPhase` is a different coup phase, even if its `when` condition is true.
2. **Phase-gated checkpoint fires in correct phase**: Same checkpoint fires when `currentPhase` is `'coupVictory'` and `when` is true.
3. **Ungated checkpoint fires in any phase (backward compat)**: A checkpoint without `phases` fires regardless of `currentPhase`.
4. **Multiple checkpoints, mixed gating**: One gated and one ungated checkpoint. The ungated one fires during phases where the gated one is suppressed.
5. **`finalCoup` checkpoint respects phase gating**: A `finalCoup` checkpoint with `phases: ['coupRedeploy']` only fires during `coupRedeploy`.

Tests should use minimal synthetic GameDef fixtures (not production FITL data) to keep them fast and focused on the kernel behavior.

## Files to Touch

- `packages/engine/src/kernel/types-victory.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/terminal.ts` (modify)
- `packages/engine/test/unit/terminal-phase-gating.test.ts` (new)

## Out of Scope

- Compiler validation of phase references (ticket 66CHEPHAGAT-002)
- FITL game data changes (ticket 66CHEPHAGAT-003)
- Removing the redundant isCoup guard from checkpoint conditions (optional follow-up per spec)
- Any changes to `phase-advance.ts` — the `terminalResult()` call site does not change

## Acceptance Criteria

### Tests That Must Pass

1. Phase-gated `duringCoup` checkpoint is skipped when `currentPhase` is not in `phases`
2. Phase-gated `duringCoup` checkpoint fires when `currentPhase` is in `phases`
3. Ungated checkpoint (no `phases` field) fires regardless of `currentPhase`
4. Mixed gated/ungated checkpoints: ungated fires while gated is suppressed
5. Phase-gated `finalCoup` checkpoint respects `phases` filter
6. Existing test suite passes without modification

### Invariants

1. Omitting `phases` preserves identical behavior to pre-change code — no existing game is affected
2. `VictoryCheckpointSchema` with `.strict()` accepts `phases` as optional and rejects unknown fields
3. `evaluateVictory()` remains a pure function — no mutation, no side effects
4. Engine code contains zero FITL-specific identifiers

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/terminal-phase-gating.test.ts` — 5 test cases covering phase gating for both timing types and backward compatibility

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/terminal-phase-gating.test.js`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
