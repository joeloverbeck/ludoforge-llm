# 65TACCOMSCO-001: Add tactical scoring considerations for ARVN Coup sub-phases

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — pure Tier 1 YAML
**Deps**: None

## Problem

ARVN Coup sub-phase decisions (redeployment, pacification) produce massive numbers of candidates with identical scores. Redeployment destination choices are resolved by `stableMoveKey` (alphabetical zone names), making troop positioning effectively random with respect to strategic value. No existing consideration evaluates zone-level properties (population, enemy proximity) for redeployment destinations or pacification targets.

## Assumption Reassessment (2026-04-11)

1. **Redeployment actions use `chooseOne` completions for destination**: Confirmed. `coupArvnRedeployMandatory` (`30-rules-actions.md:602`), `coupArvnRedeployOptionalTroops` (`:711`), and `coupArvnRedeployPolice` (`:821`) all have only `sourceSpace` as a parameter. Destination is `chooseOne: { bind: $destination }` inside effects (`:678-679`).
2. **Completion-scoped considerations can target `$destination`**: Confirmed. The completion evaluation pipeline (`completion-guidance-choice.ts`) scores both `chooseOne` and `chooseN` options. `decision.name` resolves to the bind name (e.g., `$destination`) via `resolveDecisionIntrinsic` (`policy-runtime.ts:313`). `option.value` resolves to the zone ID being scored (`:322`).
3. **`zoneProp` and `adjacentTokenAgg` are implemented**: Confirmed. Both are known operators in `policy-expr.ts:84-86`, evaluated in `policy-evaluation-core.ts:524-684`. Already used by existing considerations (e.g., `preferPopulousTargets` at `92-agents.md:369-371`).
4. **`coupPacifyARVN` has `targetSpace` parameter**: Confirmed (`30-rules-actions.md:335`). Move-scoped `candidate.param.targetSpace` is valid for pacification.
5. **`arvn-evolved` profile exists**: Confirmed at `92-agents.md:470-491` with current considerations list at lines 482-489.

## Architecture Check

1. **Pure declarative data**: All scoring logic uses existing DSL operators (`zoneProp`, `adjacentTokenAgg`, `coalesce`, `when` guards). No engine code changes needed — the evaluation pipeline is fully generic.
2. **Engine agnosticism preserved**: New considerations are game-specific YAML in the FITL data directory, not engine code. The kernel/compiler/runtime remain game-agnostic.
3. **No backwards-compatibility concerns**: Adding new library items and referencing them from a profile is purely additive. No existing behavior changes.

## What to Change

### 1. Add redeployment destination considerations to the library

In `data/games/fire-in-the-lake/92-agents.md`, add two new completion-scoped considerations to the `library.considerations` section:

**`preferRedeployToPopulousZones`**:
```yaml
preferRedeployToPopulousZones:
  scopes: [completion]
  when:
    eq:
      - { ref: decision.name }
      - "$destination"
  weight: 2
  value:
    coalesce:
      - zoneProp:
          zone: { ref: option.value }
          prop: population
      - 0
```

**`preferRedeployNearEnemies`**:
```yaml
preferRedeployNearEnemies:
  scopes: [completion]
  when:
    eq:
      - { ref: decision.name }
      - "$destination"
  weight: 1
  value:
    coalesce:
      - adjacentTokenAgg:
          anchorZone: { ref: option.value }
          aggOp: count
          tokenFilter:
            props:
              faction: { eq: VC }
              type: { eq: guerrilla }
      - 0
```

Both use `when` guards on `decision.name: $destination` to restrict firing to the redeployment destination `chooseOne` completion. Other completions (e.g., pacification action selection) use different bind names and are unaffected.

### 2. Add pacification scoring consideration to the library

In the same `library.considerations` section, add:

**`preferPacifyPopulousZones`**:
```yaml
preferPacifyPopulousZones:
  scopes: [move]
  when:
    eq: [{ ref: candidate.actionId }, coupPacifyARVN]
  weight: 3
  value:
    coalesce:
      - zoneProp:
          zone: { ref: candidate.param.targetSpace }
          prop: population
      - 0
```

