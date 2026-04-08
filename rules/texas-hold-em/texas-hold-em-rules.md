# Texas Hold 'Em Rules

## Core components

Deck: One standard 52-card deck, no jokers. Ranks: A K Q J T 9 8 7 6 5 4 3 2. Suits: ♠ ♥ ♦ ♣ (suits have no ordering for hand strength).

Players: Typically 2–10 at a table (practical standard). Theoretical maximum with one deck is higher, but standard Hold’em rules assume up to 10.

Chips: Each player has a stack of chips (integer units).

Dealer button: A marker indicating the nominal dealer position; it rotates clockwise one seat each hand to determine blinds and action order.

## Key configurable parameters (you should decide up front)

To simulate “Texas Hold’em” you must set these knobs:

Betting structure: assume No-Limit (NLHE). (Limit and Pot-Limit exist but are different.)

Blinds: small_blind (SB) and big_blind (BB).

Ante (optional): fixed amount each player posts pre-deal (common in tournaments; sometimes “BB ante” online).

Rake (cash games, optional): amount/percent removed from pot under certain conditions.

Buy-in / stacks: starting stacks and min/max buy-in rules (cash) or tournament stack rules.

Odd-chip rule for split pots: how to award leftover chip(s) after equal split. (I’ll give a standard deterministic rule.)

Short blind handling: when a blind poster has fewer chips than the blind amount. (I’ll give a standard deterministic rule.)

Showdown reveal behavior: in real life players can muck; in an app you’ll almost certainly “auto-reveal” for resolution.

My defaults below are what I recommend for a robust simulator:

NLHE, SB/BB fixed, optional ante supported,

short blinds allowed as all-in,

odd chip(s) go to the earliest seat clockwise from the button among tied winners,

showdown auto-reveals all non-folded hands for deterministic outcome.

## Seating, positions, and action order

Assume players are seated in a circle in fixed seat order. “Clockwise” means increasing seat index around the table.

3.1 Dealer button and blinds positions (3+ players)

For each hand:

Button: the seat with the dealer button.

Small blind (SB) seat: first active seat clockwise from the button.

Big blind (BB) seat: first active seat clockwise from SB.

“Active seat” here means a player who is participating in the hand (has chips and is not sitting out).

3.2 Heads-up special case (2 players)

If only two players are active:

The button is also the small blind.

The other player is the big blind.

Preflop action starts with the button/SB.

Postflop action starts with the big blind, and the button acts last.

This heads-up exception is essential.

3.3 Action order each betting round

Preflop (3+ players): first to act is the first active seat clockwise from the big blind (often called UTG). Action proceeds clockwise.

Flop/Turn/River (3+ players): first to act is the first active seat clockwise from the button (i.e., the small blind position), action clockwise.

Heads-up: as described above.

## Hand lifecycle (phases)

Each hand goes through:

Setup: move button; collect forced bets (antes/blinds).

Deal hole cards: 2 private cards to each active player.

Betting round: Preflop

Deal flop: burn 1, then 3 community cards face up.

Betting round: Flop

Deal turn: burn 1, then 1 community card face up.

Betting round: Turn

Deal river: burn 1, then 1 community card face up.

Betting round: River

Showdown / award pots (unless hand ended earlier due to folds)

At any point, if only one player remains not folded, the hand ends immediately and that player wins the pot (with an “uncalled bet” refund rule described later).

## Forced bets: antes and blinds
5.1 Antes (optional)

If using antes:

Every active player posts the ante once per hand before cards are dealt.

If a player has fewer chips than the ante, they post all remaining chips and are all-in.

5.2 Small blind and big blind

After antes (if any):

SB posts small_blind.

BB posts big_blind.

If a blind poster has fewer chips than the required blind:

They post all remaining chips (a short blind) and are all-in.

They still receive hole cards and participate up to their all-in amount.

Important: Even with a short blind, you still conceptually treat the hand as having “SB/BB positions” for action order.

## Dealing procedure
6.1 Shuffling

Before each hand:

Shuffle deck uniformly at random.

6.2 Deal two hole cards

Deal one card face down to each active player in clockwise order starting from the small blind (i.e., first seat clockwise from button). Then repeat for the second card.

In heads-up, this still works: SB/button gets first card.

6.3 Burn and community cards

Before the flop: burn 1 card (discard unseen), then deal 3 community cards face up.

Before the turn: burn 1, deal 1 community face up.

Before the river: burn 1, deal 1 community face up.

Burn cards matter for real-world integrity; for simulation they’re just part of the deck consumption.

## Betting rounds: the real rules you must get exactly right
7.1 Player states during a hand

Each player is always in exactly one of these states:

Active: has not folded and is not all-in.

All-in: has not folded, but has zero chips remaining; cannot act further.

Folded: out of the hand; cannot win any portion of the pot.

7.2 What a “betting round” means

A betting round ends when:

All non-folded players who are not all-in have had the chance to respond to the current wager level, and

Either everyone has checked (if no bet happened), or everyone remaining has called the final bet/raise (or is all-in for less), and no one makes a further full raise.

