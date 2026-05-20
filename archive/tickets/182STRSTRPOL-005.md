# 182STRSTRPOL-005: Phase 2 — ARVN `build-political-engine` module authoring + cookbook entry

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `data/games/fire-in-the-lake/92-agents.md` (new module + supporting selector binding), `docs/agent-dsl-cookbook.md` (new cookbook entry)
**Deps**: `archive/tickets/182STRSTRPOL-003.md`

## Problem

Spec 182 Phase 2 acceptance (c) requires authoring one ARVN top-level action grouping (`build-political-engine` per proposal §14.1) as a module + selector binding + grouped score, proving the layer can express named strategic intent rather than flat action-tag weights. Per the reassessment, this is **net-new authoring** — `build-political-engine` does not currently exist in `data/games/fire-in-the-lake/92-agents.md`. The cookbook entry in `docs/agent-dsl-cookbook.md` documents the authoring shape so future profile authors have a worked example.

## Assumption Reassessment (2026-05-18)

1. `data/games/fire-in-the-lake/92-agents.md` currently declares 36 considerations, mostly flat action-tag-weighted (e.g., `preferGovernAction`, `preferTrainAction`); one consideration uses the `arvnMicroturnOptionProjectedMargin` selector — confirmed during reassessment.
2. `archive/reports/ai-agent-overhaul-proposal.md` §14.1 describes the `build-political-engine` intent; the spec's own §3.2 describes the shape.
3. `docs/agent-dsl-cookbook.md` exists and is the canonical authoring guide.
4. The Spec 181 ARVN action-distribution probe (calibrated in 181STRSTRPOL-003) must continue to pass or improve after this module lands.

## Architecture Check

