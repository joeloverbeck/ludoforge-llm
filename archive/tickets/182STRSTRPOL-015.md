# 182STRSTRPOL-015: Phase 4 — Turn-shape evaluator trace contract extension

**Status**: IMPLEMENTED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/types-core.ts`, trace formatting / mode handling for `turnShape` block
**Deps**: `archive/tickets/182STRSTRPOL-014.md`

## Problem

Spec 182 §6.6 specifies a `turnShape` trace block on `PolicyAgentDecisionTrace`:

```yaml
turnShape:
  evaluators:
    - id: current-turn-impact
      traceLabel: "current turn impact"
      minimumImpactSatisfied: true
      previewStatus: ready
      objectives:
        - id: self-standing
          delta: 1
        - ...
```

`summary` mode caps evaluators at top-2 (sorted by `minimumImpactSatisfied: true` first, then by `id`); `verbose` and `debug` lift the cap. Sibling to ticket 003 (modules trace) and ticket 009 (guardrails trace formatting).

## Assumption Reassessment (2026-05-18)

1. `PolicyAgentDecisionTrace` at `types-core.ts:2232` already has `modules?` (ticket 003) and `guardrails?` (tickets 007/008/009) siblings; `turnShape?` slots in alongside.
2. Trace mode handling (summary/verbose/debug) is the shared layer extended by 003 and 009; this ticket extends it for turn-shape.
3. Ticket 014 produces `TurnShapeEvaluatorResult` per-evaluator data; this ticket consumes it for trace.

## Architecture Check

1. Trace field is generic (no game-specific identifiers; Foundation #1).
2. Deterministic ordering per spec §8: `minimumImpactSatisfied: true` first, then `id asc` (Foundation #8).
3. Top-K cap is statically declared (no runtime-derived limits).
4. Trace and `turnShape.<id>.*` refs derive from the same evaluator output (single source of truth).

## What to Change

### 1. PolicyAgentDecisionTrace types

Extend with `readonly turnShape?: PolicyTurnShapeTrace;` and supporting types:

```ts
export interface PolicyTurnShapeTrace {
  readonly evaluators: ReadonlyArray<PolicyTurnShapeEvaluatorEntry>;
}

export interface PolicyTurnShapeEvaluatorEntry {
  readonly id: string;
  readonly traceLabel: string;
  readonly minimumImpactSatisfied: boolean;
  readonly previewStatus: 'ready' | 'partial' | 'unavailable';
  readonly objectives: ReadonlyArray<{
    readonly id: string;
    readonly value?: number;
    readonly delta?: number;
  }>;
}
```

### 2. Trace population

In the trace builder that consumes ticket 014's evaluator results, populate `turnShape.evaluators` sorted by `(minimumImpactSatisfied: true first, id asc)`. Apply caps per mode:

- `summary`: top-2 evaluators
- `verbose`: top-K per trace-controls budget
- `debug`: full matrix

### 3. Ordering and cap tests

- Ordering test: deterministic across two runs.
- Cap test: `summary` mode never emits more than 2 evaluators; `verbose`/`debug` lift correctly.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — `PolicyTurnShapeTrace` types)
- Trace formatter source (locate during implementation; same area as 003 and 009)
- `packages/engine/test/unit/agents/turn-shape-trace-ordering.test.ts` (new)
- `packages/engine/test/unit/agents/turn-shape-trace-caps.test.ts` (new)

## Out of Scope

- Architectural-invariant probe (ticket 016).
- FITL conformance + minimumImpactSatisfied probe (ticket 017).
- Determinism replay test for full turn-shape-using profile (ticket 017 covers).

## Acceptance Criteria

### Tests That Must Pass

1. New `turn-shape-trace-ordering.test.ts` — deterministic ordering.
2. New `turn-shape-trace-caps.test.ts` — top-K cap per mode.
3. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`.

### Invariants

1. Ordering is deterministic per Foundation #8.
2. `summary` mode never exceeds 2 evaluator entries.
3. Trace and `turnShape.<id>.*` refs derive from same evaluator output.
4. No game-specific identifiers in trace code (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/turn-shape-trace-ordering.test.ts`
2. `packages/engine/test/unit/agents/turn-shape-trace-caps.test.ts`

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/turn-shape-trace-*.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-19
Outcome amended: 2026-05-19

Implemented the Phase 4 turn-shape trace contract extension:

- Added `PolicyTurnShapeTrace`, `PolicyTurnShapeEvaluatorEntry`, and `PolicyTurnShapeObjectiveTraceEntry` to `PolicyAgentDecisionTrace`.
- Added `packages/engine/src/agents/policy-turn-shape-trace.ts` to build deterministic `turnShape.evaluators` entries from ticket 014's cached evaluator results.
- Wired policy evaluation metadata and diagnostics output so selected-candidate turn-shape evaluator results appear under `agentDecision.turnShape`.
- Added `packages/engine/test/unit/agents/turn-shape-trace-ordering.test.ts` and `packages/engine/test/unit/agents/turn-shape-trace-caps.test.ts`.

No game-specific identifiers were added to trace code. The FITL evaluator authoring, no-additional-preview-drive architectural probe, and full evaluator-using profile determinism were completed and archived in `archive/tickets/182STRSTRPOL-016.md` and `archive/tickets/182STRSTRPOL-017.md`.

Source-size ledger:

| path | final lines | active growth | crossed cap? | decision |
| --- | ---: | ---: | --- | --- |
| `packages/engine/src/agents/policy-eval.ts` | 1706 | +9 | no — pre-existing over cap | User-approved option 1 on 2026-05-19: defer broad extraction; active growth is narrow metadata plumbing required by this ticket. |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2776 | +39 | no — pre-existing over cap | User-approved option 1 on 2026-05-19: defer broad extraction; helper extraction for trace construction is in `policy-turn-shape-trace.ts`. |
| `packages/engine/src/kernel/types-core.ts` | 2737 | +19 | no — pre-existing over cap | User-approved option 1 on 2026-05-19: defer broad type-surface split; this ticket adds the required public trace shape. |
| `packages/engine/src/agents/policy-turn-shape-trace.ts` | 54 | +54 | no | New focused helper under guidance. |

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/unit/agents/turn-shape-trace-*.test.js` — passed; 4 tests / 2 suites.
- `pnpm turbo build` — passed.
- `pnpm turbo test` — passed; Turbo 5/5 tasks successful, engine default lane `98/98 files passed`.
- `pnpm turbo lint` — passed; 2/2 tasks successful.
- `pnpm turbo typecheck` — passed; 3/3 tasks successful.