This is move-scoped because `coupPacifyARVN` exposes `targetSpace` as an action parameter.

### 3. Wire new considerations into the `arvn-evolved` profile

Add all three consideration names to the `arvn-evolved` profile's `use.considerations` array (currently at `92-agents.md:482-489`):

```yaml
considerations:
  - preferProjectedSelfMargin
  - preferStrongNormalizedMargin
  - preferGovernWeighted
  - preferTrainWeighted
  - governWhenPatronageLow
  - trainWhenControlLow
  - preferPopulousTargets
  - preferRedeployToPopulousZones      # new
  - preferRedeployNearEnemies          # new
  - preferPacifyPopulousZones          # new
```

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)

## Out of Scope

- Engine code changes — all operators already exist
- Source zone scoring for redeployment (future work per spec)
- NVA token counting in threat metric (spec confirmed VC guerrillas only)
- Changes to other faction profiles (NVA, VC, US)
- Changes to action definitions or turn flow

## Acceptance Criteria

### Tests That Must Pass

1. Redeployment `$destination` completion decisions in ARVN traces show non-zero score gaps for at least 80% of completions (vs 0% currently)
2. ARVN troop positioning correlates with zone population and enemy proximity (verifiable via trace inspection)
3. No regression in strategic decision quality (Govern/Train selection unchanged)
4. Existing suite: `pnpm turbo test`

### Invariants

1. Engine code remains unchanged — all new behavior is declarative YAML
2. Existing considerations and profiles for other factions are unaffected
3. The `when` guards ensure new considerations only fire for their target decisions

## Test Plan

### New/Modified Tests

No new test files. Verification is via tournament harness trace comparison (before/after).

### Commands

1. Run tournament at tier 15 and compare redeployment decision gaps:
   - Before: all destination choices undifferentiated (gap=0)
   - After: destination completions differentiated, gap > 0
2. `pnpm turbo build` — compile succeeds
3. `pnpm turbo test` — full suite passes
4. `pnpm turbo typecheck` — no type errors

## Outcome

- Completed: 2026-04-11

- Added `preferRedeployToPopulousZones`, `preferRedeployNearEnemies`, and `preferPacifyPopulousZones` to `data/games/fire-in-the-lake/92-agents.md`.
- Wired all three considerations into the `arvn-evolved` profile.
- Updated FITL production compilation expectations in `packages/engine/test/integration/fitl-production-data-compilation.test.ts`.
- Regenerated the owned FITL policy goldens required by the changed compiled catalog surface:
  - `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json`
  - `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json`
- `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json` was also rewritten by the repo sync script, but produced no content diff.

### Verification Run

- `pnpm turbo build`
- `pnpm turbo test`
- `pnpm turbo typecheck`
- Focused red-green proof during fallout triage:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-production-data-compilation.test.js`
- Bounded tournament evidence:
  - `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 3 --max-turns 100`
  - `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 9 --max-turns 100`

### Evidence Notes

- Pacification differentiation is directly visible in saved traces. In `campaigns/fitl-arvn-agent-evolution/traces/trace-1008.json`, `preferPacifyPopulousZones` contributes different values across ARVN pacify candidates and produces non-zero tactical gaps.
- The bounded 9-seed run reached the redeploy-heavy seed `1008` again (`63` tactical ARVN decisions in the saved trace), so the live policy/catalog path is exercised under the intended coup sub-phase.
- Current tournament trace summaries do not expose nested completion-scoped contribution breakdowns for `$destination`, so redeploy destination scoring is validated indirectly through the compiled catalog/golden updates rather than a direct per-completion trace assertion in this ticket.

### Boundary Notes

- Draft/untracked status confirmed at start: this ticket was untracked; `specs/65-tactical-completion-scoring.md` already existed as a tracked draft with unrelated in-progress edits.
- Discrepancy class: nonblocking only. The ticket’s implementation boundary was correct; verification fallout required adjacent test and golden updates.
- Files-to-touch expanded beyond the draft’s single YAML file because repo-owned FITL integration tests and policy goldens are authoritative fallout for a changed compiled policy catalog.