A simpler engine rule:

Track the current highest bet on the street (currentBet).

The round continues until action reaches a point where every active (not folded, not all-in) player has streetContribution == currentBet.

## Legal actions

On your turn, depending on the current situation:

Fold: always legal if facing a bet (i.e., you would need to put chips in to continue).

Check: legal only if currentBet == 0 on that street (no one has bet yet this street).

Call: legal only if currentBet > 0. You put in enough chips to match currentBet (or as much as you have, which may put you all-in).

Bet: legal only if currentBet == 0. You set an initial wager for the street.

Raise: legal only if currentBet > 0 (or preflop where blinds exist), and you increase currentBet by at least the minimum raise amount (unless you are going all-in short of that minimum—special case below).

All-in: not a separate action type in rules terms—it's just betting/calling/raising your entire remaining stack, possibly short.

7.4 No-Limit bet sizing: minimums and maximums

Maximum bet/raise is always your entire remaining stack (all-in).

Minimum bet (postflop): by default, the big blind amount.

Minimum bet (preflop): the big blind is already posted, so the first voluntary wager is a raise (or a “bet” to some engines). The minimum opening raise is typically to 2× big blind total (i.e., raising by at least 1× big blind over the BB).

7.5 Minimum raise rule (this is the part most sims mess up)

You must track the last full raise size on the current street.

Definitions per street:

currentBet: the highest total wager any player has committed on this street.

For a given player, playerStreet: how much they have committed on this street so far.

toCall = currentBet - playerStreet (if negative, treat as 0; in a correct engine it should never be negative).

lastFullRaiseSize: the size of the most recent full raise on this street.

Initialization:

Preflop: set currentBet to the effective big blind posted (normally BB amount). Set lastFullRaiseSize to the big blind amount.

Flop/Turn/River: start with currentBet = 0 and lastFullRaiseSize = big blind amount (common standard: BB sets minimum bet / raise granularity).

When someone makes a raise:

They must first cover toCall (unless they are all-in and can’t).

If they are not all-in and they raise, the raise increment must be at least lastFullRaiseSize.

New total must be >= currentBet + lastFullRaiseSize.

Update rule:

If a player increases currentBet by at least lastFullRaiseSize, that is a full raise:

lastFullRaiseSize = newCurrentBet - oldCurrentBet

currentBet = newCurrentBet

Betting is “reopened” for everyone (everyone who’s still active will get a chance to respond, in turn order).

If a player goes all-in and the increase is less than lastFullRaiseSize, that is a short all-in raise:

currentBet still becomes the new amount (others may need to call more),

but it does not update lastFullRaiseSize,

and it does not reopen raising for players who have already acted since the last full raise.

Players who have not yet acted in that round still have normal options when action reaches them.

This “short raise doesn’t reopen” rule is standard in casinos and tournaments and is essential for correctness.

7.6 Ending the hand early (folds)

If at any time, after an action, exactly one player remains not folded:

The hand ends immediately.

That remaining player wins the pot without showdown.

Uncalled bet refund: if the winner’s last wager was not matched (because everyone folded or could not match), the unmatched portion is returned to the winner.

7.7 When everyone is all-in

If at any point:

Two or more players remain not folded, and

All remaining players are all-in (or no further betting is possible),

Then:

No more betting rounds occur.

Deal any remaining community cards (flop/turn/river as needed, with burns).

Proceed directly to showdown.

## Pots: main pot, side pots, and refunds
8.1 Contributions and eligibility

A player’s total contribution to the hand is the sum of all chips they put in (antes, blinds, calls, bets, raises).

Folded players’ contributions stay in the pot but they are ineligible to win anything.

All-in players are eligible only for pots that include at most their matched contribution amount.

8.2 Constructing side pots (deterministic method)

This is the clean, canonical algorithm:

Collect all non-folded and folded contributions per player for the hand.

Consider only players who have put chips in (everyone who posted anything).

Build pots in “layers” by contribution thresholds:

Sort distinct contribution amounts among players who did not fold and among those who folded (folded chips still fund pots).

Create a pot for each interval between thresholds:

Example: if contributions are 50, 120, 120, 300, then:

Pot1 covers first 50 from everyone who contributed ≥50.

Pot2 covers next 70 (120-50) from everyone who contributed ≥120.

Pot3 covers next 180 (300-120) from everyone who contributed ≥300.

Eligibility for each pot:

A pot is contested only by players who:

have not folded, and

contributed at least the pot’s upper threshold (i.e., they “paid into” that layer).

If a pot layer ends up having only one eligible player (common when someone bets more than anyone can call), then that layer is not a real contested pot:

Return that layer amount to that eligible player (this is the general form of the “uncalled bet refund”).

This avoids weird edge cases and matches real poker economics.

## Showdown rules
9.1 When showdown happens

Showdown occurs when:

After the river betting round ends, two or more players remain not folded; or

All remaining players become all-in earlier and the board is dealt out.

9.2 Hand construction in Hold’em

