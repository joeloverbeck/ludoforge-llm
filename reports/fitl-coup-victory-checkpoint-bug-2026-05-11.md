# FITL Coup Victory Checkpoint Bug — Only First Coup Card Can End the Game

**Date**: 2026-05-11
**Reported from**: fitl-arvn-agent-evolution improve-loop campaign (worktree `.claude/worktrees/improve-fitl-arvn-agent-evolution`)
**Status**: **Fixed** in commit `edb7a68f6` on `improve/fitl-arvn-agent-evolution` (worktree branch). See "Resolution" section at the bottom.
**Severity**: Critical — blocks ARVN agent evolution beyond the first coup card across all seeds

---

## Symptom

The fitl-arvn-agent-evolution campaign's "structural unwinnable" observation on seed 1000 (and seed 1001) traces back to a precondition in `data/games/fire-in-the-lake/90-terminal.md`: every victory checkpoint requires the count of coup cards in `played:none` to equal exactly `1`. The FITL `fitl-scenario-full` deck has **6 coup cards** (`pileCount: 6, coupsPerPile: 1`), and nothing in the game spec removes coup cards from `played:none` after a coup phase resolves. So after the first coup card moves to `played:none` the count is `1` and victory checkpoints can fire; for the **second through sixth** coup cards the count is `2..6` and none of the checkpoints fire. The game can therefore only terminate at coup card #1 (or via `maxTurns` / `noLegalMoves` fallbacks).

This is the FITL encoding issue the user suspected when they asked "VC wins on turn 1 — is that really the first card or is the trace lying?"

## Evidence (trace-driven)

Re-running the fitl ARVN tournament harness against seed 1000 and inspecting `trace.decisions[]`:

- `trace.turnsCount = 1` and `trace.finalState.turnCount = 1`, but
- 63 distinct `turnId` values (0..62) appear across the per-decision entries (`turnId` is the cumulative microturn/decision sequence id, not a card-turn counter).
- 30 main-phase actionSelection decisions split across all four players (player 0 / US: 8, player 1 / ARVN: 5, player 2 / NVA: 8, player 3 / VC: 9). Each main-phase actionSelection corresponds to a faction acting on a non-Coup card under FITL's eligibility windows — so the game played **roughly 15+ non-Coup cards** before drawing its first Coup card.
- 33 coup-phase actionSelection decisions appear in a single block (`coupVictoryCheck=1`, `coupResourcesResolve=1`, `coupPacifyUS=5`, `coupPacifyARVN=2`, `coupArvnRedeployOptionalTroops=6`, `coupArvnRedeployPolice=4`, `coupCommitmentResolve=1`, plus passes). One coup card resolved.
- `trace.result.victory.timing = "duringCoup"`, `winnerSeat = "vc"`, `vc-victory` checkpoint fired.

So the framing "VC wins on turn 1 = first card is a Coup" was wrong: many non-Coup cards were played first. The misleading `turnsCount = 1` value is unrelated to card count — it comes from `state.turnCount` (incremented in `packages/engine/src/kernel/phase-advance.ts:559`) which appears to roll over exactly once per coup-card-completion in FITL because each coup phase sequence is wrapped in a single `turnEnd` advance. The "structural unwinnable" judgment is real for a different reason: the victory-check encoding only ever lets the *first* coup card trigger a winner.

## Source-code / spec citations

`data/games/fire-in-the-lake/90-terminal.md` defines five victory checkpoints (`us-victory`, `arvn-victory`, `nva-victory`, `vc-victory`, `final-coup-ranking`). Every one of them includes this precondition as the first conjunct of its `when` clause:

```yaml
- op: '=='
  left:
    aggregate:
      op: count
      query:
        query: tokensInZone
        zone: played:none
        filter:
          op: and
          args:
            - { prop: isCoup, op: eq, value: true }
  right: 1
```

