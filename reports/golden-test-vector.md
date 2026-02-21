# Golden Test Vector — Tournament NLHE (3-max → Heads-up)
Deterministic, card-complete, zone-complete.

## Conventions
### Card notation
Ranks: A K Q J T 9 8 7 6 5 4 3 2
Suits: s (spades), h (hearts), d (diamonds), c (clubs)
Example: As = Ace of spades, Td = Ten of diamonds

### Zones
- DECK: face-down draw pile (top → bottom as listed)
- HAND[P]: player P’s hole cards (face-down until shown)
- BOARD: community cards (face-up)
- BURN: burned cards (face-down)
- MUCK: folded/collected cards (face-down)

### Chip containers
- STACK[P]
- POT (single pot) OR POT.main / POT.side1 (when side pots exist)

### Mandatory invariants (the point of this test)
- At any instant: DECK + BOARD + BURN + MUCK + all HAND[*] == 52 cards
- Between hands:
  1) Collect all remaining cards (including stub) into MUCK
  2) Move MUCK -> DECK
  3) Shuffle (here: set DECK to the listed deterministic order)

## Players & seats (clockwise)
Seat1: Alice
Seat2: Bob
Seat3: Carol

## Blind / ante schedule for this test
- Hands 1–3: Blinds 5/10, Ante 0
- Hand 4: Blinds 10/20, Ante 0
- Hands 5–6: Blinds 10/20, Ante 5 (3-handed)
- Hands 7–8 (heads-up): Blinds 10/20, Ante 0

## Dealing order
### 3-handed
Button fixed for the hand.
- SB is immediately left of Button
- BB is immediately left of SB
Deal hole cards starting with SB, clockwise, one card each, repeat (2 rounds).

### Heads-up
Button is also SB; opponent is BB.
Deal hole cards starting with BB, then Button, repeat (2 rounds).

### Burns / board
If hand reaches flop:
- burn 1 → flop(3) → burn 2 → turn(1) → burn 3 → river(1)
If a hand ends before the next street, do NOT burn/deal further streets.

## Odd chip rule used (split pot)
If a pot cannot be split evenly, award the odd chip to the first seat left of the Button.

---

# HAND 1 (3-handed) — Blinds 5/10 Ante 0
Button: Alice | SB: Bob | BB: Carol
Starting stacks: Alice=500 Bob=500 Carol=500

## DECK (top → bottom)
7d Qh Ac 7s Jh Kc As Ah Ad Ks Kh Kd Qs
Qd Qc Js Jd Jc Ts Th Td Tc 9s 9h 9d 9c
8s 8h 8d 8c 7h 7c 6s 6h 6d 6c 5s 5h 5d
5c 4s 4h 4d 4c 3s 3h 3d 3c 2s 2h 2d 2c

## Setup
MOVE CHIPS: STACK[Bob] -> POT : 5   (SB)
MOVE CHIPS: STACK[Carol] -> POT : 10 (BB)
STATE: POT=15 | STACKS: Alice=500 Bob=495 Carol=490

## Deal hole cards (start at SB=Bob)
MOVE CARD: DECK -> HAND[Bob]   : 7d
MOVE CARD: DECK -> HAND[Carol] : Qh
MOVE CARD: DECK -> HAND[Alice] : Ac
MOVE CARD: DECK -> HAND[Bob]   : 7s
MOVE CARD: DECK -> HAND[Carol] : Jh
MOVE CARD: DECK -> HAND[Alice] : Kc
STATE: DECK count=46

## Preflop action (3-handed: first to act = left of BB = Alice)
MOVE CHIPS: STACK[Alice] -> POT : 25  (Alice raises to 25)
STATE: POT=40 | STACKS: Alice=475 Bob=495 Carol=490

ACTION: Bob folds
MOVE CARD GROUP: HAND[Bob] -> MUCK (2 cards)

ACTION: Carol folds
MOVE CARD GROUP: HAND[Carol] -> MUCK (2 cards)

## Hand ends (no board dealt)
AWARD POT: POT=40 -> STACK[Alice]
STATE: STACKS: Alice=515 Bob=495 Carol=490 | POT=0

