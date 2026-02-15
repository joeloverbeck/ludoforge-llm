# Texas Hold'em - Macros

```yaml
effectMacros:
  - id: hand-rank-score
    params:
      - { name: cardsZone, type: zoneSelector }
    exports: [$handScore]
    effects:
      # Contract scaffold: downstream showdown tickets will replace this with
      # full 5-card rank evaluation once full showdown dataflow is wired.
      - let:
          bind: $handScore
          value: 0
          in: []

  - id: collect-forced-bets
    params:
      - { name: sbPlayer, type: playerSelector }
      - { name: bbPlayer, type: playerSelector }
    exports: []
    effects:
      - if:
          when: { op: '>', left: { ref: gvar, var: ante }, right: 0 }
          then:
            - forEach:
                bind: $player
                over: { query: players }
                effects:
                  - if:
                      when:
                        op: '=='
                        left: { ref: pvar, player: { chosen: '$player' }, var: eliminated }
                        right: false
                      then:
                        - commitResource:
                            from: { scope: pvar, player: { chosen: '$player' }, var: chipStack }
                            to: { scope: global, var: pot }
                            amount: { ref: gvar, var: ante }
                            actualBind: $antePaid
                        - addVar:
                            scope: pvar
                            player: { chosen: '$player' }
                            var: totalBet
                            delta: { ref: binding, name: $antePaid }
                        - if:
                            when: { op: '==', left: { ref: pvar, player: { chosen: '$player' }, var: chipStack }, right: 0 }
                            then:
                              - setVar: { scope: pvar, player: { chosen: '$player' }, var: allIn, value: true }
      - commitResource:
          from: { scope: pvar, player: { param: sbPlayer }, var: chipStack }
          to: { scope: global, var: pot }
          amount: { ref: gvar, var: smallBlind }
          actualBind: $sbPaid
      - addVar:
          scope: pvar
          player: { param: sbPlayer }
          var: streetBet
          delta: { ref: binding, name: $sbPaid }
      - addVar:
          scope: pvar
          player: { param: sbPlayer }
          var: totalBet
          delta: { ref: binding, name: $sbPaid }
      - if:
          when: { op: '==', left: { ref: pvar, player: { param: sbPlayer }, var: chipStack }, right: 0 }
          then:
            - setVar: { scope: pvar, player: { param: sbPlayer }, var: allIn, value: true }
      - commitResource:
          from: { scope: pvar, player: { param: bbPlayer }, var: chipStack }
          to: { scope: global, var: pot }
          amount: { ref: gvar, var: bigBlind }
          actualBind: $bbPaid
      - addVar:
          scope: pvar
          player: { param: bbPlayer }
          var: streetBet
          delta: { ref: binding, name: $bbPaid }
      - addVar:
          scope: pvar
          player: { param: bbPlayer }
          var: totalBet
          delta: { ref: binding, name: $bbPaid }
      - if:
          when: { op: '==', left: { ref: pvar, player: { param: bbPlayer }, var: chipStack }, right: 0 }
          then:
            - setVar: { scope: pvar, player: { param: bbPlayer }, var: allIn, value: true }
      - setVar:
          scope: global
          var: currentBet
          value: { ref: gvar, var: bigBlind }
      - setVar:
          scope: global
          var: lastRaiseSize
          value: { ref: gvar, var: bigBlind }

  - id: deal-community
    params:
      - { name: count, type: number }
    exports: []
    effects:
      - draw:
          from: deck:none
          to: burn:none
          count: 1
      - draw:
          from: deck:none
          to: community:none
          count: { param: count }

  - id: betting-round-completion
    params: []
    exports: []
    effects:
      - setVar:
          scope: global
          var: bettingClosed
          value: true
      - forEach:
          bind: $player
          over: { query: players }
          effects:
            - if:
                when:
                  op: and
                  args:
                    - { op: '==', left: { ref: pvar, player: { chosen: '$player' }, var: eliminated }, right: false }
                    - { op: '==', left: { ref: pvar, player: { chosen: '$player' }, var: handActive }, right: true }
                    - { op: '==', left: { ref: pvar, player: { chosen: '$player' }, var: allIn }, right: false }
                    -
                      op: '!='
                      left: { ref: pvar, player: { chosen: '$player' }, var: streetBet }
                      right: { ref: gvar, var: currentBet }
                then:
                  - setVar:
                      scope: global
                      var: bettingClosed
                      value: false

  - id: side-pot-distribution
    params: []
    exports: []
    effects:
      # Contract scaffold: full side-pot layering and split-pot ties are deferred
      # to showdown-focused ticketing to keep this ticket architecture-safe.
      - if:
          when: false
          then: []

  - id: eliminate-busted-players
    params: []
    exports: []
    effects:
      - forEach:
          bind: $player
          over: { query: players }
          effects:
            - if:
                when:
                  op: and
                  args:
                    - { op: '==', left: { ref: pvar, player: { chosen: '$player' }, var: eliminated }, right: false }
                    - { op: '==', left: { ref: pvar, player: { chosen: '$player' }, var: chipStack }, right: 0 }
                then:
                  - setVar: { scope: pvar, player: { chosen: '$player' }, var: eliminated, value: true }
                  - addVar: { scope: global, var: activePlayers, delta: -1 }

  - id: escalate-blinds
    params: []
    exports: []
    effects:
      - if:
          when:
            op: and
            args:
              - { op: '==', left: { ref: gvar, var: blindLevel }, right: 0 }
              - { op: '>=', left: { ref: gvar, var: handsPlayed }, right: 10 }
          then:
            - setVar: { scope: global, var: blindLevel, value: 1 }
            - setVar: { scope: global, var: smallBlind, value: 15 }
            - setVar: { scope: global, var: bigBlind, value: 30 }
            - setVar: { scope: global, var: ante, value: 0 }
      - if:
          when:
            op: and
            args:
              - { op: '==', left: { ref: gvar, var: blindLevel }, right: 1 }
              - { op: '>=', left: { ref: gvar, var: handsPlayed }, right: 20 }
          then:
            - setVar: { scope: global, var: blindLevel, value: 2 }
            - setVar: { scope: global, var: smallBlind, value: 25 }
            - setVar: { scope: global, var: bigBlind, value: 50 }
            - setVar: { scope: global, var: ante, value: 5 }
      - if:
          when:
            op: and
            args:
              - { op: '==', left: { ref: gvar, var: blindLevel }, right: 2 }
              - { op: '>=', left: { ref: gvar, var: handsPlayed }, right: 30 }
          then:
            - setVar: { scope: global, var: blindLevel, value: 3 }
            - setVar: { scope: global, var: smallBlind, value: 50 }
            - setVar: { scope: global, var: bigBlind, value: 100 }
            - setVar: { scope: global, var: ante, value: 10 }
      - if:
          when:
            op: and
            args:
              - { op: '==', left: { ref: gvar, var: blindLevel }, right: 3 }
              - { op: '>=', left: { ref: gvar, var: handsPlayed }, right: 38 }
          then:
            - setVar: { scope: global, var: blindLevel, value: 4 }
            - setVar: { scope: global, var: smallBlind, value: 75 }
            - setVar: { scope: global, var: bigBlind, value: 150 }
            - setVar: { scope: global, var: ante, value: 15 }
      - if:
          when:
            op: and
            args:
              - { op: '==', left: { ref: gvar, var: blindLevel }, right: 4 }
              - { op: '>=', left: { ref: gvar, var: handsPlayed }, right: 46 }
          then:
            - setVar: { scope: global, var: blindLevel, value: 5 }
            - setVar: { scope: global, var: smallBlind, value: 100 }
            - setVar: { scope: global, var: bigBlind, value: 200 }
            - setVar: { scope: global, var: ante, value: 25 }
      - if:
          when:
            op: and
            args:
              - { op: '==', left: { ref: gvar, var: blindLevel }, right: 5 }
              - { op: '>=', left: { ref: gvar, var: handsPlayed }, right: 52 }
          then:
            - setVar: { scope: global, var: blindLevel, value: 6 }
            - setVar: { scope: global, var: smallBlind, value: 150 }
            - setVar: { scope: global, var: bigBlind, value: 300 }
            - setVar: { scope: global, var: ante, value: 50 }
      - if:
          when:
            op: and
            args:
              - { op: '==', left: { ref: gvar, var: blindLevel }, right: 6 }
              - { op: '>=', left: { ref: gvar, var: handsPlayed }, right: 58 }
          then:
            - setVar: { scope: global, var: blindLevel, value: 7 }
            - setVar: { scope: global, var: smallBlind, value: 200 }
            - setVar: { scope: global, var: bigBlind, value: 400 }
            - setVar: { scope: global, var: ante, value: 50 }
      - if:
          when:
            op: and
            args:
              - { op: '==', left: { ref: gvar, var: blindLevel }, right: 7 }
              - { op: '>=', left: { ref: gvar, var: handsPlayed }, right: 63 }
          then:
            - setVar: { scope: global, var: blindLevel, value: 8 }
            - setVar: { scope: global, var: smallBlind, value: 300 }
            - setVar: { scope: global, var: bigBlind, value: 600 }
            - setVar: { scope: global, var: ante, value: 75 }
      - if:
          when:
            op: and
            args:
              - { op: '==', left: { ref: gvar, var: blindLevel }, right: 8 }
              - { op: '>=', left: { ref: gvar, var: handsPlayed }, right: 68 }
          then:
            - setVar: { scope: global, var: blindLevel, value: 9 }
            - setVar: { scope: global, var: smallBlind, value: 500 }
            - setVar: { scope: global, var: bigBlind, value: 1000 }
            - setVar: { scope: global, var: ante, value: 100 }
```
