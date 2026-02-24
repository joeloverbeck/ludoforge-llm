# FITLSEC2SCEDEC-004: Enforce Pivotal Event Single-Use via Card State

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic scenario schema/compiler support for scenario card placement + FITL data updates
**Deps**: None (Spec 44, Gap 4). Independent of FITLSEC2SCEDEC-001/002/003.

## Problem

The `pivotalEvent` action in `30-rules-actions.md` (line ~996) has empty `effects: []` and empty `limits: []`. There is no mechanism preventing a player from invoking `pivotalEvent` for the same card ID on multiple turns. The FITL rules (Section 2.3.8) require that once a pivotal event is played, its card goes to the played pile and cannot be reused. A canceled pivotal is returned to its owner for possible later use.

## Assumption Reassessment (2026-02-23)

1. `pivotalEvent` action at `30-rules-actions.md:996-1024` — confirmed: `effects: []`, `limits: []`, precondition checks only player-to-card mapping.
2. No `pivotalUsed_*` global vars exist in `10-vocabulary.md` — confirmed (grep returned no matches).
3. The precondition (`pre`) field uses `{ ref: activePlayer }` to match player index to card ID (US=0→card-121, ARVN=1→card-123, NVA=2→card-122, VC=3→card-124) — confirmed.
4. Global variable references in FITL action preconditions/effects use `{ ref: gvar, var: ... }` (not `{ ref: globalVar, name: ... }`) — confirmed.
5. Conditional effects use `if: { when: ..., then: ..., else?: ... }` shape (not `condition`) — confirmed.
5. Cancellation: if the interrupt system cancels before effects run, the used flag is never set, correctly allowing reuse — this is the current engine behavior.

## Architecture Check

1. Uses existing vocabulary + precondition + effect mechanisms. No new engine primitives needed.
2. Game-specific data stays in `data/games/fire-in-the-lake/`. No kernel/compiler/runtime changes.
3. 4 new `globalVars` with `type: boolean, init: false` encode single-use state directly.
4. No aliasing or shims introduced.

## What to Change

### 1. Add 4 pivotal-used globalVars to vocabulary

In `data/games/fire-in-the-lake/10-vocabulary.md`, add to the `globalVars` section:

```yaml
  - name: pivotalUsed_card121
    type: boolean
    init: false
  - name: pivotalUsed_card122
    type: boolean
    init: false
  - name: pivotalUsed_card123
    type: boolean
    init: false
  - name: pivotalUsed_card124
    type: boolean
    init: false
```

### 2. Add "not already used" precondition to each pivotalEvent branch

In `data/games/fire-in-the-lake/30-rules-actions.md`, extend each `op: and` branch in the `pivotalEvent` action's `pre` field with a third condition checking the corresponding used flag equals 0:

- US branch (player 0, card-121): add `{ op: '==', left: { ref: gvar, var: pivotalUsed_card121 }, right: false }`
- NVA branch (player 2, card-122): add `{ op: '==', left: { ref: gvar, var: pivotalUsed_card122 }, right: false }`
- ARVN branch (player 1, card-123): add `{ op: '==', left: { ref: gvar, var: pivotalUsed_card123 }, right: false }`
- VC branch (player 3, card-124): add `{ op: '==', left: { ref: gvar, var: pivotalUsed_card124 }, right: false }`

### 3. Add set-used-flag effects to pivotalEvent

Replace the empty `effects: []` with conditional `setVar` effects that mark the played pivotal as used:

```yaml
    effects:
      - if:
          when: { op: '==', left: { ref: binding, name: eventCardId }, right: card-121 }
          then:
            - setVar: { scope: global, var: pivotalUsed_card121, value: true }
      - if:
          when: { op: '==', left: { ref: binding, name: eventCardId }, right: card-122 }
          then:
            - setVar: { scope: global, var: pivotalUsed_card122, value: true }
      - if:
          when: { op: '==', left: { ref: binding, name: eventCardId }, right: card-123 }
          then:
            - setVar: { scope: global, var: pivotalUsed_card123, value: true }
      - if:
          when: { op: '==', left: { ref: binding, name: eventCardId }, right: card-124 }
          then:
            - setVar: { scope: global, var: pivotalUsed_card124, value: true }
```

## Files to Touch

- `data/games/fire-in-the-lake/10-vocabulary.md` (modify — add 4 globalVars)
- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — update `pivotalEvent` action pre + effects)

## Out of Scope

- Deck exclusions (covered by FITLSEC2SCEDEC-001 and FITLSEC2SCEDEC-002)
- `leaderBoxCardCount` initialization (covered by FITLSEC2SCEDEC-003)
- Period filter schema or data (covered by FITLSEC2SCEDEC-005)
- Cancellation/interrupt system changes — if cancel happens before effects, the flag is not set (correct behavior per rules). If the interrupt system needs changes to support cancel-after-effects, that is a separate spec.
- Any engine/compiler/kernel code changes
- Any changes to `40-content-data-assets.md` or `41-content-event-decks.md`

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — clean compilation
2. `pnpm turbo test` — all existing tests pass
3. **New test — vocabulary**: Compile production spec, confirm 4 new boolean globalVars (`pivotalUsed_card121` through `pivotalUsed_card124`) exist with `init: false`.
4. **New test — precondition**: Compile production spec, find the `pivotalEvent` action definition, and assert each of the 4 `op: and` branches has 3 conditions (player match + card match + used-flag-is-0).
5. **New test — effects**: Compile production spec, find the `pivotalEvent` action definition, and assert `effects` contains 4 conditional `setVar` entries (one per pivotal card ID).
6. **New test — behavioral (initial state)**: After compiling with full scenario, initialize state, verify `pivotalUsed_card121` through `pivotalUsed_card124` are all `false` in initial `state.globalVars`.
7. **New test — behavioral (single-use)**: Execute `pivotalEvent` once for an eligible seat/card pair, then re-open a pivotal pre-action window and verify the same seat/card is no longer legal due to used-flag gating.

### Invariants

1. The `pivotalEvent` action's `id`, `actor`, `executor`, `phase`, and `params` remain unchanged.
2. The player-to-card mapping logic (US=0→121, ARVN=1→123, NVA=2→122, VC=3→124) remains unchanged.
3. The `limits: []` field remains empty (single-use is enforced via precondition, not limits).
4. Existing pivotal event card definitions in `41-content-event-decks.md` remain unchanged.
5. No new engine-level constructs introduced — uses existing `globalVar` references and `setVar` effects.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-pivotal-single-use.test.ts` — new test file exercising vocabulary, precondition structure, effects structure, initial state, and runtime single-use behavior via `compileProductionSpec()`.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo build && pnpm turbo test`

## Outcome

- **Completion date**: 2026-02-24
- **What changed**:
  - Added generic `ScenarioPayload.cardPlacements` schema/type support and compiler materialization into setup card tokens.
  - Added FITL `cardPlacements` for Medium/Full scenarios to place cards `121-124` into `leader:none` at setup.
  - Reworked `pivotalEvent` to gate legality by card-token presence in `leader:none` and move the played pivotal token to `played:none`.
  - Removed FITL-specific `pivotalUsed_*` global-var approach in favor of token-driven lifecycle.
  - Fixed Tet return logic (`card-96` shaded) to match pivotal token by `cardId` property.
  - Added integration test `packages/engine/test/integration/fitl-pivotal-single-use.test.ts` covering structural + runtime token-lifecycle behavior.
- **Deviations from original plan**:
  - Superseded initial flag-based plan with a cleaner token-state architecture to keep game rules data-driven and avoid FITL-specific state flags in vocabulary.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm turbo build` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
