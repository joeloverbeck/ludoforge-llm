# Fire in the Lake - Terminal

```yaml
terminal:
  checkpoints:
    - id: us-victory
      seat: 'us'
      timing: duringCoup
      phases: [coupVictory]
      when:
        op: and
        args:
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
          - op: '>'
            left:
              op: '+'
              left:
                aggregate:
                  op: sum
                  query:
                    query: mapSpaces
                    filter:
                      condition:
                        op: or
                        args:
                          - { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: passiveSupport }
                          - { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeSupport }
                  bind: $zone
                  valueExpr:
                    if:
                      when: { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeSupport }
                      then: { op: '*', left: { ref: zoneProp, zone: $zone, prop: population }, right: 2 }
                      else: { ref: zoneProp, zone: $zone, prop: population }
              right:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: available-US:none
                    filter:
                      op: and
                      args:
                        - { prop: type, op: in, value: [troops, base] }
            right: 50
    - id: arvn-victory
      seat: 'arvn'
      timing: duringCoup
      phases: [coupVictory]
      when:
        op: and
        args:
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
          - op: '>'
            left:
              op: '+'
              left:
                aggregate:
                  op: sum
                  query:
                    query: mapSpaces
                    filter:
                      condition:
                        op: '>'
                        left:
                          op: '+'
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  op: and
                                  args:
                                    - { prop: faction, op: eq, value: US }
                          right:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  op: and
                                  args:
                                    - { prop: faction, op: eq, value: ARVN }
                        right:
                          op: '+'
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  op: and
                                  args:
                                    - { prop: faction, op: eq, value: NVA }
                          right:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  op: and
                                  args:
                                    - { prop: faction, op: eq, value: VC }
                  bind: $zone
                  valueExpr: { ref: zoneProp, zone: $zone, prop: population }
              right:
                ref: gvar
                var: patronage
            right: 50
    - id: nva-victory
      seat: 'nva'
      timing: duringCoup
      phases: [coupVictory]
      when:
        op: and
        args:
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
          - op: '>'
            left:
              op: '+'
              left:
                aggregate:
                  op: sum
                  query:
                    query: mapSpaces
                    filter:
                      condition:
                        op: '>'
                        left:
                          aggregate:
                            op: count
                            query:
                              query: tokensInZone
                              zone: $zone
                              filter:
                                op: and
                                args:
                                  - { prop: faction, op: eq, value: NVA }
                        right:
                          op: '+'
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  op: and
                                  args:
                                    - { prop: faction, op: eq, value: US }
                          right:
                            op: '+'
                            left:
                              aggregate:
                                op: count
                                query:
                                  query: tokensInZone
                                  zone: $zone
                                  filter:
                                    op: and
                                    args:
                                      - { prop: faction, op: eq, value: ARVN }
                            right:
                              aggregate:
                                op: count
                                query:
                                  query: tokensInZone
                                  zone: $zone
                                  filter:
                                    op: and
                                    args:
                                      - { prop: faction, op: eq, value: VC }
                  bind: $zone
                  valueExpr: { ref: zoneProp, zone: $zone, prop: population }
              right:
                aggregate:
                  op: count
                  query:
                    query: tokensInMapSpaces
                    filter:
                      op: and
                      args:
                        - { prop: faction, op: eq, value: NVA }
                        - { prop: type, op: eq, value: base }
            right: 18
    - id: vc-victory
      seat: 'vc'
      timing: duringCoup
      phases: [coupVictory]
      when:
        op: and
        args:
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
          - op: '>'
            left:
              op: '+'
              left:
                aggregate:
                  op: sum
                  query:
                    query: mapSpaces
                    filter:
                      condition:
                        op: or
                        args:
                          - { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: passiveOpposition }
                          - { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeOpposition }
                  bind: $zone
                  valueExpr:
                    if:
                      when: { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeOpposition }
                      then: { op: '*', left: { ref: zoneProp, zone: $zone, prop: population }, right: 2 }
                      else: { ref: zoneProp, zone: $zone, prop: population }
              right:
                aggregate:
                  op: count
                  query:
                    query: tokensInMapSpaces
                    filter:
                      op: and
                      args:
                        - { prop: faction, op: eq, value: VC }
                        - { prop: type, op: eq, value: base }
            right: 35
    - id: final-coup-ranking
      seat: 'nva'
      timing: finalCoup
      phases: [coupRedeploy, main]
      when:
        op: and
        args:
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
          - op: '=='
            left:
              aggregate:
                op: count
                query:
                  query: tokensInZone
                  zone: lookahead:none
                  filter:
                    op: and
                    args:
                      - { prop: isCoup, op: eq, value: true }
            right: 0
          - op: '=='
            left:
              aggregate:
                op: count
                query:
                  query: tokensInZone
                  zone: deck:none
                  filter:
                    op: and
                    args:
                      - { prop: isCoup, op: eq, value: true }
            right: 0
  margins:
    - seat: 'us'
      value:
        op: '-'
        left:
          op: '+'
          left:
            aggregate:
              op: sum
              query:
                query: mapSpaces
                filter:
                  condition:
                    op: or
                    args:
                      - { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: passiveSupport }
                      - { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeSupport }
              bind: $zone
              valueExpr:
                if:
                  when: { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeSupport }
                  then: { op: '*', left: { ref: zoneProp, zone: $zone, prop: population }, right: 2 }
                  else: { ref: zoneProp, zone: $zone, prop: population }
          right:
            aggregate:
              op: count
              query:
                query: tokensInZone
                zone: available-US:none
                filter:
                  op: and
                  args:
                    - { prop: type, op: in, value: [troops, base] }
        right: 50
    - seat: 'arvn'
      value:
        op: '-'
        left:
          op: '+'
          left:
            aggregate:
              op: sum
              query:
                query: mapSpaces
                filter:
                  condition:
                    op: '>'
                    left:
                      op: '+'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              op: and
                              args:
                                - { prop: faction, op: eq, value: US }
                      right:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              op: and
                              args:
                                - { prop: faction, op: eq, value: ARVN }
                    right:
                      op: '+'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              op: and
                              args:
                                - { prop: faction, op: eq, value: NVA }
                      right:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              op: and
                              args:
                                - { prop: faction, op: eq, value: VC }
              bind: $zone
              valueExpr: { ref: zoneProp, zone: $zone, prop: population }
          right:
            ref: gvar
            var: patronage
        right: 50
    - seat: 'nva'
      value:
        op: '-'
        left:
          op: '+'
          left:
            aggregate:
              op: sum
              query:
                query: mapSpaces
                filter:
                  condition:
                    op: '>'
                    left:
                      aggregate:
                        op: count
                        query:
                          query: tokensInZone
                          zone: $zone
                          filter:
                            op: and
                            args:
                              - { prop: faction, op: eq, value: NVA }
                    right:
                      op: '+'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              op: and
                              args:
                                - { prop: faction, op: eq, value: US }
                      right:
                        op: '+'
                        left:
                          aggregate:
                            op: count
                            query:
                              query: tokensInZone
                              zone: $zone
                              filter:
                                op: and
                                args:
                                  - { prop: faction, op: eq, value: ARVN }
                        right:
                          aggregate:
                            op: count
                            query:
                              query: tokensInZone
                              zone: $zone
                              filter:
                                op: and
                                args:
                                  - { prop: faction, op: eq, value: VC }
              bind: $zone
              valueExpr: { ref: zoneProp, zone: $zone, prop: population }
          right:
            aggregate:
              op: count
              query:
                query: tokensInMapSpaces
                filter:
                  op: and
                  args:
                    - { prop: faction, op: eq, value: NVA }
                    - { prop: type, op: eq, value: base }
        right: 18
    - seat: 'vc'
      value:
        op: '-'
        left:
          op: '+'
          left:
            aggregate:
              op: sum
              query:
                query: mapSpaces
                filter:
                  condition:
                    op: or
                    args:
                      - { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: passiveOpposition }
                      - { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeOpposition }
              bind: $zone
              valueExpr:
                if:
                  when: { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeOpposition }
                  then: { op: '*', left: { ref: zoneProp, zone: $zone, prop: population }, right: 2 }
                  else: { ref: zoneProp, zone: $zone, prop: population }
          right:
            aggregate:
              op: count
              query:
                query: tokensInMapSpaces
                filter:
                  op: and
                  args:
                    - { prop: faction, op: eq, value: VC }
                    - { prop: type, op: eq, value: base }
        right: 35
  ranking:
    order: desc
    tieBreakOrder: ['vc', 'arvn', 'nva', 'us']
  conditions: []

```
