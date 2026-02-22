# Complex Game With Betting Phases

## Hand A — betting on flop + turn + river (goes to showdown)

(Full Tilt FTOPS hand history; great for proving all 3 postflop betting rounds exist.)

HAND: Full Tilt Poker Game #32388126003 (FTOPS Event #28), blinds 2500/5000, ante 600
Players of interest:
  EastLansing (SB) 361,658
  n00ki5 (BB)      424,593

PRE-FLOP (pot = 11,100 after antes+blinds):
  EastLansing completes: calls 2,500  (SB 2,500 -> 5,000)
  n00ki5 raises to 17,000
  EastLansing calls 12,000
  => Pot going to flop: 37,600

FLOP: [3s As 6c] (pot 37,600)
  EastLansing checks
  n00ki5 bets 12,200
  EastLansing calls 12,200
  => Pot: 62,000

TURN: [6d] (pot 62,000)
  EastLansing checks
  n00ki5 bets 32,000
  EastLansing calls 32,000
  => Pot: 126,000

RIVER: [7d] (pot 126,000)
  EastLansing checks
  n00ki5 bets 137,000
  EastLansing calls 137,000
  => Pot: 400,000

SHOWDOWN:
  n00ki5 shows 5h 4h (straight 3-4-5-6-7)
  EastLansing mucks Ad 7s (two pair)
  n00ki5 wins 400,000

## Hand B — turn raise + re-raise all-in (betting continues postflop, then runout)

(Full Tilt FTOPS hand history; good for testing turn raise logic + all-in handling.)

HAND: Full Tilt Poker Game #8991890847 (FTOPS Event #21), blinds 15/30, heads-up
Stacks:
  cat5Cane (BB)   2,700
  Fluffdog (SB)   3,300

PRE-FLOP:
  Fluffdog raises to 60
  cat5Cane re-raises to 150
  Fluffdog calls 90
  => Pot: 300

FLOP: [2c Td 6s] (pot 300)
  cat5Cane bets 180
  Fluffdog calls 180
  => Pot: 660

TURN: [4d] (pot 660)
  cat5Cane bets 450
  Fluffdog raises to 900
  cat5Cane raises to 2,370 and is all-in
  Fluffdog calls 1,470
  => Pot: 5,400
  => Remaining streets are dealt with no more betting (villain all-in)

RIVER (runout): [6h]
SHOWDOWN:
  Fluffdog shows 2d 2h and wins (full house)
  cat5Cane shows Jc Jd and loses
  Fluffdog wins 5,400

## Hand C — river raise to all-in (and fold)

(PokerStars tournament hand via converter; perfect to test river raise/all-in + fold resolution.)

HAND: PokerStars "22 Tournament", blinds 50/100, 9-handed (converter format)
Stacks shown:
  MP3: 5,910
  Hero (Button): 14,156
  (others listed in source)

PRE-FLOP:
  MP3 opens to 271
  Hero (Button) 3-bets to 615
  MP3 calls 344
  => Pot: 1,380

FLOP: [6s 4h 4s] (pot 1,380)
  MP3 checks
  Hero checks

TURN: [5c] (pot 1,380)
  MP3 checks
  Hero bets 990
  MP3 calls 990
  => Pot: 3,360

RIVER: [7c] (pot 3,360)
  MP3 checks
  Hero bets 1,123
  MP3 raises to 4,305 (all-in)
  Hero folds

Total pot awarded: 5,606 (villain wins without showdown)

## Hand D — flop check-raise all-in (tournament, multiway preflop)

(Full Tilt tournament; good for testing flop raise/all-in + “uncalled bet returned”.)

HAND: Full Tilt Poker Game #24371147044 ($7,500 Guarantee), blinds 100/200
Key stacks:
  CHASE52OUTS 10,650
  arvan1985   10,863 (BB)

PRE-FLOP:
  CHASE52OUTS raises to 600
  arvan1985 (BB) 3-bets to 1,466
  CHASE52OUTS calls 866

FLOP: [Qc 5d 7d]
  arvan1985 checks
  CHASE52OUTS bets 3,032
  arvan1985 raises to 9,397 and is all-in
  CHASE52OUTS calls 6,152 and is all-in
  Uncalled 213 returned to arvan1985
  => Runout to showdown
  