## Cleanup (collect everything, INCLUDING stub)
MOVE CARD GROUP: HAND[Alice] -> MUCK (2 cards)
MOVE CARD GROUP: DECK (stub 46 cards) -> MUCK
ASSERT: MUCK count == 52
MOVE CARD GROUP: MUCK -> DECK (for shuffle)
CLEAR: MUCK, BURN, BOARD, all HAND[*]

---

# HAND 2 (3-handed) — Blinds 5/10 Ante 0
Button: Bob | SB: Carol | BB: Alice
Starting stacks: Alice=515 Bob=495 Carol=490

## DECK (top → bottom)
7h Ah Kc 6h Ad Qc 3c 2d 5s 9c Td Jd As
Ac Ks Kh Kd Qs Qh Qd Js Jh Jc Ts Th Tc
9s 9h 9d 8s 8h 8d 8c 7s 7d 7c 6s 6d 6c
5h 5d 5c 4s 4h 4d 4c 3s 3h 3d 2s 2h 2c

## Setup
MOVE CHIPS: STACK[Carol] -> POT : 5   (SB)
MOVE CHIPS: STACK[Alice] -> POT : 10  (BB)
STATE: POT=15 | STACKS: Alice=505 Bob=495 Carol=485

## Deal hole cards (start at SB=Carol)
MOVE CARD: DECK -> HAND[Carol] : 7h
MOVE CARD: DECK -> HAND[Alice] : Ah
MOVE CARD: DECK -> HAND[Bob]   : Kc
MOVE CARD: DECK -> HAND[Carol] : 6h
MOVE CARD: DECK -> HAND[Alice] : Ad
MOVE CARD: DECK -> HAND[Bob]   : Qc
STATE: DECK count=46

## Preflop action (first to act = left of BB = Bob)
MOVE CHIPS: STACK[Bob] -> POT : 10 (Bob calls 10)
MOVE CHIPS: STACK[Carol] -> POT : 5 (Carol calls 5 to complete)
ACTION: Alice checks
STATE: POT=30 | STACKS: Alice=505 Bob=485 Carol=480

## Flop
MOVE CARD: DECK -> BURN : 3c
MOVE CARD: DECK -> BOARD: 2d
MOVE CARD: DECK -> BOARD: 5s
MOVE CARD: DECK -> BOARD: 9c
STATE: BOARD=[2d 5s 9c] | DECK count=42

Postflop action (3-handed: first to act = left of Button = Carol)
ACTION: Carol checks
MOVE CHIPS: STACK[Alice] -> POT : 15 (Alice bets 15)
MOVE CHIPS: STACK[Bob]   -> POT : 15 (Bob calls 15)
ACTION: Carol folds
MOVE CARD GROUP: HAND[Carol] -> MUCK (2 cards)
STATE: POT=60 | STACKS: Alice=490 Bob=470 Carol=480

## Turn (2 players remain: Alice acts first, Bob last)
MOVE CARD: DECK -> BURN : Td
MOVE CARD: DECK -> BOARD: Jd
STATE: BOARD=[2d 5s 9c Jd] | DECK count=40

MOVE CHIPS: STACK[Alice] -> POT : 40 (Alice bets 40)
ACTION: Bob folds
MOVE CARD GROUP: HAND[Bob] -> MUCK (2 cards)
STATE: POT=100 | STACKS: Alice=450 Bob=470 Carol=480

## Hand ends (no river)
AWARD POT: POT=100 -> STACK[Alice]
STATE: STACKS: Alice=550 Bob=470 Carol=480 | POT=0

## Cleanup
MOVE CARD GROUP: HAND[Alice] -> MUCK (2 cards)
MOVE CARD GROUP: BOARD (4 cards) -> MUCK
MOVE CARD GROUP: BURN (2 cards) -> MUCK
MOVE CARD GROUP: DECK (stub 40 cards) -> MUCK
ASSERT: MUCK count == 52
MOVE CARD GROUP: MUCK -> DECK
CLEAR: MUCK, BURN, BOARD, all HAND[*]

---

# HAND 3 (3-handed) — Blinds 5/10 Ante 0
Button: Carol | SB: Alice | BB: Bob
Starting stacks: Alice=550 Bob=470 Carol=480

## DECK (top → bottom)
As Jc Qh Kd Jd Th 6s Jh 8d 2h 3d 4c 5s
9h Ah Ad Ac Ks Kh Kc Qs Qd Qc Js Ts Td
Tc 9s 9d 9c 8s 8h 8c 7s 7h 7d 7c 6h 6d
6c 5h 5d 5c 4s 4h 4d 3s 3h 3c 2s 2d 2c