- `us-victory`: 90-terminal.md:10-55 (the `right: 50` threshold check is the second conjunct, gated by the `count == 1` precondition above)
- `arvn-victory`: 90-terminal.md:56-135 (threshold `right: 50` — controlledPopulation + patronage)
- `nva-victory`: 90-terminal.md:136-222 (threshold `right: 18`)
- `vc-victory`: 90-terminal.md:223-272 (threshold `right: 35`)
- `final-coup-ranking`: 90-terminal.md:273-315 — *additionally* requires `lookahead:none` and `deck:none` to have zero coup cards, but **still** keeps `played:none == 1`, so it can only fire if exactly one coup card has ever been played — which is incompatible with the production scenario's 6-coup deck.

The scenario that produces 6 coup cards is `fitl-scenario-full` in `data/games/fire-in-the-lake/40-content-data-assets.md:1096-1116`:

```yaml
deckComposition:
  materializationStrategy: pile-coup-mix-v1
  pileCount: 6
  eventsPerPile: 12
  coupsPerPile: 1
```

The kernel-level "is this a coup card" check that drives `phase-advance.ts` is `token.props.isCoup === true` (`packages/engine/src/kernel/turn-flow-lifecycle.ts:233`, `packages/engine/src/kernel/phase-advance.ts:342`). Once a coup card lands in `played:none` it stays there — nothing in `data/games/fire-in-the-lake/20-macros.md`'s `coup-reset-markers` macro (or anywhere else I could find) removes coup cards from the played pile. So `tokensInZone(played:none).filter(isCoup==true)` strictly monotonically increases over the game.

## Why this blocks ARVN agent evolution

ARVN's victory formula is `coin-controlled-population + patronage > 50`. Starting state initializes `patronage = 15` and ARVN cannot occupy enough of the map for COIN-controlled-population to push past `(50 - 15) = 35` worth of population in the ~15-card window before the first coup card. The campaign baseline traces show ARVN ending the first coup at margin `-6` and `-7` on seeds 1000 and 1001 respectively, with VC ending at margin `+6` and `+8`.

In real FITL, ARVN would have additional Coup Rounds (the Full scenario has six Coup cards, one per pile, representing 1-2 game years each per Rules §2.4.2 NOTE) at which to accumulate enough patronage + coin-controlled-population to cross 50. Under this encoding, ARVN is locked out the moment the first coup card resolves without an ARVN winner. NVA actually has the lowest numeric threshold (18) per Rules §7.2, but in practice VC reaches its threshold of 35 first because VC's mechanism — Total Opposition (markers across the whole map) plus VC Bases — ramps faster across Rally and Terror operations than NVA's "NVA-Controlled Population + NVA Bases" mechanism, which requires dense token presence in individual spaces.

Net effect on the campaign: every seed in this regime is decided by who has the strongest "early game by coup #1" profile, not by who has the best long-game strategy. ARVN evolution under this encoding can only optimize "minimize coup-1 deficit", which the prior campaign session's eight tier-1 experiments and this session's three confirmed has a structural ceiling around `compositeScore = -5.5` to `-6.5`.

## Adjacent concerns surfaced during the audit

1. **`final-coup-ranking` precondition is internally inconsistent with the deck composition.** Even if the `== 1` rule were correct for the in-progress coup card (e.g., if some unknown mechanism cleared `played:none` after each coup), `final-coup-ranking` also requires `lookahead:none == 0` and `deck:none == 0` — meaning all six coup cards have been drawn. At that point `played:none` necessarily has 6 coup cards, not 1. So `final-coup-ranking` can never fire under `fitl-scenario-full`. Whatever the intended semantics, this checkpoint as currently written is dead code in the production scenario.
2. **`turnsCount` reported by traces is misleading for FITL.** `state.turnCount` increments via `phase-advance.ts:559` only when `isLastPhase` is true and the turn-end lifecycle fires. In FITL's `turnStructure`, the seven phases (main + six coup phases) appear to advance only once per *coup cycle* (not per card), so `turnsCount = 1` at game end can mean "one coup cycle completed" rather than "one card played". This isn't a bug per se but the name "turnsCount" is misleading enough that it caused me to misframe the issue to the user in my initial report.
3. **Multiple `convergence-witness` lessons in the campaign's `lessons.jsonl` and `lessons-global.jsonl` should be revisited once this bug is fixed.** Specifically, every "X is dead weight on seed 1000" or "Y regresses on seed 1000" lesson was measured against a game that necessarily ends at the first coup card. Once the bug is fixed and coup #2-6 victory checks can fire, ARVN may have access to long-game strategies (e.g., resource-management, capability-disruption via `valueCapabilityGain`) that were structurally dead in the buggy regime.

