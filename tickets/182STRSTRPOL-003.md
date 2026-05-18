# 182STRSTRPOL-003: Phase 2 — Strategic modules trace contract extension

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/agents/policy-eval.ts` (or trace builder module), trace formatting / mode handling
**Deps**: `tickets/182STRSTRPOL-002.md`

## Problem

Spec 182 §4.6 specifies a new top-level `modules` field on `PolicyAgentDecisionTrace` (sibling to the existing `selectors` field added by Spec 181 §5.6, located at `packages/engine/src/kernel/types-core.ts:2252`). The field carries `active` (per-module trace entries with `id`, `traceLabel`, `priorityTier`, `activationValue`, `contribution`, `scoreGroups`) and `inactiveTopReasons`. Summary mode caps active at top-3 and inactive-with-reason at top-3 (sorted by priority tier descending, then id ascending); verbose lifts to top-K of the existing trace-controls budget; debug emits the full matrix. Ordering and capping must be deterministic per Foundation #8.

## Assumption Reassessment (2026-05-18)

1. `PolicyAgentDecisionTrace` lives at `packages/engine/src/kernel/types-core.ts:2232` with the `selectors?: readonly PolicySelectorTraceEntry[]` field at line 2252 — confirmed during reassessment.
2. The existing trace mode handling (`summary`/`verbose`/`debug`) is referenced by Spec 181 Phase 1 work; locate the actual handler during implementation (likely a `PolicyTraceControls` or analogous structure).
3. Module activation + contribution data is produced by ticket 002's evaluator; this ticket consumes that data and formats it for the trace.

## Architecture Check

1. Trace field is generic (`modules.active`, `modules.inactiveTopReasons` — no game-specific identifiers; Foundation #1).
2. Deterministic ordering by `(priorityTier desc, id asc)` per spec §4.6; integer arithmetic only (Foundation #8).
3. Top-K caps follow Spec 181 selector-trace conventions; no new cap-class tier introduced (Foundation #10 cap-class registry unchanged).
4. Refs `module.<id>.*` exposed in 002 are populated from the same evaluator data; trace and refs see the same source of truth.

## What to Change

### 1. PolicyAgentDecisionTrace types

Extend `PolicyAgentDecisionTrace` (types-core.ts:2232) with:

```ts
readonly modules?: PolicyModuleTrace;
```

Add the supporting types:

```ts
export interface PolicyModuleTrace {
  readonly active: ReadonlyArray<PolicyModuleActiveEntry>;
  readonly inactiveTopReasons: ReadonlyArray<PolicyModuleInactiveEntry>;
}

export interface PolicyModuleActiveEntry {
  readonly id: string;
  readonly traceLabel: string;
  readonly priorityTier: number;
  readonly activationValue: number | null;
  readonly contribution: number;
  readonly scoreGroups: Readonly<Record<string, number>>;
}

export interface PolicyModuleInactiveEntry {
  readonly id: string;
  readonly reason: 'conditionFalse' | 'scopeFiltered' | 'fallbackInactive';
}
```

### 2. Trace population

In the trace-builder path that consumes ticket 002's evaluator output, populate `modules.active` (sorted by `(priorityTier desc, id asc)`) and `modules.inactiveTopReasons` (same ordering). Cap per trace mode:

- `summary`: top-3 active + top-3 inactive
- `verbose`: top-K per existing trace-controls budget
- `debug`: full matrix

### 3. Ordering and cap tests

Tests assert:
- Deterministic ordering of `modules.active` and `modules.inactiveTopReasons` across two runs at the same seed.
- Top-K caps applied correctly per mode.
- `summary` mode never emits more than 3 active or 3 inactive entries.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — `PolicyAgentDecisionTrace.modules` field + supporting types)
- `packages/engine/src/agents/policy-eval.ts` (modify — populate trace from evaluator output; locate exact site during implementation)
- `packages/engine/test/unit/agents/strategy-module-trace-ordering.test.ts` (new)
- `packages/engine/test/unit/agents/strategy-module-trace-caps.test.ts` (new)

## Out of Scope

- FITL/ARVN trace assertions (tickets 004, 005).
- Guardrail trace fields (ticket 009).
- Turn-shape trace fields (ticket 015).
- Determinism replay test of full module-using profile (covered by ticket 002 acceptance).

## Acceptance Criteria

### Tests That Must Pass

1. New trace-ordering test — `modules.active` sorts by `(priorityTier desc, id asc)`; `modules.inactiveTopReasons` same.
2. New trace-caps test — `summary` mode caps at 3+3; `verbose` lifts; `debug` emits full matrix.
3. Replay-determinism check: two runs at the same seed produce bit-identical `modules` trace blocks.
4. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`.

### Invariants

1. Ordering is deterministic per Foundation #8.
2. `summary` mode never exceeds 3+3 entries; cap is statically declared.
3. No game-specific identifiers in trace formatting code (Foundation #1).
4. Trace and `module.<id>.*` refs derive from the same evaluator output (single source of truth).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/strategy-module-trace-ordering.test.ts` — deterministic ordering across runs.
2. `packages/engine/test/unit/agents/strategy-module-trace-caps.test.ts` — top-K cap per mode.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/strategy-module-trace-*.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
