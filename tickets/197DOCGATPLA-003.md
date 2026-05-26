# 197DOCGATPLA-003: FITL ARVN `buildPoliticalEngine` migration + convergence witness

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — data + test only
**Deps**: `tickets/197DOCGATPLA-001.md`, `tickets/197DOCGATPLA-002.md`

## Problem

With 001 (schema + validator) and 002 (eligibility filter + trace) landed, the feature is structurally complete but has no production exercise on a real game profile. This ticket migrates the existing `buildPoliticalEngine` ARVN doctrine to declare `enablesPlanTemplates` + `suppressesPlanTemplates` and adds a FITL convergence witness asserting active/inactive gating behavior. This is the architectural exemplar from spec §4.4.

## Assumption Reassessment (2026-05-26)

1. `buildPoliticalEngine` lives at `data/games/fire-in-the-lake/92-agents.md:1457-1505` (range covers the full module body; spec §3 quoted a simplified `when` clause for illustration — actual uses `{ ref: feature.coinControlPop }` / `{ ref: feature.projectedSelfMargin }` for the numeric refs). Confirmed via direct read.
2. Migration target plan templates all exist in the FITL profile: `arvn.trainGovern` (line 990), `arvn.patrolGovern` (line 1002), `arvn.assaultRaid` (line 1027). Confirmed via grep at ticket-authoring time.
3. The compiler rules from 001 will validate these references at compile time; this migration is the first production use of `enablesPlanTemplates` / `suppressesPlanTemplates` in the codebase.
4. `buildPoliticalEngine` carries `applies.scopes: [move]` and `applies.actionTags: [train]` and `priority: { tier: 30 }` today. The migration adds two fields; no other fields are modified.

## Architecture Check