## Proposed fix

Replace the `count == 1` precondition in every victory checkpoint with the correct "we are inside a coup phase resolution" condition. Two reasonable phrasings, depending on intended semantics:

### Option A — Fire at every coup phase by removing the count precondition entirely

The `timing: duringCoup` plus `phases: [coupVictory]` declarators on each checkpoint already constrain *when* the checkpoint is evaluated; the `count == 1` aggregate adds nothing if the engine already drives victory checks during the `coupVictory` phase. Drop the `count == 1` conjunct from `us-victory`, `arvn-victory`, `nva-victory`, `vc-victory` so that each coup card's victory phase runs the checks. `final-coup-ranking` would need its own redesign — likely "lookahead empty AND deck empty" with no precondition on `played:none`'s coup-card count.

**Pros**: minimal change; matches real FITL rules (victory check fires at every coup).
**Cons**: requires verifying that `timing: duringCoup` + `phases: [coupVictory]` is in fact enforced by the engine and isn't relying on the `count == 1` clause to gate it.

### Option B — Compare against a global coup-counter variable, not against the played pile

Introduce a `globals.coupsResolvedCount` variable that increments at `coupVictory` phase entry (or wherever appropriate) and write each victory checkpoint as "fire when `coupsResolvedCount == N`" for the appropriate `N`. The `final-coup-ranking` checkpoint becomes "fire when `coupsResolvedCount == 6`". This is more explicit but requires a schema addition and macro work.

**Pros**: makes the year-by-year structure explicit; matches FITL's "Coup of Year N" framing.
**Cons**: more invasive; touches `00-metadata.md`/`10-vocabulary.md` and a new macro.

### Recommended

Option A as a first pass — verify whether the engine already enforces `phases: [coupVictory]` / `timing: duringCoup` correctly, and if so just drop the broken precondition. If the engine relies on the `count == 1` clause to gate firing (unlikely but worth checking), Option B becomes the path forward.

Either fix needs to update tests in `packages/engine/test/` that may be pinned against the current "VC wins at coup 1" behavior. Worth running the engine test suite immediately after the fix to enumerate which fixtures need updating; the campaign's `convergence-witness` lessons can then be re-validated against the corrected game flow.

## Impact on the in-flight campaign

The campaign worktree is currently at `improve/fitl-arvn-agent-evolution` HEAD `e44533bc3` (exp-003 ACCEPT, re-added `preferStrongNormalizedMargin` for a +1.0 tier-2 margin recovery). All experiments to date on this branch (and the prior sessions cited in `aba912a01`) measured against the buggy game flow. Once this bug is fixed:

- The "seed 1000 unwinnable" judgment that drove the tier-1 → tier-2 escape needs to be re-evaluated. ARVN may be winnable at coup #2/3/4 on the same seed.
- The exp-003 ACCEPT recovery of `+1.0 margin` may behave differently when the game can run past coup #1 — `preferStrongNormalizedMargin` could be more or less load-bearing in a multi-coup regime.
- The prior session's "dead-weight" finding on `preferStrongNormalizedMargin` (and on `preferTrainWeighted`, `governWhenPatronageLow`) likely needs to be re-derived from scratch in the post-fix regime.