## Setup
MOVE CHIPS: STACK[Alice] -> POT : 5  (SB)
MOVE CHIPS: STACK[Bob]   -> POT : 10 (BB)
STATE: POT=15 | STACKS: Alice=545 Bob=460 Carol=480

## Deal hole cards (start at SB=Alice)
MOVE CARD: DECK -> HAND[Alice] : As
MOVE CARD: DECK -> HAND[Bob]   : Jc
MOVE CARD: DECK -> HAND[Carol] : Qh
MOVE CARD: DECK -> HAND[Alice] : Kd
MOVE CARD: DECK -> HAND[Bob]   : Jd
MOVE CARD: DECK -> HAND[Carol] : Th
STATE: DECK count=46

## Preflop action (first to act = left of BB = Carol)
MOVE CHIPS: STACK[Carol] -> POT : 30 (Carol raises to 30)
MOVE CHIPS: STACK[Alice] -> POT : 25 (Alice calls 25)
MOVE CHIPS: STACK[Bob]   -> POT : 20 (Bob calls 20)
STATE: POT=90 | STACKS: Alice=520 Bob=440 Carol=450

## Flop
MOVE CARD: DECK -> BURN : 6s
MOVE CARD: DECK -> BOARD: Jh
MOVE CARD: DECK -> BOARD: 8d
MOVE CARD: DECK -> BOARD: 2h
STATE: BOARD=[Jh 8d 2h] | DECK count=42

Postflop action (first to act = left of Button = Alice)
ACTION: Alice checks
MOVE CHIPS: STACK[Bob]   -> POT : 60 (Bob bets 60)
MOVE CHIPS: STACK[Carol] -> POT : 60 (Carol calls 60)
ACTION: Alice folds
MOVE CARD GROUP: HAND[Alice] -> MUCK (2 cards)
STATE: POT=210 | STACKS: Alice=520 Bob=380 Carol=390

## Turn
MOVE CARD: DECK -> BURN : 3d
MOVE CARD: DECK -> BOARD: 4c
STATE: BOARD=[Jh 8d 2h 4c] | DECK count=40

MOVE CHIPS: STACK[Bob]   -> POT : 140 (Bob bets 140)
MOVE CHIPS: STACK[Carol] -> POT : 140 (Carol calls 140)
STATE: POT=490 | STACKS: Bob=240 Carol=250

## River
MOVE CARD: DECK -> BURN : 5s
MOVE CARD: DECK -> BOARD: 9h
STATE: BOARD=[Jh 8d 2h 4c 9h] | DECK count=38

ACTION: Bob checks
MOVE CHIPS: STACK[Carol] -> POT : 150 (Carol bets 150)
MOVE CHIPS: STACK[Bob]   -> POT : 150 (Bob calls 150)
STATE: POT=790 | STACKS: Bob=90 Carol=100

## Showdown
SHOW: Bob   = [Jc Jd]
SHOW: Carol = [Qh Th]
EVAL (7-card): Carol makes a HEART FLUSH; Bob has trips (Jacks).
AWARD POT: POT=790 -> STACK[Carol]
STATE: STACKS: Alice=520 Bob=90 Carol=890 | POT=0

## Cleanup
MOVE CARD GROUP: HAND[Bob] -> MUCK (2 cards)
MOVE CARD GROUP: HAND[Carol] -> MUCK (2 cards)
MOVE CARD GROUP: BOARD (5) -> MUCK
MOVE CARD GROUP: BURN (3) -> MUCK
MOVE CARD GROUP: DECK (stub 38) -> MUCK
ASSERT: MUCK count == 52
MOVE CARD GROUP: MUCK -> DECK
CLEAR: MUCK, BURN, BOARD, all HAND[*]

---

# HAND 4 (3-handed) — Blinds 10/20 Ante 0
Button: Alice | SB: Bob | BB: Carol
Starting stacks: Alice=520 Bob=90 Carol=890

## DECK (top → bottom)
As Jc Kd Ah Js Qd 6c 2h 7h 9h Tc 5h 8s
3d Ad Ac Ks Kh Kc Qs Qh Qc Jh Jd Ts Th
Td 9s 9d 9c 8h 8d 8c 7s 7d 7c 6s 6h 6d
5s 5d 5c 4s 4h 4d 4c 3s 3h 3c 2s 2d 2c

