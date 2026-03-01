# Fire in the Lake - Terminal

```yaml
terminal:
  checkpoints:
    - id: us-victory
      seat: 'US'
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
                      - { prop: type, op: in, value: [troops, base] }
            right: 50
    - id: arvn-victory
      seat: 'ARVN'
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
      seat: 'NVA'
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
            right: 18
    - id: vc-victory
      seat: 'VC'
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
                      - { prop: faction, op: eq, value: VC }
                      - { prop: type, op: eq, value: base }
            right: 35
    - id: final-coup-ranking
      seat: 'NVA'
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
    - seat: 'US'
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
                  - { prop: type, op: in, value: [troops, base] }
        right: 50
    - seat: 'ARVN'
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
    - seat: 'NVA'
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
        right: 18
    - seat: 'VC'
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
                  - { prop: faction, op: eq, value: VC }
                  - { prop: type, op: eq, value: base }
        right: 35
  ranking:
    order: desc
    tieBreakOrder: ['VC', 'ARVN', 'NVA', 'US']
  conditions: []

```
