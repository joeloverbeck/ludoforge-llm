# 169PHASCHREF-006: Phase 5 — FITL phaseBoundaries authoring & demonstration consideration

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — game data + sandbox profile + test fixtures only
**Deps**: `tickets/169PHASCHREF-005.md`

## Problem

With Phases 0-4 shipped (engine-internal types, refs, schedule index, WASM port), Spec 169's value is unrealized until a real game declares `phaseBoundaries[]` and an agent profile reads the new refs. This ticket completes Spec 169 §7 Phase 5 by:

1. Authoring `phaseBoundaries: [coupEntry]` in `data/games/fire-in-the-lake/30-rules-actions.md` targeting `phaseId: coupVictory` with `schedule.kind: cardDraw` against `eventDeck`.
2. Sweeping FITL event card declarations to add `tags: [coup]` on coup-triggering cards. The exact card list is determined by reading the current event-deck data; per spec §10's "Code anchors", the sweep may touch many event card files.
3. Authoring **one** demonstration consideration in a sandbox profile (NOT `arvn-evolved`) that uses `schedule.distance.toBoundary.coupEntry.cards`. The consideration shows the trace fires non-zero contribution at appropriate game positions. The sandbox profile is illustrative — not a promotion, not a campaign deliverable.
4. A golden trace test pinning the FITL `coupEntry` distance at 5+ game positions.
5. A trace-shape test pinning the consideration's live fallback metadata and contribution structure. Per 003's completed TypeScript trace contract, unavailable schedule fallback evidence is exposed through `scheduleFallbackFired` candidate metadata rather than a generic ready-state `inputRefs` row.

This ticket is **deferred-execution** in the sense of the spec-to-tickets skill: it cannot land until 005 ships (engine support is complete) per Spec 169 §7's "Phases 0-4 must land before Phase 5 ships" mandate.

## Assumption Reassessment (2026-05-13)

1. **FITL coup is a 6-phase sequence**: confirmed via Explore agent during spec authoring (`data/games/fire-in-the-lake/30-rules-actions.md:5-12,132-146`). Phases: coupVictory → coupResources → coupSupport → coupRedeploy → coupCommitment → coupReset. The boundary targets `coupVictory` (the first).
2. **FITL event deck triggers coup via card identity**: confirmed; coup cards are a subset of `eventDeck` entries. Currently identified via `disallowWhenLookaheadIsCoup` mechanism. The exact card-id list lives in event-card definitions.
3. **`tags: [coup]` is not yet declared**: confirmed via grep — coup event cards do not currently carry an explicit `coup` tag. This ticket adds the tag to all coup-triggering cards (the sweep).
4. **`arvn-evolved` profile is paused at `compositeScore=-3.5333`**: per memory + gap report. This ticket explicitly does NOT modify `arvn-evolved`; the demonstration consideration lives in a separate sandbox profile.
5. **`policy-profile-quality` baseline must not regress**: spec §7 Phase 5 acceptance — "No regression on the `policy-profile-quality` baseline." Since `arvn-evolved` is untouched, the baseline must hold trivially. Confirm during implementation.

## Architecture Check

1. **Foundation #1 (Engine agnosticism)**: all changes are in `data/games/fire-in-the-lake/`. The engine learned nothing about coup in 001-005; this ticket is the first time FITL semantically uses the new ref family. Game-specific knowledge stays in GameSpecDoc.
2. **Foundation #2 (Evolution-first)**: `phaseBoundaries` is GameSpecDoc YAML. A future evolution run could mutate the boundary declaration or its `cardSelector` without engine changes.
3. **Foundation #16 (Testing as proof)**: golden trace test pins the actual coup-distance computation against real FITL deck composition. If the deck changes (event card list, coup card subset), the test must be re-blessed deterministically.
4. **No `arvn-evolved` mutation**: the sandbox demonstration profile is a separate file. `arvn-evolved` stays at `bff2babcc`'s consideration set. This is critical — Spec 169 explicitly defers the ARVN profile refactor (`preferGovernWeighted` decomposition) to a follow-up spec.