## Setup
MOVE CHIPS: STACK[Bob]   -> POT : 10 (SB)
MOVE CHIPS: STACK[Carol] -> POT : 20 (BB)
STATE: POT=30 | STACKS: Alice=520 Bob=80 Carol=870

## Deal hole cards (start at SB=Bob)
MOVE CARD: DECK -> HAND[Bob]   : As
MOVE CARD: DECK -> HAND[Carol] : Jc
MOVE CARD: DECK -> HAND[Alice] : Kd
MOVE CARD: DECK -> HAND[Bob]   : Ah
MOVE CARD: DECK -> HAND[Carol] : Js
MOVE CARD: DECK -> HAND[Alice] : Qd
STATE: DECK count=46

## Preflop action (first to act = left of BB = Alice)
MOVE CHIPS: STACK[Alice] -> POT : 40 (Alice raises to 40)
ACTION: Bob goes all-in to 90 total
MOVE CHIPS: STACK[Bob]   -> POT : 80 (adds 80, now all-in)
MOVE CHIPS: STACK[Carol] -> POT : 70 (Carol calls to 90)
STATE: POT=220 | STACKS: Alice=480 Bob=0 Carol=800

ACTION: Alice re-raises to 220
MOVE CHIPS: STACK[Alice] -> POT : 180 (adds 180)
ACTION: Carol calls to 220
MOVE CHIPS: STACK[Carol] -> POT : 130 (adds 130)
STATE: POT=530 | STACKS: Alice=300 Bob=0 Carol=670

## Streets (Bob is all-in; Alice & Carol check down)
MOVE CARD: DECK -> BURN  : 6c
MOVE CARD: DECK -> BOARD : 2h
MOVE CARD: DECK -> BOARD : 7h
MOVE CARD: DECK -> BOARD : 9h

MOVE CARD: DECK -> BURN  : Tc
MOVE CARD: DECK -> BOARD : 5h

MOVE CARD: DECK -> BURN  : 8s
MOVE CARD: DECK -> BOARD : 3d
STATE: BOARD=[2h 7h 9h 5h 3d] | BURN=[6c Tc 8s]

## Showdown (side pot exists)
SHOW: Bob   = [As Ah]  (makes A-high HEART FLUSH using Ah + board hearts)
SHOW: Alice = [Kd Qd]
SHOW: Carol = [Jc Js]

POT SPLIT:
- POT.main  = 90*3 = 270 (Bob, Alice, Carol eligible)
- POT.side1 = (220-90)*2 = 260 (Alice & Carol only)

AWARD: POT.main 270 -> STACK[Bob]
AWARD: POT.side1 260 -> STACK[Carol]
STATE: STACKS: Alice=300 Bob=270 Carol=930 | POT=0

## Cleanup
MOVE CARD GROUP: HAND[Bob] -> MUCK (2)
MOVE CARD GROUP: HAND[Alice] -> MUCK (2)
MOVE CARD GROUP: HAND[Carol] -> MUCK (2)
MOVE CARD GROUP: BOARD (5) -> MUCK
MOVE CARD GROUP: BURN (3) -> MUCK
MOVE CARD GROUP: DECK (stub 38) -> MUCK
ASSERT: MUCK count == 52
MOVE CARD GROUP: MUCK -> DECK
CLEAR: MUCK, BURN, BOARD, all HAND[*]

---

# HAND 5 (3-handed) — Blinds 10/20 Ante 5
Button: Bob | SB: Carol | BB: Alice
Starting stacks: Alice=300 Bob=270 Carol=930

## DECK (top → bottom)
Kh As Ts Qd 2d Td Jd 5c 6d 7h 3h 8s 4s
9c Ah Ad Ac Ks Kd Kc Qs Qh Qc Js Jh Jc
Th Tc 9s 9h 9d 8h 8d 8c 7s 7d 7c 6s 6h
6c 5s 5h 5d 4h 4d 4c 3s 3d 3c 2s 2h 2c

