# Texas Hold'em - Verbalization

```yaml
verbalization:
  labels:
    # ── Action IDs ───────────────────────────────────────────────────────
    fold: "Fold"
    check: "Check"
    call: "Call"
    raise: "Raise"
    allIn: "All-In"

    # ── Zones (compiled form with :owner suffix) ─────────────────────────
    "deck:none": "Deck"
    "community:none": "Community Cards"
    "muck:none": "Muck"
    "burn:none": "Burn Pile"

    # ── Global variables ─────────────────────────────────────────────────
    pot: "Pot"
    currentBet: "Current Bet"
    lastRaiseSize: "Last Raise Size"
    dealerSeat: "Dealer Seat"
    smallBlind: "Small Blind"
    bigBlind: "Big Blind"
    ante: "Ante"
    blindLevel: "Blind Level"
    handsPlayed: "Hands Played"
    handPhase: "Hand Phase"
    activePlayers: "Active Players"

    # ── Per-player variables ─────────────────────────────────────────────
    chipStack: "Chip Stack"
    streetBet: "Street Bet"
    totalBet: "Total Bet"
    showdownScore: "Showdown Score"
    handActive: "Hand Active"
    eliminated: "Eliminated"

    # ── Action parameters ────────────────────────────────────────────────
    raiseAmount: "Raise Amount"

  # ── Stages (actual phase IDs) ────────────────────────────────────────
  stages:
    hand-setup: "Hand setup"
    preflop: "Pre-flop"
    flop: "Flop"
    turn: "Turn"
    river: "River"
    showdown: "Showdown"
    hand-cleanup: "Hand cleanup"

  # ── Macros ───────────────────────────────────────────────────────────
  macros:
    deal-community:
      class: deal
      summary: "Deal community cards"
    hand-rank-score:
      class: scoring
      summary: "Evaluate best 5-card hand"
    post-forced-bets-and-set-preflop-actor:
      class: betting
      summary: "Post blinds and antes"
    find-next-to-act:
      class: betting
      summary: "Find next player to act"
    reset-reopen-state-for-live-seats:
      class: betting
      summary: "Reset action flags for live players"
    reset-reopen-state-for-eligible-actors:
      class: betting
      summary: "Reopen action for eligible players after raise"
    betting-round-completion:
      class: betting
      summary: "Check if betting round is complete"
    advance-after-betting:
      class: betting
      summary: "Advance to next phase after betting"
    eliminate-busted-players:
      class: cleanup
      summary: "Eliminate players with zero chips"
    escalate-blinds:
      class: cleanup
      summary: "Increase blind levels"
    mark-preflop-big-blind-acted:
      class: betting
      summary: "Mark big blind option as exercised"
    find-next-non-eliminated:
      class: utility
      summary: "Find next non-eliminated player"
    award-uncontested-pot:
      class: scoring
      summary: "Award pot to last remaining player"
    distribute-contested-pots:
      class: scoring
      summary: "Distribute pot at showdown"
    dealHoleCards:
      class: deal
      summary: "Deal two hole cards to each player"

  # ── Sentence plans ──────────────────────────────────────────────────
  sentencePlans:
    addVar:
      pot:
        "+10": "Add 10 to pot"
        "+20": "Add 20 to pot"
        "+1": "Add 1 to pot"
      chipStack:
        "-10": "Pay 10 from stack"
        "-20": "Pay 20 from stack"
        "-1": "Pay 1 from stack"
    transferVar:
      chipStack:
        "-1": "Pay from stack"
    setVar:
      handActive:
        "false": "Fold hand"
      allIn:
        "true": "Go all-in"
      currentBet:
        "0": "Reset current bet"

  # ── Suppress patterns ───────────────────────────────────────────────
  suppressPatterns:
    - "*Count"
    - "*Tracker"
    - "__*"
    - "temp*"
    - "actingPosition"
    - "bettingClosed"
    - "preflopBigBlindSeat"
    - "preflopBigBlindOptionOpen"
    - "oddChipRemainder"
    - "actedSinceLastFullRaise"
    - "seatIndex"
```