1. The module + supporting selector binding lives entirely in YAML game data (Foundation #1, #2).
2. The cookbook entry is documentation — no engine code changes.
3. The module replaces some action-tag weighting with grouped score over a selector — Foundation #15 (Architectural Completeness): named intent rather than scattered weights.
4. Per spec §14.1, `build-political-engine` activates "When `condition.selfPoliticalEngineBehind.satisfied` AND NOT `condition.militaryBoardCollapsing.satisfied`, I am in *build-political-engine* mode" — both conditions referenced are author-declared YAML, not engine knowledge.

## What to Change

### 1. New conditions (if absent)

Verify whether `condition.selfPoliticalEngineBehind` and `condition.militaryBoardCollapsing` already exist in the ARVN section of `92-agents.md`. If absent, author them as new strategic conditions per the existing condition-authoring pattern in the file.

### 2. Supporting selector (if absent)

The political-target selector mentioned in spec §3.2 may need to be authored. Use the existing `arvnMicroturnOptionProjectedMargin` selector pattern (lines 207-228) as a template. If the political-target selector requires data not currently captured, document the gap in the ticket's Outcome section and either (a) author a minimal version using available refs or (b) escalate as a Spec 181 follow-on.

### 3. `build-political-engine` module

Add to `strategyModules`:

```yaml
strategyModules:
  build-political-engine:
    traceLabel: "build political engine"
    when:
      and:
        - { ref: condition.selfPoliticalEngineBehind.satisfied }
        - not: { ref: condition.militaryBoardCollapsing.satisfied }
    applies:
      scopes: [move]
      actionTags: [govern, rally, train]  # confirm actual ARVN political-action tag set during implementation
    priority:
      tier: 30
    selectors:
      - role: primaryTarget
        selectorId: <political-target-selector>  # authored above or referenced from existing
    scoreGroups:
      - id: targetQuality
        summary: sum
        terms:
          - weight: 24
            value: { ref: selector.<political-target-selector>.current.quality }
      - id: standing
        summary: sum
        terms:
          - weight: 12
            value: { ref: standingRole.self.delta.politicalEngine }  # confirm available standing-role ref
    guardrailIds: []  # Phase 3 attaches guardrails to this module via ticket 006+
    fallback:
      ifInactive: noContribution
      ifSelectorEmpty: demoteAndTrace
```

### 4. Cookbook entry

Add a section to `docs/agent-dsl-cookbook.md` titled "Authoring a strategic module" with the following structure:

- When to use a module (vs. flat action-tag weight)
- Activation conditions (`when`)
- Selector binding (`selectors[].role` ↔ `selectorId`)
- Score groups (`scoreGroups` with `summary: sum | product | max`)
- Fallback declarations (`ifInactive`, `ifSelectorEmpty`)
- Worked example: the `build-political-engine` module from this ticket

### 5. ARVN distribution probe verification

Run `arvn-action-distribution.probe.ts` against the post-module profile. Document the resulting distribution in the ticket's Outcome. Expected: action distribution shifts toward political actions when activation conditions are met, away when not. The probe should still pass (no action family dominating >60%) or improve.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — add module + supporting conditions/selector as needed)
- `docs/agent-dsl-cookbook.md` (modify — add "Authoring a strategic module" section)

## Out of Scope

- Engine code changes (modules infrastructure already in tickets 001-003).
- FITL conformance probe (ticket 004 — different module, smaller scope).
- Migration of additional ARVN considerations into modules; this ticket authors ONE module per spec §13 §6.1 "broader migration follows in subsequent ticket work outside this spec's mandatory scope".
- Texas Hold'em authoring (out of Spec 182 scope per §2).

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo test` — full suite (including Spec 181 ARVN action-distribution probe regression check).
2. `pnpm turbo lint`, `pnpm turbo typecheck`.
3. The Spec 181 ARVN action-distribution probe (`arvn-action-distribution.probe.ts`) continues to produce a `pass` outcome or improves.

### Invariants

1. All new YAML lives in game data, not engine code (Foundation #1).
2. The cookbook entry references generic IR primitives (modules, selectors, score groups) — no game-specific kernel knowledge implied.
3. Module activation is deterministic given the same state + seed (Foundation #8).

## Test Plan

### New/Modified Tests

1. (No new test files — verification is via existing ARVN action-distribution probe + full test suite.)

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/policy-profile-quality/probes/fire-in-the-lake.probes.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-19.

Implemented the ARVN `buildPoliticalEngine` strategic module in `data/games/fire-in-the-lake/92-agents.md` and documented the authoring pattern in `docs/agent-dsl-cookbook.md`.

What changed:
- Added `selfPoliticalEngineBehind` and `militaryBoardCollapsing` strategic conditions.
- Added the `arvnPoliticalTargetOpportunity` selector as a minimal available-ref political target selector.
- Added `buildPoliticalEngine` with grouped `targetQuality` and `standing` score groups, then wired the module through `applyBuildPoliticalEngineModule` on the `arvn-evolved` profile.
- Reduced `arvn-evolved` `governWeight` from `1000` to `700` and gated the module to targeted political-engine states so the existing ARVN action-distribution probe remains below its dominant-family cap.
- Added the cookbook section "Authoring a Strategic Module" with activation, selector binding, score group, fallback, and module-application examples.
- Re-blessed the Spec 178 ARVN continued-deepening outcome-parity fixtures for the intentional `arvn-evolved` trajectory shift.

Deviations from the draft:
- The drafted `standingRole.self.delta.politicalEngine` ref is not a shipped policy ref. The landed module uses current shipped FITL signals instead.
- The landed move-scope political target selector uses existing global projected-margin and controlled-population refs. It is intentionally minimal because per-zone political target quality is not currently exposed as a move-scope selector input.
- The module scores `train` in calibrated political-engine states rather than boosting both `govern` and `train`; boosting both preserved or worsened Govern dominance, while the landed calibration keeps the distribution probe green.

Verification:
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/integration/fitl-production-data-compilation.test.js` — passed, 3 tests.
- Direct probe-runner check for `arvn-action-distribution-not-dominated` and `arvn-module-activation` — both aggregate outcomes `pass`.
- `node --test packages/engine/dist/test/architecture/policy-preview-inner-outcome-parity.test.js` — passed, 5 tests.
- `pnpm turbo test` — passed.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm run check:ticket-deps` — passed.