## Setup (antes first)
MOVE CHIPS: STACK[Alice] -> POT : 5
MOVE CHIPS: STACK[Bob]   -> POT : 5
MOVE CHIPS: STACK[Carol] -> POT : 5
MOVE CHIPS: STACK[Carol] -> POT : 10 (SB)
MOVE CHIPS: STACK[Alice] -> POT : 20 (BB)
STATE: POT=45 | STACKS: Alice=275 Bob=265 Carol=915

## Deal hole cards (start at SB=Carol)
MOVE CARD: DECK -> HAND[Carol] : Kh
MOVE CARD: DECK -> HAND[Alice] : As
MOVE CARD: DECK -> HAND[Bob]   : Ts
MOVE CARD: DECK -> HAND[Carol] : Qd
MOVE CARD: DECK -> HAND[Alice] : 2d
MOVE CARD: DECK -> HAND[Bob]   : Td
STATE: DECK count=46

## Preflop action (first to act = left of BB = Bob)
ACTION: Bob folds
MOVE CARD GROUP: HAND[Bob] -> MUCK (2 cards)

ACTION: Carol calls (completes to 20)
MOVE CHIPS: STACK[Carol] -> POT : 10
ACTION: Alice checks
STATE: POT=55 | STACKS: Alice=275 Bob=265 Carol=905

## Board (all checks)
MOVE CARD: DECK -> BURN : Jd
MOVE CARD: DECK -> BOARD: 5c
MOVE CARD: DECK -> BOARD: 6d
MOVE CARD: DECK -> BOARD: 7h

MOVE CARD: DECK -> BURN : 3h
MOVE CARD: DECK -> BOARD: 8s

MOVE CARD: DECK -> BURN : 4s
MOVE CARD: DECK -> BOARD: 9c
STATE: BOARD=[5c 6d 7h 8s 9c] | POT=55

## Showdown (board straight; tie)
SHOW: Alice = [As 2d]
SHOW: Carol = [Kh Qd]
EVAL: Best 5-card hand for both = [5c 6d 7h 8s 9c] (straight on board)

SPLIT POT=55:
- Alice gets 27
- Carol gets 28 (odd chip to first seat left of Button=Bob → Carol)

AWARD: 27 -> STACK[Alice]
AWARD: 28 -> STACK[Carol]
STATE: STACKS: Alice=302 Bob=265 Carol=933 | POT=0

## Cleanup
MOVE CARD GROUP: HAND[Alice] -> MUCK (2)
MOVE CARD GROUP: HAND[Carol] -> MUCK (2)
MOVE CARD GROUP: BOARD (5) -> MUCK
MOVE CARD GROUP: BURN (3) -> MUCK
MOVE CARD GROUP: DECK (stub 38) -> MUCK
ASSERT: MUCK count == 52
MOVE CARD GROUP: MUCK -> DECK
CLEAR: MUCK, BURN, BOARD, all HAND[*]

---

# HAND 6 (3-handed) — Blinds 10/20 Ante 5
Button: Carol | SB: Alice | BB: Bob
Starting stacks: Alice=302 Bob=265 Carol=933

## DECK (top → bottom)
Kc Ad Qs Qc Jd Qh 5h Qd 7c 2s 8c 9s 6d
2d As Ah Ac Ks Kh Kd Js Jh Jc Ts Th Td
Tc 9h 9d 9c 8s 8h 8d 7s 7h 7d 6s 6h 6c
5s 5d 5c 4s 4h 4d 4c 3s 3h 3d 3c 2h 2c

## Setup (antes first)
MOVE CHIPS: STACK[Alice] -> POT : 5
MOVE CHIPS: STACK[Bob]   -> POT : 5
MOVE CHIPS: STACK[Carol] -> POT : 5
MOVE CHIPS: STACK[Alice] -> POT : 10 (SB)
MOVE CHIPS: STACK[Bob]   -> POT : 20 (BB)
STATE: POT=45 | STACKS: Alice=287 Bob=240 Carol=928

## Deal hole cards (start at SB=Alice)
MOVE CARD: DECK -> HAND[Alice] : Kc
MOVE CARD: DECK -> HAND[Bob]   : Ad
MOVE CARD: DECK -> HAND[Carol] : Qs
MOVE CARD: DECK -> HAND[Alice] : Qc
MOVE CARD: DECK -> HAND[Bob]   : Jd
MOVE CARD: DECK -> HAND[Carol] : Qh
STATE: DECK count=46

