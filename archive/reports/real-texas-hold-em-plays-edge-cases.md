**Status**: COMPLETED

# Real Texas Hold Em Plays - Edge Cases

## Play #1

Hand header / setup

- PokerStars Game #27738502010, Tournament #160417133 (NLHE), Level XV (250/500), ante 60.

- 9-max table, Seat #8 is the button.

Stacks at start of hand:

- Seat 1 (LLC 4Eva): 9182

- Seat 2 (618shooter): 25711 (sitting out)

- Seat 3 (suposd2bRich): 21475

- Seat 4 (ElT007): 60940

- Seat 5 (Orlando I): 18044

- Seat 6 (ih82bcool2): 8338

- Seat 7 (kovilen007): 8353

- Seat 8 (GerKingTiger): 4404 (button)

- Seat 9 (Phontaz): 23553

Forced bets:

- Everyone posts ante 60.

- Seat 9 (Phontaz) posts SB 250.

- Seat 1 (LLC 4Eva) posts BB 500.

Hole cards (known)

- ElT007 (Seat 4) is dealt Q♦ Q♣.

(Other hole cards become known at showdown later.)

Preflop action (this is where all the complexity is)

Action starts left of the big blind and goes around:

1. Seat 2 folds (despite having posted ante; noted as sitting out).

2. Seat 3 folds.

3. Seat 4 (ElT007) raises to 2500 total.

4. Seat 5 (Orlando I) re-raises all-in to 17984 total.

5. Seat 6 folds.

6. Seat 7 (kovilen007) calls all-in for 8293 total.

7. Seat 8 folds.

8. Seat 9 (Phontaz) calls 17734 (which brings him up to the 17984 bet, since he already had 250 in the small blind).

9. Seat 1 (LLC 4Eva) folds (big blind is dead money).

10. Seat 4 (ElT007) re-raises to 33468 total.

11. Seat 9 (Phontaz) can’t cover; he calls 5509 and is all-in.

12. Because Phontaz is all-in and can’t match the full 33468, an uncalled bet of 9975 is returned to ElT007.

At this point:

- Seat 7 is all-in (8293)

- Seat 5 is all-in (17984)

- Seat 9 is all-in (23493 total after his last call)

- Seat 4 covers everyone, but his extra 9975 was returned, so he’s effectively matched to 23493 against Seat 9.

No more betting is possible; the board runs out.

Board runout

- Flop: 2♦ 2♣ 3♣

- Turn: 8♥

- River: 4♦

Final board: [2♦ 2♣ 3♣ 8♥ 4♦]

Showdown (revealed hands)

- Seat 9 (Phontaz) shows 9♠ 9♥ → two pair, Nines and Deuces (board pair of 2s + pair of 9s).

- Seat 4 (ElT007) shows Q♦ Q♣ → two pair, Queens and Deuces (beats Phontaz).

- Seat 5 (Orlando I) shows 5♦ 5♥ → two pair, Fives and Deuces.

- Seat 7 (kovilen007) shows K♥ A♠ → a pair of Deuces (just using the board pair, with AK kickers).

So ElT007 wins every pot.

Pot results (what you can golden-test)

The hand history reports:

- Main pot: 34212

- Side pot-1: 29073

- Side pot-2: 11018

- Total pot: 74303 (Rake 0)

And it’s awarded as:

- ElT007 collects 11018 from side pot-2,

- then 29073 from side pot-1,

- then 34212 from the main pot.

(Optional) Why those side-pot numbers are exactly right

This is the clean “unit test” logic:

- Smallest all-in is Seat 7 for 8293 ⇒ main pot includes 8293 × 4 active players = 33172, plus dead money (9 antes = 540 and the folded BB 500) ⇒ 33172 + 540 + 500 = 34212 (main pot).

- Next all-in cap is Seat 5 at 17984 ⇒ side pot-1 is (17984 − 8293) × 3 eligible players = 9691 × 3 = 29073.

- Next all-in cap is Seat 9 at 23493 ⇒ side pot-2 is (23493 − 17984) × 2 eligible players = 5509 × 2 = 11018.

# Play #2

Hand setup

- PokerStars Hand #129750342299

- Tournament #1118959992 (NLHE), Level XXIII: 1500/3000, ante 375

- Button: Seat #7

Stacks at start (chips):

- Seat 1 (Gameslave): 2232

- Seat 2 (Chicwo): 57804

- Seat 3 (drwcrocket): 32497

- Seat 4 (ajetopatamat): 36900

- Seat 5 (pingdi): 36108

- Seat 7 (dismarc): 43316

- Seat 8 (sk2flash): 44596

- Seat 9 (ViTaMin_F22): 26583

Antes + blinds

- Each listed player posts ante 375.

- Seat 8 posts SB 1500.

- Seat 9 posts BB 3000.

Known hole cards

- Seat 1 (Gameslave): 5♥ 4♥

- Seat 8 (sk2flash): A♠ 3♠

- Seat 9 (ViTaMin_F22): Q♥ A♦

Preflop action

1. Seat 1 (Gameslave) calls 1857 and is all-in (this is his remaining stack after the ante).

2. Seat 2 (Chicwo) calls 3000.

3. Seats 3, 4, 5, 7 fold.

4. Seat 8 (sk2flash, SB) shoves: “raises … to 44221 and is all-in.”

5. Seat 9 (ViTaMin_F22, BB) calls 23208 and is all-in (can’t cover the full 44221).

6.  Seat 2 (Chicwo) folds.

7. Uncalled bet (18013) is returned to Seat 8 (because Seat 9 couldn’t match the full shove).

At this point, the only live players are Seats 1, 8, 9, all all-in (Seat 1 short), so the board runs out.

Board runout

- Flop: T♣ 7♠ K♣

- Turn: 7♦

- River: 7♣

Showdown (split pot happens here)

- Seat 8 shows A♠ 3♠ → best hand is 7♠ 7♦ 7♣ A♠ K♣

- Seat 9 shows Q♥ A♦ → best hand is 7♠ 7♦ 7♣ A♦ K♣

- Seat 1 shows 5♥ 4♥ → best hand is 7♠ 7♦ 7♣ K♣ T♣ (lower)

So Seats 8 and 9 tie for the best 5-card hand, and Seat 1 loses.

Pot results (including the odd chip)

The hand history reports:

- Total pot 60273

- Main pot 10428

- Side pot 49845

- Rake 0

Because Seats 8 and 9 tie:

- Main pot 10428 is split evenly → 5214 to Seat 8 and 5214 to Seat 9

- Side pot 49845 is split with an odd chip → 24923 to Seat 8 and 24922 to Seat 9 (Seat 8 receives the extra 1 chip)

(And if you also model bounties: the log notes Seat 8 and Seat 9 split a $5 bounty for eliminating Seat 1.)

## Outcome

- Completion date: February 16, 2026
- What changed:
  - Added deterministic play-by-play e2e coverage for both real hands in `test/e2e/texas-holdem-real-plays.test.ts`.
  - Reconstructed exact preflop action sequences, stack states, blinds/antes, and known hole cards.
  - Added assertions for board runouts, showdown outcomes, final chip stacks, and split-pot odd-chip distribution for Play #2.
- Deviations from original plan:
  - Internal phase auto-advance can batch refund handling, so assertions were written against deterministic final payouts/stacks rather than a single intermediate transition point.
- Verification results:
  - `node dist/test/e2e/texas-holdem-real-plays.test.js` passed.
  - `npm test` passed (241/241 tests).