## What to Change

### 1. Author `phaseBoundaries` in FITL data

In `data/games/fire-in-the-lake/30-rules-actions.md` (or the canonical GameSpec entrypoint):

```yaml
phaseBoundaries:
  - id: coupEntry
    kind: phaseEntry
    phaseId: coupVictory
    schedule:
      kind: cardDraw
      deckId: eventDeck
      cardSelector:
        tags: [coup]
```

Append the block in an appropriate location — likely near the existing turnStructure or near the dataAssets section. Follow the file's existing markdown-with-YAML-fences convention.

### 2. Sweep coup event cards to add `tags: [coup]`

Identify all coup-triggering cards in FITL's event deck:

- Grep `data/games/fire-in-the-lake/` for existing coup detection (likely `disallowWhenLookaheadIsCoup` or similar). Cross-reference against event card files.
- For each coup event card, add `tags: [coup]` (or extend the existing tags array). If cards already carry tags, append; do not overwrite.
- Verify the count matches FITL's published coup card list (1965-era scenario; the canonical Coup card count is documented in `data/games/fire-in-the-lake/`'s scenario notes).

### 3. Author sandbox demonstration profile

Create a new sandbox agent profile (NOT in production play, NOT `arvn-evolved`). Path: `data/games/fire-in-the-lake/sandbox-profiles/169-demonstration.md` or similar — confirm convention by listing the existing profile directory layout.

The profile contains one demonstration consideration:

```yaml
preferGovernEarlyInCoupCycle:
  scopes: [move]
  weight: 250
  when:
    gte:
      - { ref: schedule.distance.toBoundary.coupEntry.cards }
      - 3
  value:
    boolToNumber:
      ref: candidate.tag.govern
  scheduleFallback:
    onUnavailable: noContribution
```

The weight is illustrative; the consideration is not tuned. Document at the top of the file: "Demonstration profile for Spec 169. NOT for campaign use. Validates that `schedule.distance.toBoundary.coupEntry.cards` resolves non-zero in real FITL game states."

### 4. Golden trace test — FITL coup distance

`packages/engine/test/golden/phase-boundary-fitl-coup-distance.test.ts`:

- Compile FITL GameSpec with the new `phaseBoundaries` declaration.
- Run a fixture game from seed `1000` (or another canonical seed) through key positions.
- At each of 5 fixture positions, assert the exact `schedule.distance.toBoundary.coupEntry.cards` value: (a) turn 1 start, (b) just after the first non-coup card draw, (c) immediately after a coup card draw, (d) mid-final-round, (e) end-game with no remaining coup cards (status `unavailable`).

Use byte-pinning per existing golden-trace convention.

### 5. Trace-shape test — consideration trace row

`packages/engine/test/golden/schedule-ref-consideration-trace.test.ts`:

- Run the sandbox demonstration profile against a fixture state where `coupEntry.cards >= 3` (consideration fires).
- Assert the live trace/candidate metadata fields exactly match the byte-pinned expected shape: selected consideration id, score contribution, and any `scheduleFallbackFired` metadata. Do not require a generic ready-state `inputRefs` row unless a later trace-redesign ticket explicitly adds that surface.
- Also test a state where `coupEntry.cards < 3` (consideration's `when` is false; trace row shows `when: false`, contribution 0).
- Optional: state where `coupEntry` resolves `unavailable` (e.g., end-game); `scheduleFallback.onUnavailable: noContribution` fires; trace metadata shows `scheduleFallbackFired: { kind: 'noContribution' }` and contribution 0.

### 6. Verify no regression

Run the full `policy-profile-quality` suite (or its equivalent) against the unchanged `arvn-evolved` profile. Confirm the baseline `compositeScore=-3.5333` holds. If it does NOT, investigate whether 005 or earlier tickets introduced a regression; do not silently re-bless.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify) — append `phaseBoundaries` block.
- `data/games/fire-in-the-lake/<event-card-files>` (modify) — append `tags: [coup]` to coup-triggering event card declarations. Exact file count depends on FITL's event card structure; sweep determined during implementation.
- `data/games/fire-in-the-lake/sandbox-profiles/169-demonstration.md` (new — confirm directory convention) — sandbox demonstration profile.
- `packages/engine/test/golden/phase-boundary-fitl-coup-distance.test.ts` (new) — golden FITL distance test.
- `packages/engine/test/golden/schedule-ref-consideration-trace.test.ts` (new) — golden trace-shape test.