## Preflop action (first to act = left of BB = Carol)
MOVE CHIPS: STACK[Carol] -> POT : 60 (Carol raises to 60)
MOVE CHIPS: STACK[Alice] -> POT : 50 (Alice calls 50)
MOVE CHIPS: STACK[Bob]   -> POT : 40 (Bob calls 40)
STATE: POT=195 | STACKS: Alice=237 Bob=200 Carol=868

## Flop
MOVE CARD: DECK -> BURN : 5h
MOVE CARD: DECK -> BOARD: Qd
MOVE CARD: DECK -> BOARD: 7c
MOVE CARD: DECK -> BOARD: 2s
STATE: BOARD=[Qd 7c 2s] | POT=195

Postflop action (first to act = left of Button=Carol → Alice)
ACTION: Alice checks

ACTION: Bob goes all-in for 200
MOVE CHIPS: STACK[Bob] -> POT : 200
STATE: POT=395 | STACKS: Alice=237 Bob=0 Carol=868

ACTION: Carol calls 200
MOVE CHIPS: STACK[Carol] -> POT : 200
STATE: POT=595 | STACKS: Alice=237 Bob=0 Carol=668

ACTION: Alice folds
MOVE CARD GROUP: HAND[Alice] -> MUCK (2)

## Runout (players all-in)
MOVE CARD: DECK -> BURN : 8c
MOVE CARD: DECK -> BOARD: 9s
MOVE CARD: DECK -> BURN : 6d
MOVE CARD: DECK -> BOARD: 2d
STATE: BOARD=[Qd 7c 2s 9s 2d] | POT=595

## Showdown
SHOW: Bob   = [Ad Jd]
SHOW: Carol = [Qs Qh]
EVAL: Carol has trips (Queens); Bob has Ace-high.
AWARD POT: 595 -> STACK[Carol]
STATE: STACKS: Alice=237 Bob=0 Carol=1263 | POT=0

Bob eliminated. Heads-up begins next hand.
For this test, ante is now 0.

## Cleanup
MOVE CARD GROUP: HAND[Bob] -> MUCK (2)
MOVE CARD GROUP: HAND[Carol] -> MUCK (2)
MOVE CARD GROUP: BOARD (5) -> MUCK
MOVE CARD GROUP: BURN (3) -> MUCK
MOVE CARD GROUP: DECK (stub 38) -> MUCK
ASSERT: MUCK count == 52
MOVE CARD GROUP: MUCK -> DECK
CLEAR: MUCK, BURN, BOARD, all HAND[*]

---

# HAND 7 (Heads-up) — Blinds 10/20 Ante 0
Players: Alice vs Carol
Button/SB: Alice | BB: Carol
Starting stacks: Alice=237 Carol=1263

## DECK (top → bottom)
Ac Jh Kd 9h 3s Jc 7d 2c 8h Ks As Ah Ad
Kh Kc Qs Qh Qd Qc Js Jd Ts Th Td Tc 9s
9d 9c 8s 8d 8c 7s 7h 7c 6s 6h 6d 6c 5s
5h 5d 5c 4s 4h 4d 4c 3h 3d 3c 2s 2h 2d

## Setup
MOVE CHIPS: STACK[Alice] -> POT : 10 (SB)
MOVE CHIPS: STACK[Carol] -> POT : 20 (BB)
STATE: POT=30 | STACKS: Alice=227 Carol=1243

## Deal hole cards (heads-up: start at BB=Carol)
MOVE CARD: DECK -> HAND[Carol] : Ac
MOVE CARD: DECK -> HAND[Alice] : Jh
MOVE CARD: DECK -> HAND[Carol] : Kd
MOVE CARD: DECK -> HAND[Alice] : 9h
STATE: DECK count=48

## Preflop action (heads-up: Button acts first = Alice)
MOVE CHIPS: STACK[Alice] -> POT : 40 (Alice raises to 50 total)
MOVE CHIPS: STACK[Carol] -> POT : 30 (Carol calls to 50 total)
STATE: POT=100 | STACKS: Alice=187 Carol=1213

## Flop (BB acts first postflop)
MOVE CARD: DECK -> BURN : 3s
MOVE CARD: DECK -> BOARD: Jc
MOVE CARD: DECK -> BOARD: 7d
MOVE CARD: DECK -> BOARD: 2c
STATE: BOARD=[Jc 7d 2c] | POT=100