Each remaining player has:

2 private hole cards

Up to 5 community cards

A player’s final hand is:

The best 5-card poker hand chosen from any combination of their 2 hole cards plus the community cards (total 7 cards available).

They may use:

0, 1, or 2 hole cards (playing the board is allowed).

9.3 Show order (for realism; your app can auto-resolve)

Common live rule:

If there was a bet/raise on the river, the last aggressor (last bettor/raiser) shows first; otherwise first active left of button shows first; then clockwise.

Players may muck if they cannot win, but in software you typically just reveal all non-folded hands for determinism.

## Hand rankings and tie-breakers (complete)

Suits never break ties. Only ranks matter.

From strongest to weakest:

Royal Flush (just a named Straight Flush): A-K-Q-J-T all same suit.

Straight Flush: five consecutive ranks, same suit.

Highest straight wins.

Special case: wheel A-2-3-4-5 is a straight where Ace counts low; it is the lowest straight.

Four of a Kind (Quads): four cards of same rank + kicker.

Compare quad rank, then kicker.

Full House: three of a kind + a pair.

Compare trip rank, then pair rank.

Flush: five cards same suit, not consecutive.

Compare highest card, then next, etc. (lexicographic by sorted ranks).

Straight: five consecutive ranks, mixed suits.

Compare highest straight card (wheel is lowest).

Three of a Kind (Trips): three same rank + two kickers.

Compare trip rank, then highest kicker, then next kicker.

Two Pair: two different pairs + kicker.

Compare higher pair rank, then lower pair rank, then kicker.

One Pair: one pair + three kickers.

Compare pair rank, then kickers highest to lowest.

High Card: five highest cards.

Compare highest, then next, etc.

Important implementation note:

When choosing the “best 5” from 7 cards, if multiple 5-card subsets yield same category, choose the subset with the best tie-break vector as above.

## Awarding pots (including split pots and odd chips)

Resolve pots from main pot outward (each side pot independently):

For each pot:

Identify eligible players for that pot (not folded; paid into that pot’s layer).

Compute each eligible player’s best 5-card hand.

Determine the best hand rank + tie-break.

All players tied for best hand in that pot are winners of that pot.

11.1 Splitting a pot

Split the pot equally among winners in integer chips.

If the pot amount is not divisible evenly, you’ll have leftover “odd chip(s).”

11.2 Odd-chip rule (you must choose one)

Common deterministic rule (recommended):

Award leftover chip(s) one at a time starting with the winner closest clockwise to the dealer button (i.e., earliest in action order postflop), then continue clockwise among tied winners until all leftovers are assigned.

Alternative house rules exist; pick one and hardcode it.

## Special cases you should support (because real games hit them)
12.1 Player all-in for less than the amount to call

They contribute their remaining stack and become all-in.

They are considered to have “called” only partially.

Other players must still match the full currentBet to stay in for higher pots.

Side pots are created as described.

12.2 Uncalled bet / uncontested side pot

If a player bets/raises more than any opponent can match (because all opponents folded or are all-in for less):

The excess amount that no one can match is returned to that bettor.

Do not create a side pot with only one eligible player; just refund.

12.3 Short blinds (blind poster is all-in)

Recommended deterministic handling:

They post whatever they have and are all-in.

Action order is still based on positions.

Minimum raise calculations: keep them based on the scheduled big blind amount, not the short posted amount. (This matches typical competitive rules intent and avoids min-raise degeneracy when a blind is tiny.)

If you prefer a purely “actual amounts” model, you can base min raise on actual posted BB, but it behaves oddly. Pick one.

12.4 Everyone checks a street

If currentBet stays 0 and all active players check:

The betting round ends and you deal the next community card (or go to showdown if river).

12.5 Running out of cards

With standard max players (≤10) this cannot happen. If you support larger player counts, you must ensure the deck has enough cards for:

2 per player + 5 community + 3 burns = 2N + 8 cards.
If you ever exceed 52, your simulator must prevent the hand from starting.

## What I would not bake into “rules of Hold’em” unless you explicitly want it

These are real-world procedures but they’re human-floor-management territory, not core game math:

Misdeals, exposed cards, reshuffles, dead hands

Verbal declarations vs chip motions (“string bet” rules)

Time banks, acting out of turn

Button misplacement corrections

“Rabbit hunting” (revealing next cards after hand ends)

In software you generally avoid these entirely by constraining actions and dealing deterministically.

## Minimal state machine summary (for your engine)

A correct Hold’em simulator can be implemented as:

Hand start

rotate button

post antes

post blinds

deal hole cards

Street loop over: preflop → flop → turn → river

if street is flop/turn/river: burn + deal community as needed

run betting round with:

action order based on street and player count

legal actions depending on currentBet, stack, and raise-rights rules

update currentBet, lastFullRaiseSize, player contributions

end early if only one not folded

if all-in freeze, auto-deal remaining streets and go to showdown

Showdown

build pots (main + side)

for each pot: evaluate eligible hands, pick winner(s), split, apply odd-chip rule

award stacks