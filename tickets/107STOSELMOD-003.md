# 107STOSELMOD-003: Add selection trace recording and migrate Texas Hold'em

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — types-core (trace types), policy-eval (trace recording), data files, test fixtures
**Deps**: `archive/tickets/107STOSELMOD-002.md`, `specs/107-stochastic-selection-modes.md`

## Problem

With selection mode types (ticket 001) and runtime logic (ticket 002) in place, traces don't yet record which selection mode was used or what sampling probabilities were computed. Without trace data, post-hoc analysis of agent behavior under stochastic selection is impossible. Additionally, Texas Hold'em profiles should opt into `softmaxSample` to enable mixed strategies appropriate for imperfect-information games.

## Assumption Reassessment (2026-04-02)

1. `PolicyPreviewUsageTrace` at `types-core.ts:1532` has `mode` field (added by Spec 105) — confirmed pattern for selection trace.
2. `PolicyCandidateDecisionTrace` at `types-core.ts:1509` records per-candidate data — confirmed; selection trace is per-evaluation, not per-candidate.
3. Texas Hold'em `data/games/texas-holdem/92-agents.md` has `baseline` profile with `preview: { mode: disabled }` — confirmed; needs `selection` added.
4. FITL profiles have no `selection` field — confirmed; they use default `argmax` and need no migration.

## Architecture Check

1. `PolicySelectionTrace` is a trace extension — purely additive, no behavioral change.
2. Texas Hold'em migration is a data-level change — game-specific content in GameSpecDoc, not engine code (Foundation 1).
3. Foundation 9 (Replay and Auditability) requires trace data sufficient for analysis — the selection trace directly supports this.

## What to Change

### 1. Add `PolicySelectionTrace` type to `types-core.ts`

```typescript
export interface PolicySelectionTrace {
  readonly mode: AgentSelectionMode;
  readonly temperature?: number;              // for softmaxSample
  readonly candidateCount: number;
  readonly samplingProbabilities?: readonly number[];  // for stochastic modes
  readonly selectedIndex: number;
}
```

### 2. Integrate selection trace into evaluation trace output

Where the evaluation result is assembled in `policy-eval.ts`, add the selection trace to the metadata/result structure. For `argmax`, omit `samplingProbabilities` and `temperature`. For stochastic modes, record the full probability distribution and which candidate was selected.

### 3. Migrate Texas Hold'em profile

In `data/games/texas-holdem/92-agents.md`, add to `baseline` profile:

```yaml
profiles:
  baseline:
    observer: public
    preview:
      mode: disabled
    selection:
      mode: softmaxSample
      temperature: 0.5
```

### 4. Update golden test fixtures

Regenerate any compiled GameDef or trace golden snapshots that include agent profile data. Run `pnpm turbo schema:artifacts` if schema changed.

### 5. Full verification

Verify no profile compilation issues across all games. Run full test suite.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add `PolicySelectionTrace`)
- `packages/engine/src/agents/policy-eval.ts` (modify — record selection trace)
- `data/games/texas-holdem/92-agents.md` (modify — add selection config)
- Golden fixtures in `packages/engine/test/` (modify — as discovered)

## Out of Scope

- Changing FITL profiles (they stay default `argmax`)
- Adding new selection modes beyond what Spec 107 defines
- Analytics or visualization consuming the new trace fields
- Changing per-candidate trace structure (`PolicyCandidateDecisionTrace`)

## Acceptance Criteria

### Tests That Must Pass

1. Trace entries include `mode` field matching the profile's selection mode
2. `softmaxSample` traces include `temperature` and `samplingProbabilities`
3. `argmax` traces omit `samplingProbabilities` and `temperature`
4. Texas Hold'em `baseline` compiles with `selection: { mode: softmaxSample, temperature: 0.5 }`
5. Texas Hold'em integration test produces non-trivial action distributions across seeds
6. FITL profiles compile unchanged (no `selection` field = default `argmax`)
7. Full suite: `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

### Invariants

1. Trace `mode` matches the compiled profile's `selection.mode` — never computed or inferred
2. `samplingProbabilities` sum to ~1.0 (within float precision) for stochastic modes
3. Traces remain deterministic — same inputs produce identical traces (Foundation 8)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — add trace assertions for selection mode, temperature, probabilities
2. `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` — update for `softmaxSample` selection, verify non-trivial action distributions
3. `packages/engine/test/unit/trace/policy-trace-events.test.ts` — update if trace shape golden exists

### Commands

1. `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js`
2. `node --test packages/engine/dist/test/integration/texas-holdem-policy-agent.test.js`
3. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
