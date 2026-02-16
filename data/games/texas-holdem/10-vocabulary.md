# Texas Hold'em - Vocabulary

```yaml
zones:
  - { id: deck, owner: none, visibility: hidden, ordering: stack }
  - { id: burn, owner: none, visibility: hidden, ordering: set }
  - { id: community, owner: none, visibility: public, ordering: queue }
  - { id: hand, owner: player, visibility: owner, ordering: set }
  - { id: muck, owner: none, visibility: hidden, ordering: set }

globalVars:
  - { name: pot, type: int, init: 0, min: 0, max: 10000000 }
  - { name: currentBet, type: int, init: 0, min: 0, max: 1000000 }
  - { name: lastRaiseSize, type: int, init: 0, min: 0, max: 1000000 }
  - { name: dealerSeat, type: int, init: 0, min: 0, max: 9 }
  - { name: smallBlind, type: int, init: 10, min: 1, max: 1000000 }
  - { name: bigBlind, type: int, init: 20, min: 1, max: 1000000 }
  - { name: ante, type: int, init: 0, min: 0, max: 1000000 }
  - { name: blindLevel, type: int, init: 0, min: 0, max: 100 }
  - { name: handsPlayed, type: int, init: 0, min: 0, max: 100000 }
  - { name: handPhase, type: int, init: 0, min: 0, max: 4 }
  - { name: activePlayers, type: int, init: 0, min: 0, max: 10 }
  - { name: actingPosition, type: int, init: 0, min: 0, max: 9 }
  - { name: bettingClosed, type: boolean, init: false }
  - { name: preflopBigBlindSeat, type: int, init: 0, min: 0, max: 9 }
  - { name: preflopBigBlindOptionOpen, type: boolean, init: false }
  - { name: oddChipRemainder, type: int, init: 0, min: 0, max: 1000000 }

perPlayerVars:
  - { name: chipStack, type: int, init: 0, min: 0, max: 1000000 }
  - { name: streetBet, type: int, init: 0, min: 0, max: 1000000 }
  - { name: totalBet, type: int, init: 0, min: 0, max: 1000000 }
  - { name: handActive, type: boolean, init: true }
  - { name: allIn, type: boolean, init: false }
  - { name: actedSinceLastFullRaise, type: boolean, init: false }
  - { name: eliminated, type: boolean, init: false }
  - { name: seatIndex, type: int, init: 0, min: 0, max: 9 }
  - { name: showdownScore, type: int, init: 0, min: 0, max: 999999999999 }
```
