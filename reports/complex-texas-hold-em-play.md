# Complex Texas Hold Em Play

Hand setup

- Tournament: NLHE (no rake)

- Table: 9-handed

- Blinds / ante: SB 1,000 / BB 2,000 / ante 250

- Button: Seat 6

- Odd-chip rule (declare explicitly for your engine): When a pot is split and one chip remains, award the odd chip to the winner closest to the button in clockwise order (first seat encountered left of the button among the tied winners).

Starting stacks

- Seat 1: 6,125

- Seat 2: 6,125

- Seat 3: 14,050

- Seat 4: 21,600

- Seat 5: 37,250

- Seat 6 (Button): 52,400

- Seat 7 (SB): 18,775

- Seat 8 (BB): 103,500

- Seat 9: 28,300

Predetermined hole cards (for deterministic testing)

- Seat 1: A♠ 7♦

- Seat 2: A♥ 6♣

- Seat 3: 7♣ 7♠

- Seat 4: 8♠ 8♦

- Seat 5: K♦ T♠

- Seat 6: Q♠ Q♦

- Seat 7: 2♣ 2♥

- Seat 8: J♣ J♦

- Seat 9: 9♠ 9♥

Posting antes + blinds

- All 9 players post ante 250.

- Seat 7 posts SB 1,000.

- Seat 8 posts BB 2,000.

Preflop action (button = Seat 6, action starts at Seat 9)

1. Seat 9 raises to 5,000.

2. Seat 1 shoves all-in to 5,875.

Note: this is a short all-in raise (only +875 over 5,000), i.e. less than the minimum raise. By itself it would not reopen betting for Seat 9 if no later full raise occurred.

3. Seat 2 calls all-in for 5,875.

4. Seat 3 calls 5,875.

5. Seat 4 shoves all-in to 21,350. (This is a full raise and reopens action.)

6. Seat 5 calls 21,350.

7. Seat 6 (Button) raises to 40,000.

8. Seat 7 (SB) calls all-in for 18,525 total (can’t cover 40,000).

9. Seat 8 (BB) calls 40,000.

10. Seat 9 calls all-in to 28,050 total (can’t cover 40,000).

11. Seat 3 calls all-in to 13,800 total (can’t cover 40,000).

12. Seat 5 calls all-in to 37,000 total (can’t cover 40,000).

At this point:

- Everyone is all-in except Seat 8 (still has chips) — and Seat 6 has chips only until the flop action resolves.

Flop (community cards)

Flop: A♦ A♣ K♠

Only Seat 6 and Seat 8 have chips available to bet in the highest side pot (everyone else is all-in).

13. Seat 8 bets 30,000.

14. Seat 6 calls all-in for 12,150 (that’s all Seat 6 has left).

15. Because Seat 6 can only call 12,150, the uncalled portion (17,850) is returned to Seat 8.

Now Seat 6 is all-in. No more betting is possible.

Turn + River

Turn: K♥
River: 2♦

Final board: A♦ A♣ K♠ K♥ 2♦

Showdown (hand ranks)

- Seat 1 (A♠7♦): Aces full of Kings (A A A K K)

- Seat 2 (A♥6♣): Aces full of Kings (A A A K K)
→ Seat 1 and Seat 2 tie for best overall hand.

- Seat 5 (K♦T♠): Kings full of Aces (K K K A A)

- Seat 7 (2♣2♥): Twos full of Aces (2 2 2 A A)

- Seat 6 (Q♠Q♦): Two pair Aces and Kings, Q kicker (A A K K Q)

- Seat 8 (J♣J♦): Two pair Aces and Kings, J kicker (A A K K J)

- Seat 9 (9♠9♥): Two pair Aces and Kings, 9 kicker

- Seat 4 (8♠8♦): Two pair Aces and Kings, 8 kicker

- Seat 3 (7♣7♠): Two pair Aces and Kings, 7 kicker

Pot breakdown (this is the torture-test part)

Total pot = 237,025.

There are 1 main pot + 6 side pots (because of many different all-in depths).

Main pot

- Main pot = 55,125 (9 players × 6,125 each)

- Winners: Seat 1 and Seat 2 split

- Since 55,125 is odd, apply the odd-chip rule:

-- With button at Seat 6, the first tied winner clockwise from the button is Seat 1, so Seat 1 gets the odd chip.

- Seat 1 wins 27,563

- Seat 2 wins 27,562

Side pots

All side pots exclude Seats 1 & 2 (they didn’t contribute beyond 6,125), so they are not eligible for any side pot even though they have the best hand.

- Side pot 1 = 55,475 → Seat 5 wins

- Side pot 2 = 28,350 → Seat 5 wins

- Side pot 3 = 14,125 → Seat 5 wins

- Side pot 4 = 26,800 → Seat 5 wins

- Side pot 5 = 26,850 → Seat 5 wins

- Side pot 6 = 30,300 (only Seats 6 & 8 eligible) → Seat 6 wins (Q kicker beats J kicker)

Ending stacks (after payouts)

- Seat 1: 27,563

- Seat 2: 27,562

- Seat 3: 0

- Seat 4: 0

- Seat 5: 151,600

- Seat 6: 30,300

- Seat 7: 0

- Seat 8: 51,100

- Seat 9: 0