I recommend pausing the campaign until the encoding is fixed; restarting against a corrected baseline gives the agent room to evolve long-game strategies that the buggy regime currently makes unmeasurable.

## Resolution

Fixed in commit `edb7a68f6` on the campaign worktree branch (`improve/fitl-arvn-agent-evolution`). The fix is a `data/games/fire-in-the-lake/90-terminal.md`-only change:

- **`us-victory`, `arvn-victory`, `nva-victory`, `vc-victory`**: dropped the `count of isCoup in played:none == 1` precondition. The existing `timing: duringCoup` + `phases: [coupVictory]` declarators (consumed by the kernel at `terminal.ts:182` for the symmetric `finalCoup` branch — and by the analogous duringCoup branch above it) are sufficient to gate firing at each Coup Round's victory phase per Rules §7.2.
- **`final-coup-ranking`**: replaced `count of isCoup in played == 1` with `count of isCoup in played > 0`. The `> 0` guard is needed to prevent the checkpoint from firing in degenerate test setups where `deck:none` and `lookahead:none` happen to be empty without any Coup card having been played; combined with the existing `deck == 0 AND lookahead == 0` checks, it correctly identifies "the final Coup card has been resolved without a 7.2 winner" per Rules §7.3 / §2.4.2.

### Verification

- Full engine `default` lane: **65/65 files passed**
- `integration` lane: **275/275 files passed** (includes `integration:fitl-events` 113/113, `integration:fitl-rules` 79/79, and all other FITL/Texas integration suites)
- Smoke test on the campaign harness: seeds 1000/1002/1020/1030 still resolve at coup #1 with VC winning (those seeds genuinely reach VC's threshold of 35 at coup #1, which is correct behavior). **Seed 1010 now resolves at coup #2 with VC winning** — the first coup's victory check correctly fires with no winner, the game continues, the second coup card is played, and VC then crosses threshold there. Pre-fix, seed 1010 would have stuck silently after coup #1 since no checkpoint could fire at coup #2 onward.

### Initial discovery had a misframing worth flagging

When I first wrote this report I described VC as "the lowest threshold (35) faction". That was wrong. Rules §7.2 thresholds: US > 50, NVA > 18, ARVN > 50, VC > 35. NVA has the lowest numeric threshold. The empirical reason VC wins more often than NVA on early coups is mechanism, not threshold — VC's "Total Opposition + bases" ramps via Terror/Rally across many spaces; NVA's "NVA-Controlled Population + bases" requires dense token presence per space. Corrected in the "Why this blocks ARVN agent evolution" section above.

### Adjacent concerns — status

1. **`final-coup-ranking` precondition consistency**: addressed by the fix above (the `> 0` guard plus the existing `deck/lookahead == 0` pair is the correct encoding for "this is the final Coup Round end").
2. **Misleading `turnsCount` naming**: not addressed in this fix. `state.turnCount` (and the trace's `turnsCount` derived from it in `run-game-steps.ts:190`) still increments only at end-of-turn boundaries, which for FITL appears to coincide with end-of-Coup-Round rather than end-of-card. Worth a separate report or rename if other consumers are confused; not a correctness bug, just a naming clarity issue.
3. **Prior campaign lessons** (`preferStrongNormalizedMargin is dead weight`, `preferTrainWeighted is dead weight`, etc., in `campaigns/lessons-global.jsonl` and the prior `aba912a01` squash-merge commit): these were measured against the buggy game flow. The just-completed exp-003 already demonstrated `preferStrongNormalizedMargin` is NOT dead weight at tier 2 (recovered +1.0 avgMargin). After this fix lands, ARVN can win at later coup rounds, so the entire `arvn-evolved` profile composition may be ripe for re-derivation. The campaign is being re-baselined against the corrected game flow as a follow-up.

### Campaign restart

Re-baselining the fitl-arvn-agent-evolution campaign at tier 1 (and likely advancing through tiers more naturally now that wins are achievable past coup #1) is the next step. Tracked in the campaign worktree's `musings.md`.
