# Fire in the Lake - Terminal

```yaml
terminal:
  checkpoints:
    - id: us-victory
      faction: '0'
      timing: duringCoup
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
                    - { prop: isCoup, op: eq, value: true }
            right: 1
          - op: '>='
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
                  valueExpr: { ref: zoneProp, zone: $zone, prop: population }
              right:
                aggregate:
                  op: count
                  query:
                    query: tokensInZone
                    zone: available-US:none
                    filter:
                      - { prop: type, op: in, value: [troops, base] }
            right: 50
    - id: arvn-victory
      faction: '1'
      timing: duringCoup
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
                    - { prop: isCoup, op: eq, value: true }
            right: 1
          - op: '>='
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
                                  - { prop: faction, op: eq, value: US }
                          right:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
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
                                  - { prop: faction, op: eq, value: NVA }
                          right:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  - { prop: faction, op: eq, value: VC }
                  bind: $zone
                  valueExpr: { ref: zoneProp, zone: $zone, prop: population }
              right:
                ref: gvar
                var: patronage
            right: 50
    - id: nva-victory
      faction: '2'
      timing: duringCoup
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
                    - { prop: isCoup, op: eq, value: true }
            right: 1
          - op: '>='
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
                                    - { prop: faction, op: eq, value: ARVN }
                            right:
                              aggregate:
                                op: count
                                query:
                                  query: tokensInZone
                                  zone: $zone
                                  filter:
                                    - { prop: faction, op: eq, value: VC }
                  bind: $zone
                  valueExpr: { ref: zoneProp, zone: $zone, prop: population }
              right:
                aggregate:
                  op: count
                  query:
                    query: tokensInMapSpaces
                    filter:
                      - { prop: faction, op: eq, value: NVA }
                      - { prop: type, op: eq, value: base }
            right: 25
    - id: vc-victory
      faction: '3'
      timing: duringCoup
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
                    - { prop: isCoup, op: eq, value: true }
            right: 1
          - op: '>='
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
                  valueExpr: { ref: zoneProp, zone: $zone, prop: population }
              right:
                aggregate:
                  op: count
                  query:
                    query: tokensInMapSpaces
                    filter:
                      - { prop: faction, op: eq, value: VC }
                      - { prop: type, op: eq, value: base }
            right: 25
    - id: final-coup-ranking
      faction: '2'
      timing: finalCoup
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
                    - { prop: isCoup, op: eq, value: true }
            right: 1
          - { op: '==', left: { ref: zoneCount, zone: deck:none }, right: 0 }
          - { op: '==', left: { ref: zoneCount, zone: lookahead:none }, right: 0 }
  margins:
    - faction: '0'
      value:
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
            valueExpr: { ref: zoneProp, zone: $zone, prop: population }
        right:
          aggregate:
            op: count
            query:
              query: tokensInZone
              zone: available-US:none
              filter:
                - { prop: type, op: in, value: [troops, base] }
    - faction: '1'
      value:
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
                            - { prop: faction, op: eq, value: US }
                    right:
                      aggregate:
                        op: count
                        query:
                          query: tokensInZone
                          zone: $zone
                          filter:
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
                            - { prop: faction, op: eq, value: NVA }
                    right:
                      aggregate:
                        op: count
                        query:
                          query: tokensInZone
                          zone: $zone
                          filter:
                            - { prop: faction, op: eq, value: VC }
            bind: $zone
            valueExpr: { ref: zoneProp, zone: $zone, prop: population }
        right:
          ref: gvar
          var: patronage
    - faction: '2'
      value:
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
                              - { prop: faction, op: eq, value: ARVN }
                      right:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, op: eq, value: VC }
            bind: $zone
            valueExpr: { ref: zoneProp, zone: $zone, prop: population }
        right:
          aggregate:
            op: count
            query:
              query: tokensInMapSpaces
              filter:
                - { prop: faction, op: eq, value: NVA }
                - { prop: type, op: eq, value: base }
    - faction: '3'
      value:
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
            valueExpr: { ref: zoneProp, zone: $zone, prop: population }
        right:
          aggregate:
            op: count
            query:
              query: tokensInMapSpaces
              filter:
                - { prop: faction, op: eq, value: VC }
                - { prop: type, op: eq, value: base }
  ranking:
    order: desc
    tieBreakOrder: ['2', '3', '1', '0']
  conditions: []

```
