# Texas Hold'em - Rules, Actions & Turn Structure

```yaml
setup:
  - setVar: { scope: global, var: activePlayers, value: { aggregate: { op: count, query: { query: players } } } }
  - setVar: { scope: global, var: dealerSeat, value: { op: '-', left: { aggregate: { op: count, query: { query: players } } }, right: 1 } }
  - setVar: { scope: global, var: actingPosition, value: 0 }
  - forEach:
      bind: $player
      over: { query: players }
      effects:
        - setVar: { scope: pvar, player: { chosen: $player }, var: seatIndex, value: { ref: binding, name: $player } }
        - setVar: { scope: pvar, player: { chosen: $player }, var: chipStack, value: 1000 }
        - setVar: { scope: pvar, player: { chosen: $player }, var: eliminated, value: false }
        - setVar: { scope: pvar, player: { chosen: $player }, var: handActive, value: true }
        - setVar: { scope: pvar, player: { chosen: $player }, var: allIn, value: false }
        - setVar: { scope: pvar, player: { chosen: $player }, var: actedSinceLastFullRaise, value: false }

turnStructure:
  phases:
    - id: hand-setup
      onEnter:
        - macro: find-next-non-eliminated
          args:
            fromSeat: { ref: gvar, var: dealerSeat }
        - setVar: { scope: global, var: oddChipRemainder, value: 0 }
        - setVar: { scope: global, var: pot, value: 0 }
        - setVar: { scope: global, var: currentBet, value: 0 }
        - setVar: { scope: global, var: lastRaiseSize, value: { ref: gvar, var: bigBlind } }
        - setVar: { scope: global, var: bettingClosed, value: false }
        - setVar: { scope: global, var: handPhase, value: 0 }
        - setVar: { scope: global, var: preflopBigBlindSeat, value: { ref: gvar, var: dealerSeat } }
        - setVar: { scope: global, var: preflopBigBlindOptionOpen, value: false }
        - forEach:
            bind: $player
            over: { query: players }
            effects:
              - setVar: { scope: pvar, player: { chosen: $player }, var: streetBet, value: 0 }
              - setVar: { scope: pvar, player: { chosen: $player }, var: totalBet, value: 0 }
              - setVar: { scope: pvar, player: { chosen: $player }, var: showdownScore, value: 0 }
              - if:
                  when: { op: '==', left: { ref: pvar, player: { chosen: $player }, var: eliminated }, right: false }
                  then:
                    - setVar: { scope: pvar, player: { chosen: $player }, var: handActive, value: true }
                    - setVar: { scope: pvar, player: { chosen: $player }, var: allIn, value: false }
                    - setVar: { scope: pvar, player: { chosen: $player }, var: actedSinceLastFullRaise, value: false }
        - moveAll: { from: community:none, to: muck:none }
        - moveAll: { from: burn:none, to: muck:none }
        - forEach:
            bind: $player
            over: { query: players }
            effects:
              - moveAll:
                  from: { zoneExpr: { concat: ['hand:', { ref: binding, name: $player }] } }
                  to: muck:none
        - moveAll: { from: muck:none, to: deck:none }
        - shuffle: { zone: deck:none }
        - forEach:
            bind: $player
            over: { query: players }
            effects:
              - if:
                  when: { op: '==', left: { ref: pvar, player: { chosen: $player }, var: eliminated }, right: false }
                  then:
                    - draw:
                        from: deck:none
                        to: { zoneExpr: { concat: ['hand:', { ref: binding, name: $player }] } }
                        count: 2
        - macro: post-forced-bets-and-set-preflop-actor
        - gotoPhaseExact: { phase: preflop }

    - id: preflop
      onEnter:
        - setVar: { scope: global, var: handPhase, value: 0 }
        - if:
            when: { conditionMacro: live-hands-at-most-one, args: {} }
            then:
              - gotoPhaseExact: { phase: showdown }
        - macro: find-next-to-act
          args:
            fromSeat:
              if:
                when: { op: '==', left: { ref: gvar, var: actingPosition }, right: 0 }
                then: { op: '-', left: { aggregate: { op: count, query: { query: players } } }, right: 1 }
                else: { op: '-', left: { ref: gvar, var: actingPosition }, right: 1 }
        - if:
            when: { op: '==', left: { ref: gvar, var: bettingClosed }, right: true }
            then:
              - macro: advance-after-betting

    - id: flop
      onEnter:
        - setVar: { scope: global, var: handPhase, value: 1 }
        - macro: deal-community
          args:
            count: 3
        - macro: reset-reopen-state-for-live-seats
        - forEach:
            bind: $player
            over: { query: players }
            effects:
              - if:
                  when:
                    op: and
                    args:
                      - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: handActive }, right: true }
                      - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: allIn }, right: false }
                  then:
                    - setVar: { scope: pvar, player: { chosen: $player }, var: streetBet, value: 0 }
        - setVar: { scope: global, var: currentBet, value: 0 }
        - setVar: { scope: global, var: bettingClosed, value: false }
        - macro: find-next-to-act
          args:
            fromSeat: { ref: gvar, var: dealerSeat }
        - if:
            when: { op: '==', left: { ref: gvar, var: bettingClosed }, right: true }
            then:
              - macro: advance-after-betting

    - id: turn
      onEnter:
        - setVar: { scope: global, var: handPhase, value: 2 }
        - macro: deal-community
          args:
            count: 1
        - macro: reset-reopen-state-for-live-seats
        - forEach:
            bind: $player
            over: { query: players }
            effects:
              - if:
                  when:
                    op: and
                    args:
                      - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: handActive }, right: true }
                      - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: allIn }, right: false }
                  then:
                    - setVar: { scope: pvar, player: { chosen: $player }, var: streetBet, value: 0 }
        - setVar: { scope: global, var: currentBet, value: 0 }
        - setVar: { scope: global, var: bettingClosed, value: false }
        - macro: find-next-to-act
          args:
            fromSeat: { ref: gvar, var: dealerSeat }
        - if:
            when: { op: '==', left: { ref: gvar, var: bettingClosed }, right: true }
            then:
              - macro: advance-after-betting

    - id: river
      onEnter:
        - setVar: { scope: global, var: handPhase, value: 3 }
        - macro: deal-community
          args:
            count: 1
        - macro: reset-reopen-state-for-live-seats
        - forEach:
            bind: $player
            over: { query: players }
            effects:
              - if:
                  when:
                    op: and
                    args:
                      - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: handActive }, right: true }
                      - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: allIn }, right: false }
                  then:
                    - setVar: { scope: pvar, player: { chosen: $player }, var: streetBet, value: 0 }
        - setVar: { scope: global, var: currentBet, value: 0 }
        - setVar: { scope: global, var: bettingClosed, value: false }
        - macro: find-next-to-act
          args:
            fromSeat: { ref: gvar, var: dealerSeat }
        - if:
            when: { op: '==', left: { ref: gvar, var: bettingClosed }, right: true }
            then:
              - macro: advance-after-betting

    - id: showdown
      onEnter:
        - setVar: { scope: global, var: handPhase, value: 4 }
        - forEach:
            bind: $player
            over: { query: players }
            effects:
              - if:
                  when:
                    op: and
                    args:
                      - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: handActive }, right: true }
                      -
                        op: '>='
                        left:
                          aggregate:
                            op: count
                            query:
                              query: concat
                              sources:
                                - { query: tokensInZone, zone: { zoneExpr: { concat: ['hand:', { ref: binding, name: $player }] } } }
                                - { query: tokensInZone, zone: community:none }
                        right: 5
                  then:
                    - reveal:
                        zone: { zoneExpr: { concat: ['hand:', { ref: binding, name: $player }] } }
                        to: all
                    - evaluateSubset:
                        source:
                          query: concat
                          sources:
                            - { query: tokensInZone, zone: { zoneExpr: { concat: ['hand:', { ref: binding, name: $player }] } } }
                            - { query: tokensInZone, zone: community:none }
                        subsetSize: 5
                        subsetBind: $subset
                        compute:
                          - macro: hand-rank-score
                            args:
                              cardsQuery: { query: binding, name: $subset }
                        scoreExpr: { ref: binding, name: $handScore }
                        resultBind: $bestScore
                        in:
                          - setVar:
                              scope: pvar
                              player: { chosen: $player }
                              var: showdownScore
                              value: { ref: binding, name: $bestScore }
        - if:
            when: { conditionMacro: live-hands-at-most-one, args: {} }
            then:
              - macro: award-uncontested-pot
            else:
              - macro: distribute-contested-pots

    - id: hand-cleanup
      onEnter:
        - forEach:
            bind: $player
            over: { query: players }
            effects:
              - conceal: { zone: { zoneExpr: { concat: ['hand:', { ref: binding, name: $player }] } } }
        - moveAll: { from: community:none, to: muck:none }
        - moveAll: { from: burn:none, to: muck:none }
        - forEach:
            bind: $player
            over: { query: players }
            effects:
              - moveAll:
                  from: { zoneExpr: { concat: ['hand:', { ref: binding, name: $player }] } }
                  to: muck:none
        - macro: eliminate-busted-players
        - addVar: { scope: global, var: handsPlayed, delta: 1 }
        - macro: escalate-blinds

turnOrder:
  type: roundRobin

actions:
  - id: fold
    actor: active
    executor: actor
    phase: [preflop, flop, turn, river]
    params: []
    pre:
      op: and
      args:
        - { op: '==', left: { ref: pvar, player: actor, var: handActive }, right: true }
        - { op: '==', left: { ref: pvar, player: actor, var: allIn }, right: false }
    cost: []
    effects:
      - setVar: { scope: pvar, player: actor, var: handActive, value: false }
      - moveAll:
          from: { zoneExpr: { concat: ['hand:', { ref: activePlayer }] } }
          to: muck:none
      - setVar: { scope: pvar, player: actor, var: actedSinceLastFullRaise, value: true }
      - macro: mark-preflop-big-blind-acted
      - macro: betting-round-completion
      - macro: advance-after-betting
    limits: []

  - id: check
    actor: active
    executor: actor
    phase: [preflop, flop, turn, river]
    params: []
    pre:
      op: and
      args:
        - { op: '==', left: { ref: pvar, player: actor, var: handActive }, right: true }
        - { op: '==', left: { ref: pvar, player: actor, var: allIn }, right: false }
        - { op: '==', left: { ref: pvar, player: actor, var: streetBet }, right: { ref: gvar, var: currentBet } }
    cost: []
    effects:
      - setVar: { scope: pvar, player: actor, var: actedSinceLastFullRaise, value: true }
      - macro: mark-preflop-big-blind-acted
      - macro: betting-round-completion
      - macro: advance-after-betting
    limits: []

  - id: call
    actor: active
    executor: actor
    phase: [preflop, flop, turn, river]
    params: []
    pre:
      op: and
      args:
        - { op: '==', left: { ref: pvar, player: actor, var: handActive }, right: true }
        - { op: '==', left: { ref: pvar, player: actor, var: allIn }, right: false }
        - { op: '>', left: { ref: gvar, var: currentBet }, right: { ref: pvar, player: actor, var: streetBet } }
    cost: []
    effects:
      - transferVar:
          from: { scope: pvar, player: actor, var: chipStack }
          to: { scope: global, var: pot }
          amount: { op: '-', left: { ref: gvar, var: currentBet }, right: { ref: pvar, player: actor, var: streetBet } }
          actualBind: $callPaid
      - addVar: { scope: pvar, player: actor, var: streetBet, delta: { ref: binding, name: $callPaid } }
      - addVar: { scope: pvar, player: actor, var: totalBet, delta: { ref: binding, name: $callPaid } }
      - if:
          when: { op: '==', left: { ref: pvar, player: actor, var: chipStack }, right: 0 }
          then:
            - setVar: { scope: pvar, player: actor, var: allIn, value: true }
      - setVar: { scope: pvar, player: actor, var: actedSinceLastFullRaise, value: true }
      - macro: mark-preflop-big-blind-acted
      - macro: betting-round-completion
      - macro: advance-after-betting
    limits: []

  - id: raise
    actor: active
    executor: actor
    phase: [preflop, flop, turn, river]
    params:
      - name: raiseAmount
        domain:
          query: intsInRange
          min: { op: '+', left: { ref: gvar, var: currentBet }, right: { ref: gvar, var: lastRaiseSize } }
          max: { op: '+', left: { ref: pvar, player: actor, var: streetBet }, right: { ref: pvar, player: actor, var: chipStack } }
          step: 1
          alwaysInclude:
            - { op: '+', left: { ref: gvar, var: currentBet }, right: { op: '*', left: { ref: gvar, var: bigBlind }, right: 2 } }
            - { op: '+', left: { ref: gvar, var: currentBet }, right: { op: '*', left: { ref: gvar, var: bigBlind }, right: 3 } }
            - { op: '+', left: { ref: gvar, var: currentBet }, right: { op: '*', left: { ref: gvar, var: bigBlind }, right: 5 } }
          maxResults: 10
    pre:
      op: and
      args:
        - { op: '==', left: { ref: pvar, player: actor, var: handActive }, right: true }
        - { op: '==', left: { ref: pvar, player: actor, var: allIn }, right: false }
        - { op: '>', left: { ref: pvar, player: actor, var: chipStack }, right: 0 }
        - { op: '==', left: { ref: pvar, player: actor, var: actedSinceLastFullRaise }, right: false }
    cost: []
    effects:
      - let:
          bind: $prevCurrentBet
          value: { ref: gvar, var: currentBet }
          in:
            - transferVar:
                from: { scope: pvar, player: actor, var: chipStack }
                to: { scope: global, var: pot }
                amount: { op: '-', left: { ref: binding, name: raiseAmount }, right: { ref: pvar, player: actor, var: streetBet } }
                actualBind: $raisePaid
            - addVar: { scope: pvar, player: actor, var: streetBet, delta: { ref: binding, name: $raisePaid } }
            - addVar: { scope: pvar, player: actor, var: totalBet, delta: { ref: binding, name: $raisePaid } }
            - setVar: { scope: global, var: currentBet, value: { ref: pvar, player: actor, var: streetBet } }
            - setVar:
                scope: global
                var: lastRaiseSize
                value: { op: '-', left: { ref: pvar, player: actor, var: streetBet }, right: { ref: binding, name: $prevCurrentBet } }
      - macro: reset-reopen-state-for-eligible-actors
      - if:
          when: { op: '==', left: { ref: pvar, player: actor, var: chipStack }, right: 0 }
          then:
            - setVar: { scope: pvar, player: actor, var: allIn, value: true }
      - setVar: { scope: pvar, player: actor, var: actedSinceLastFullRaise, value: true }
      - macro: mark-preflop-big-blind-acted
      - macro: betting-round-completion
      - macro: advance-after-betting
    limits: []

  - id: allIn
    actor: active
    executor: actor
    phase: [preflop, flop, turn, river]
    params: []
    pre:
      op: and
      args:
        - { op: '==', left: { ref: pvar, player: actor, var: handActive }, right: true }
        - { op: '==', left: { ref: pvar, player: actor, var: allIn }, right: false }
        - { op: '>', left: { ref: pvar, player: actor, var: chipStack }, right: 0 }
        - { op: '==', left: { ref: pvar, player: actor, var: actedSinceLastFullRaise }, right: false }
    cost: []
    effects:
      - let:
          bind: $prevCurrentBet
          value: { ref: gvar, var: currentBet }
          in:
            - let:
                bind: $prevLastRaiseSize
                value: { ref: gvar, var: lastRaiseSize }
                in:
                  - transferVar:
                      from: { scope: pvar, player: actor, var: chipStack }
                      to: { scope: global, var: pot }
                      amount: { ref: pvar, player: actor, var: chipStack }
                      actualBind: $allInPaid
                  - addVar: { scope: pvar, player: actor, var: streetBet, delta: { ref: binding, name: $allInPaid } }
                  - addVar: { scope: pvar, player: actor, var: totalBet, delta: { ref: binding, name: $allInPaid } }
                  - setVar: { scope: pvar, player: actor, var: allIn, value: true }
                  - if:
                      when: { op: '>', left: { ref: pvar, player: actor, var: streetBet }, right: { ref: binding, name: $prevCurrentBet } }
                      then:
                        - setVar: { scope: global, var: currentBet, value: { ref: pvar, player: actor, var: streetBet } }
                        - if:
                            when:
                              op: '>='
                              left: { op: '-', left: { ref: pvar, player: actor, var: streetBet }, right: { ref: binding, name: $prevCurrentBet } }
                              right: { ref: binding, name: $prevLastRaiseSize }
                            then:
                              - setVar:
                                  scope: global
                                  var: lastRaiseSize
                                  value: { op: '-', left: { ref: pvar, player: actor, var: streetBet }, right: { ref: binding, name: $prevCurrentBet } }
                              - macro: reset-reopen-state-for-eligible-actors
      - setVar: { scope: pvar, player: actor, var: actedSinceLastFullRaise, value: true }
      - macro: mark-preflop-big-blind-acted
      - macro: betting-round-completion
      - macro: advance-after-betting
    limits: []
```