### Likely surface (audit-dependent)

The exact set of event card files in step 2 depends on the current event deck composition. Tentative path list:

- `data/games/fire-in-the-lake/events/<card-id>.md` per coup card — count and paths confirmed during implementation by grepping `disallowWhenLookaheadIsCoup` or equivalent against the event deck data files.

## Out of Scope

- `arvn-evolved` profile modification — explicitly preserved at `bff2babcc`. Decomposing `preferGovernWeighted=1000` is deferred to a follow-up spec.
- Promoting the demonstration consideration to production play — it is illustrative only.
- Campaign deliverables (musings, lessons, results.tsv updates) — this ticket is engine-data only.
- Tuning the demonstration weight (250) for performance — not the point.
- Texas Hold'em or other-game `phaseBoundaries` authoring — not in Spec 169's scope.

## Acceptance Criteria

### Tests That Must Pass

1. `phase-boundary-fitl-coup-distance.test.ts` — byte-pinned distances at 5 fixture positions.
2. `schedule-ref-consideration-trace.test.ts` — byte-pinned live trace/metadata shapes for the three consideration cases (fires, when-false, unavailable + `scheduleFallbackFired`).
3. `policy-profile-quality` baseline holds for `arvn-evolved` — `compositeScore = -3.5333` (or whatever the current pre-spec-169 baseline is) unchanged. If a regression appears, do not re-bless; investigate.
4. Existing suite: `pnpm -F @ludoforge/engine test` passes — no regression in FITL or kernel tests.
5. FITL GameSpec compiles with the new `phaseBoundaries` block; no new compile warnings beyond what 001's diagnostic budget admits.

### Invariants

1. `arvn-evolved` profile's consideration set is byte-identical pre-/post-ticket. (Diff check during PR review.)
2. The sandbox demonstration profile is NOT loaded by any production tournament or campaign harness. Search the campaign and tournament runner code paths — there must be zero references to the sandbox profile path.
3. Coup card sweep is comprehensive: every event card identified by FITL's existing coup-detection mechanism receives `tags: [coup]`. No silent omission.
4. Golden FITL distance values are computed from real deck composition, not synthetic fixtures. The test consumes the canonical compiled FITL GameDef.

## Test Plan

### New/Modified Tests

1. `phase-boundary-fitl-coup-distance.test.ts` — `@test-class: golden-trace`; FITL coup distance at 5 game positions.
2. `schedule-ref-consideration-trace.test.ts` — `@test-class: golden-trace`; consideration trace shape across three resolution paths.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- --test-name-pattern phase-boundary-fitl` — golden FITL distance test.
2. `pnpm -F @ludoforge/engine test:unit -- --test-name-pattern schedule-ref-consideration` — trace-shape test.
3. `pnpm turbo test --filter=@ludoforge/engine` — full engine gate.
4. `pnpm -F @ludoforge/engine test:e2e` — end-to-end FITL gameplay sanity.
5. Optional: `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1000 --max-turns 50` — single-seed FITL run; confirm no crash or new warnings with `phaseBoundaries` in play. `arvn-evolved` profile.
6. `pnpm turbo typecheck && pnpm turbo lint && pnpm turbo schema:artifacts` — full gate.