1. **Engine agnosticism preserved (F#1)**: This ticket changes only the FITL game YAML; engine code is unchanged. The gating mechanism remains generic.
2. **Evolution-first (F#2)**: The doctrine-driven activation behavior is encoded entirely in `data/games/fire-in-the-lake/92-agents.md`. No engine support added for FITL-specific doctrine semantics.
3. **Convergence witness, not architectural invariant**: This witness asserts trajectory-specific behavior for the FITL profile (`buildPoliticalEngine` active → `arvn.assaultRaid` filtered). Per `.claude/rules/testing.md`, mark as `convergence-witness` with `witness: 197DOCGATPLA-003-fitl-buildpoliticalengine-gating`. The general property (any active enables/suppresses module restricts the candidate set) is the architectural invariant owned by ticket 004.
4. **Testing as proof (F#16)**: The witness proves the architectural feature works end-to-end on a real game profile, complementing 002's synthetic per-shape tests and 004's cross-profile property tests.

## What to Change

### 1. Extend `buildPoliticalEngine` with gating fields

In `data/games/fire-in-the-lake/92-agents.md`, modify the `buildPoliticalEngine` module body (currently ending around line 1505) by appending two fields after the existing `fallback:` block:

```yaml
      buildPoliticalEngine:
        traceLabel: "build political engine"
        when: ...                                        # unchanged
        applies:
          scopes: [move]
          actionTags: [train]
        priority:
          tier: 30
        selectors: ...                                   # unchanged
        scoreGroups: ...                                 # unchanged
        guardrailIds: []
        fallback:
          ifInactive: noContribution
          ifSelectorEmpty: noContribution
        enablesPlanTemplates:
          - arvn.trainGovern
          - arvn.patrolGovern
        suppressesPlanTemplates:
          - arvn.assaultRaid   # aggressive plan family suppressed while building political engine
```

The aggressive plan family `arvn.assaultRaid` is suppressed while the political-engine-building doctrine is active. `arvn.trainGovern` and `arvn.patrolGovern` are enabled as the doctrine-aligned alternatives. Other templates not mentioned in either set become ineligible (since `enablesPlanTemplates` is now non-empty for an active doctrine — the eligibility filter intersects with this set).

### 2. FITL convergence witness

New test file: `packages/engine/test/unit/agents/fitl-buildpoliticalengine-gating-witness.test.ts`. Marker:

```ts
// @test-class: convergence-witness
// @witness: 197DOCGATPLA-003-fitl-buildpoliticalengine-gating
```

The witness loads the FITL profile, constructs a state where `buildPoliticalEngine`'s `when` clause is satisfied (i.e., `condition.selfPoliticalEngineBehind.satisfied` true, `condition.militaryBoardCollapsing.satisfied` false, and the numeric or-branch satisfied), invokes the plan proposer, and asserts:

- `arvn.assaultRaid` is in the trace's `filteredOutTemplates` with `reason: 'suppressed'` and `gatedBy: ['buildPoliticalEngine']`.
- `arvn.trainGovern` and `arvn.patrolGovern` are in the eligible set (if `applies.actionTags: [train]` matches the root candidate's tags).
- Templates not in either gating set are also in `filteredOutTemplates` with `reason: 'notEnabled'` (because any active module declaring enables-sets makes the union the only-eligible set).

A second test case constructs a state where `buildPoliticalEngine`'s `when` clause is NOT satisfied, invokes the proposer, and asserts `arvn.assaultRaid` is NOT in `filteredOutTemplates` (the inverse — when the doctrine is inactive, no filter applies).

### 3. Determinism guard

Existing FITL convergence tests must remain unchanged. Run the full FITL test suite to confirm no other witnesses regress. The default-permissive replay-identity from 002 already covered the case where no gating fields are declared; this ticket changes that for `buildPoliticalEngine` specifically — any pre-existing test pinned to `arvn.assaultRaid` candidacy under `buildPoliticalEngine` activation will need updating, BUT the spec §7 P3 acceptance asserts "FITL convergence witnesses unchanged for unaffected templates" — i.e., the change is scoped and other-template witnesses must not regress.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — add gating fields to `buildPoliticalEngine`)
- `packages/engine/test/unit/agents/fitl-buildpoliticalengine-gating-witness.test.ts` (new — convergence witness)

## Out of Scope

- Migration of other FITL doctrine modules (`harvestPatronage`, US/NVA/VC modules) to use gating — explicitly out of scope per spec §2 Non-Goals and §11.
- Per-target-role doctrine influence — explicitly out of scope per spec §11.
- Cross-profile architectural-invariant tests across synthesized profile variants — owned by 004.
- Plan-controller behavior changes — explicitly out of scope per spec §2.

## Acceptance Criteria

### Tests That Must Pass

1. **Active witness**: With FITL state satisfying `buildPoliticalEngine.when`, `arvn.assaultRaid` appears in `filteredOutTemplates` with `reason: 'suppressed'` and `gatedBy: ['buildPoliticalEngine']`.
2. **Inactive witness (inverse)**: With FITL state NOT satisfying `buildPoliticalEngine.when`, `arvn.assaultRaid` does NOT appear in `filteredOutTemplates`.
3. **Compile**: FITL profile compiles cleanly with the new gating fields (validates against 001's compiler rules).
4. **FITL convergence preservation**: Existing FITL convergence witnesses unaffected by this change pass unchanged.
5. Existing engine suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. **Witness specificity**: The new witness tests the FITL `buildPoliticalEngine` doctrine *specifically*; it does not double as an architectural invariant. The architectural property (any active module's `enablesPlanTemplates` restricts the candidate set) is asserted in 004 against synthesized profiles.
2. **Determinism (F#8)**: `pnpm turbo build` twice produces byte-identical GameDef including the modified FITL profile.
3. **Authoring discipline (F#2)**: The doctrine-driven activation behavior remains encoded entirely in YAML — no engine code changes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/fitl-buildpoliticalengine-gating-witness.test.ts` (new) — covers acceptance 1-2. Two test cases (active / inactive). Test class: `convergence-witness` with witness id `197DOCGATPLA-003-fitl-buildpoliticalengine-gating`.

### Commands

1. `pnpm turbo build && pnpm -F @ludoforge/engine test:unit dist/test/unit/agents/fitl-buildpoliticalengine-gating-witness.test.js`
2. `pnpm -F @ludoforge/engine test` (full engine suite — confirm no other FITL witnesses regress)
3. `pnpm turbo lint typecheck test`
