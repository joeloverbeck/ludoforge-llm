# 182STRSTRPOL-003: Phase 2 — Strategic modules trace contract extension

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/agents/policy-eval.ts` (or trace builder module), trace formatting / mode handling
**Deps**: `archive/tickets/182STRSTRPOL-002.md`

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

## Outcome

Completed: 2026-05-18

What changed:

1. Added the `PolicyAgentDecisionTrace.modules` public trace block, with `active` and `inactiveTopReasons` entries, plus generated `Trace.schema.json` coverage for the new trace contract.
2. Populated module traces from the same strategy-module evaluator cache that backs `module.<id>.*` refs, preserving a single source of truth between scoring refs and trace output.
3. Added `debug` as a policy decision trace level so the ticket/spec's full-matrix trace mode has an actual runtime path; `debug` behaves as verbose-plus-full-module-matrix for this ticket's surface.
4. Extracted module trace shaping into `packages/engine/src/agents/policy-strategy-module-trace.ts`, keeping the over-guidance evaluation core limited to cache delegation.
5. Added focused ordering, cap, and byte-identical trace tests in `strategy-module-trace-ordering.test.ts` and `strategy-module-trace-caps.test.ts`.

Deviations from original plan:

1. The implementation uses `packages/engine/src/agents/policy-strategy-module-trace.ts` as the trace builder module named by the ticket instead of keeping sorting/capping inside `policy-eval.ts`.
2. The verbose top-K cap follows the existing selector trace budget of 5. Summary remains 3+3, and debug emits the full evaluated module matrix.
3. Source-size decision: user approved Option 1 on 2026-05-18. New formatting logic was extracted to a 76-line helper. Remaining growth in pre-existing over-800-line files is narrow public contract/dispatch glue:
   - `packages/engine/src/agents/policy-evaluation-core.ts` | 2537 lines after | +13 active lines | pre-existing over 800 | extracted formatting; retained cache delegation only.
   - `packages/engine/src/agents/policy-eval.ts` | 1656 lines after | +9 active lines | pre-existing over 800 | retained metadata plumbing only.
   - `packages/engine/src/kernel/types-core.ts` | 2590 lines after | +20 active lines | pre-existing over 800 | public trace types belong with existing trace contracts.
   - `packages/engine/src/kernel/schemas-core.ts` | 2993 lines after | +26 active lines | pre-existing over 800 | schema source mirrors the public trace contract.

Verification:

1. `pnpm -F @ludoforge/engine build` - passed.
2. `node --test packages/engine/dist/test/unit/agents/strategy-module-trace-*.test.js` - passed, 4 tests.
3. `pnpm -F @ludoforge/engine run schema:artifacts:check` - passed.
4. `pnpm turbo build` - passed.
5. `pnpm turbo test` - passed after the final extraction; engine default lane reported 92/92 files passed and runner reported 205 files / 2019 tests passed.
6. `pnpm turbo lint` - passed.
7. `pnpm turbo typecheck` - passed.
8. `pnpm run check:ticket-deps` - passed before terminal status.

Post-ticket review:

1. Archived to `archive/tickets/182STRSTRPOL-003.md`.
2. Updated then-active dependents `archive/tickets/182STRSTRPOL-004.md` and `archive/tickets/182STRSTRPOL-005.md` to depend on the archived ticket path.
3. No follow-up tickets were created.
