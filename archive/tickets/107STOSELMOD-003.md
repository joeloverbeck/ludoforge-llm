# 107STOSELMOD-003: Add selection trace recording and migrate Texas Hold'em

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — policy-eval seed/trace metadata, types-core/schemas-core trace contracts, Texas data files, test fixtures
**Deps**: `archive/tickets/107STOSELMOD-002.md`, `specs/107-stochastic-selection-modes.md`

## Problem

With selection mode types (ticket 001) and runtime logic (ticket 002) in place, traces don't yet record which selection mode was used or what sampling probabilities were computed. Without trace data, post-hoc analysis of agent behavior under stochastic selection is impossible. Additionally, Texas Hold'em should opt into `softmaxSample`, but the current ticket-002 runtime seed derivation uses authoritative hidden state, which strains Foundation 4 because acting-seat-invisible hidden information can influence behavior without being part of the acting observer's projection.

## Assumption Reassessment (2026-04-02)

1. `PolicyPreviewUsageTrace` at `types-core.ts:1532` has `mode` field (added by Spec 105) — confirmed pattern for selection trace.
2. `PolicyCandidateDecisionTrace` at `types-core.ts:1509` records per-candidate data — confirmed; selection trace is per-evaluation, not per-candidate.
3. Texas Hold'em `data/games/texas-holdem/92-agents.md` has `baseline` profile with `preview: { mode: disabled }` and no authored `selection` — confirmed; it still compiles to default `argmax`.
4. `policy-eval.ts` currently derives stochastic selection seeds from authoritative RNG state plus full `state.stateHash` — confirmed; this makes acting-seat-invisible hidden-state changes affect stochastic choice.
5. `texas-holdem-policy-agent.test.ts` already asserts that changing only opponent-hidden cards does not change the acting player's choice — confirmed. That invariant becomes architecturally important once Texas adopts stochastic selection.
6. FITL profiles have no authored `selection` field — confirmed; they use default `argmax` and need no data migration.

## Architecture Check

1. This ticket now owns the Foundation-4 correction needed before Texas can adopt stochastic selection: stochastic choice must be derived from observer-visible policy inputs, not from acting-seat-invisible hidden authoritative state.
2. `PolicySelectionTrace` remains a trace extension over that corrected runtime behavior — Foundation 9 requires enough information to explain and audit stochastic choice.
3. Texas Hold'em migration remains a data-level change in GameSpecDoc YAML, not game-specific engine branching (Foundation 1).
4. No compatibility shim is introduced. The runtime seed derivation is corrected in place, then traces and Texas migration follow the corrected boundary (Foundation 14).

## What to Change

### 1. Correct stochastic seed derivation to observer-visible policy inputs

Update `policy-eval.ts` so stochastic selection derives its deterministic seed from observer-visible policy evaluation inputs rather than full authoritative hidden state. The corrected seed source must:

- remain deterministic and non-consuming
- remain generic across games
- stay stable when only acting-seat-invisible hidden data changes
- vary when the acting observer's evaluated candidate set or scores change

This correction is a prerequisite for Texas Hold'em to opt into `softmaxSample` without violating the observer/projection boundary.

### 2. Add `PolicySelectionTrace` type to `types-core.ts`

```typescript
export interface PolicySelectionTrace {
  readonly mode: AgentSelectionMode;
  readonly temperature?: number;              // for softmaxSample
  readonly candidateCount: number;
  readonly samplingProbabilities?: readonly number[];  // for stochastic modes
  readonly selectedIndex: number;
}
```

### 3. Integrate selection trace into evaluation trace output

Where the evaluation result is assembled in `policy-eval.ts`, add the selection trace to the metadata/result structure. For `argmax`, omit `samplingProbabilities` and `temperature`. For stochastic modes, record the full probability distribution and which candidate was selected.

### 4. Migrate Texas Hold'em profile

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

### 5. Update golden test fixtures

Regenerate any compiled GameDef or trace golden snapshots that include agent profile data. Run `pnpm turbo schema:artifacts` if schema changed.

### 6. Full verification

Verify no profile compilation issues across all games. Run full test suite.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify — visible-state seed derivation + selection trace recording)
- `packages/engine/src/agents/policy-diagnostics.ts` (modify — thread selection trace into policy decision payloads)
- `packages/engine/src/kernel/types-core.ts` (modify — add `PolicySelectionTrace`)
- `packages/engine/src/kernel/schemas-core.ts` (modify — add schema for selection trace)
- `data/games/texas-holdem/92-agents.md` (modify — add selection config)
- Tests and golden fixtures in `packages/engine/test/` (modify — as discovered)

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
5. Texas stochastic selection is invariant when only acting-seat-invisible hidden cards change
6. Texas Hold'em integration test produces non-trivial action distributions across seeds
7. FITL profiles compile unchanged (no authored `selection` field = default `argmax`)
8. Full suite: `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

### Invariants

1. Trace `mode` matches the compiled profile's `selection.mode` — never computed or inferred
2. `samplingProbabilities` sum to ~1.0 (within float precision) for stochastic modes
3. Stochastic selection is derived from observer-visible policy inputs, not acting-seat-invisible hidden state (Foundation 4)
4. Traces remain deterministic — same inputs produce identical traces (Foundation 8)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — add trace assertions and a hidden-info-invariant stochastic-selection regression
2. `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` — migrate Texas to `softmaxSample`, preserve hidden-info invariance, and verify non-trivial action distributions across seeds
3. `packages/engine/test/unit/trace/policy-trace-events.test.ts` — assert selection trace fields in summary/verbose payloads
4. `packages/engine/test/unit/json-schema.test.ts` — validate serialized traces with the new selection trace shape

### Commands

1. `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js`
2. `node --test packages/engine/dist/test/integration/texas-holdem-policy-agent.test.js`
3. `node --test packages/engine/dist/test/unit/trace/policy-trace-events.test.js`
4. `pnpm -F @ludoforge/engine run schema:artifacts && pnpm -F @ludoforge/engine run schema:artifacts:check`
5. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-04-02

- Rewrote the ticket boundary before implementation so `107STOSELMOD-003` owned the required Foundation-4 seed-policy correction instead of layering Texas migration on top of the archived `107-002` semantics.
- Updated `packages/engine/src/agents/policy-eval.ts` so stochastic selection derives its deterministic non-consuming seed from observer-visible policy inputs, not acting-seat-invisible hidden authoritative state.
- Added `PolicySelectionTrace` to the policy trace contract in `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/schemas-core.ts`, and `packages/engine/src/agents/policy-diagnostics.ts`, then regenerated `packages/engine/schemas/Trace.schema.json`.
- Migrated Texas Hold'em authored agent data in `data/games/texas-holdem/92-agents.md` to `selection: { mode: softmaxSample, temperature: 0.5 }`.
- Updated owned production fixtures in `packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json`, `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json`, and `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json`.
- Extended runtime/trace/Texas coverage in `packages/engine/test/unit/agents/policy-eval.test.ts`, `packages/engine/test/unit/trace/policy-trace-events.test.ts`, `packages/engine/test/integration/texas-holdem-policy-agent.test.ts`, and `packages/engine/test/integration/texas-holdem-spec-structure.test.ts`.
- Must-fix-now review cleanup: updated `packages/engine/src/cnl/validate-agents.ts` so authored `selection` no longer emits stale unknown-key diagnostics during Texas compilation.
- Verification passed:
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine run schema:artifacts`
  - `pnpm -F @ludoforge/engine run schema:artifacts:check`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo build`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