ACTION: Carol checks
MOVE CHIPS: STACK[Alice] -> POT : 60 (Alice bets 60)
MOVE CHIPS: STACK[Carol] -> POT : 60 (Carol calls 60)
STATE: POT=220 | STACKS: Alice=127 Carol=1153

## Turn
MOVE CARD: DECK -> BURN : 8h
MOVE CARD: DECK -> BOARD: Ks
STATE: BOARD=[Jc 7d 2c Ks] | POT=220

MOVE CHIPS: STACK[Carol] -> POT : 200 (Carol bets 200)
STATE: POT=420 | STACKS: Alice=127 Carol=953

ACTION: Alice folds
MOVE CARD GROUP: HAND[Alice] -> MUCK (2)

## Hand ends (no river)
AWARD POT: 420 -> STACK[Carol]
STATE: STACKS: Alice=127 Carol=1373 | POT=0

## Cleanup
MOVE CARD GROUP: HAND[Carol] -> MUCK (2)
MOVE CARD GROUP: BOARD (4) -> MUCK
MOVE CARD GROUP: BURN (2) -> MUCK
MOVE CARD GROUP: DECK (stub 42) -> MUCK
ASSERT: MUCK count == 52
MOVE CARD GROUP: MUCK -> DECK
CLEAR: MUCK, BURN, BOARD, all HAND[*]

---

# HAND 8 (Heads-up) — Blinds 10/20 Ante 0
Button/SB: Carol | BB: Alice
Starting stacks: Alice=127 Carol=1373

## DECK (top → bottom)
Kd As Qd Ah Jc 2c 7s 9h 4h 3d 6s 5c Ad
Ac Ks Kh Kc Qs Qh Qc Js Jh Jd Ts Th Td
Tc 9s 9d 9c 8s 8h 8d 8c 7h 7d 7c 6h 6d
6c 5s 5h 5d 4s 4d 4c 3s 3h 3c 2s 2h 2d

## Setup
MOVE CHIPS: STACK[Carol] -> POT : 10 (SB)
MOVE CHIPS: STACK[Alice] -> POT : 20 (BB)
STATE: POT=30 | STACKS: Alice=107 Carol=1363

## Deal hole cards (heads-up: start at BB=Alice)
MOVE CARD: DECK -> HAND[Alice] : Kd
MOVE CARD: DECK -> HAND[Carol] : As
MOVE CARD: DECK -> HAND[Alice] : Qd
MOVE CARD: DECK -> HAND[Carol] : Ah
STATE: DECK count=48

## Preflop action (Button acts first = Carol)
MOVE CHIPS: STACK[Carol] -> POT : 190 (Carol raises to 200 total)
STATE: POT=220 | STACKS: Alice=107 Carol=1173

ACTION: Alice calls all-in (can only call 107 more; total bet = 127)
MOVE CHIPS: STACK[Alice] -> POT : 107
STATE: POT=327 | STACKS: Alice=0 Carol=1173

UNCALLED BET RETURN:
Carol’s total bet = 200, Alice’s total bet = 127
Uncalled = 73 returned to Carol
MOVE CHIPS: POT -> STACK[Carol] : 73
STATE: POT=254 | STACKS: Alice=0 Carol=1246

## All-in runout
MOVE CARD: DECK -> BURN : Jc
MOVE CARD: DECK -> BOARD: 2c
MOVE CARD: DECK -> BOARD: 7s
MOVE CARD: DECK -> BOARD: 9h
MOVE CARD: DECK -> BURN : 4h
MOVE CARD: DECK -> BOARD: 3d
MOVE CARD: DECK -> BURN : 6s
MOVE CARD: DECK -> BOARD: 5c
STATE: BOARD=[2c 7s 9h 3d 5c] | POT=254

## Showdown
SHOW: Alice = [Kd Qd]
SHOW: Carol = [As Ah]
EVAL: Carol wins with pair of Aces.
AWARD POT: 254 -> STACK[Carol]
FINAL STACKS: Alice=0 Carol=1500

## Final cleanup (optional)
MOVE CARD GROUP: HAND[Alice], HAND[Carol], BOARD, BURN, DECK stub -> MUCK
ASSERT: MUCK count == 52

TOURNAMENT WINNER: Carol