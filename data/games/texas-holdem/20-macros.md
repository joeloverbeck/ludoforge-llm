# Texas Hold'em - Macros

```yaml
effectMacros:
  - id: hand-rank-score
    params:
      - { name: cardsQuery, type: query }
    exports: [$handScore]
    effects:
      - let:
          bind: $maxSuitCount
          value:
            aggregate:
              op: max
              query: { query: intsInRange, min: 0, max: 3 }
              bind: $suit
              valueExpr:
                aggregate:
                  op: sum
                  query: { param: cardsQuery }
                  bind: $card
                  valueExpr:
                    if:
                      when:
                        op: ==
                        left: { ref: tokenProp, token: $card, prop: suit }
                        right: { ref: binding, name: $suit }
                      then: 1
                      else: 0
          in:
            - let:
                bind: $isFlush
                value:
                  if:
                    when: { op: '==', left: { ref: binding, name: $maxSuitCount }, right: 5 }
                    then: true
                    else: false
                in:
                  - let:
                      bind: $maxRankCount
                      value:
                        aggregate:
                          op: max
                          query: { query: intsInRange, min: 2, max: 14 }
                          bind: $rank
                          valueExpr:
                            aggregate:
                              op: sum
                              query: { param: cardsQuery }
                              bind: $card
                              valueExpr:
                                if:
                                  when:
                                    op: ==
                                    left: { ref: tokenProp, token: $card, prop: rank }
                                    right: { ref: binding, name: $rank }
                                  then: 1
                                  else: 0
                      in:
                        - let:
                            bind: $pairCount
                            value:
                              aggregate:
                                op: sum
                                query: { query: intsInRange, min: 2, max: 14 }
                                bind: $rank
                                valueExpr:
                                  if:
                                    when:
                                      op: ==
                                      left:
                                        aggregate:
                                          op: sum
                                          query: { param: cardsQuery }
                                          bind: $card
                                          valueExpr:
                                            if:
                                              when:
                                                op: ==
                                                left: { ref: tokenProp, token: $card, prop: rank }
                                                right: { ref: binding, name: $rank }
                                              then: 1
                                              else: 0
                                      right: 2
                                    then: 1
                                    else: 0
                            in:
                              - let:
                                  bind: $tripCount
                                  value:
                                    aggregate:
                                      op: sum
                                      query: { query: intsInRange, min: 2, max: 14 }
                                      bind: $rank
                                      valueExpr:
                                        if:
                                          when:
                                            op: ==
                                            left:
                                              aggregate:
                                                op: sum
                                                query: { param: cardsQuery }
                                                bind: $card
                                                valueExpr:
                                                  if:
                                                    when:
                                                      op: ==
                                                      left: { ref: tokenProp, token: $card, prop: rank }
                                                      right: { ref: binding, name: $rank }
                                                    then: 1
                                                    else: 0
                                            right: 3
                                          then: 1
                                          else: 0
                                  in:
                                    - let:
                                        bind: $quadCount
                                        value:
                                          aggregate:
                                            op: sum
                                            query: { query: intsInRange, min: 2, max: 14 }
                                            bind: $rank
                                            valueExpr:
                                              if:
                                                when:
                                                  op: ==
                                                  left:
                                                    aggregate:
                                                      op: sum
                                                      query: { param: cardsQuery }
                                                      bind: $card
                                                      valueExpr:
                                                        if:
                                                          when:
                                                            op: ==
                                                            left: { ref: tokenProp, token: $card, prop: rank }
                                                            right: { ref: binding, name: $rank }
                                                          then: 1
                                                          else: 0
                                                  right: 4
                                                then: 1
                                                else: 0
                                        in:
                                          - reduce:
                                              itemBind: $high
                                              accBind: $bestHigh
                                              over: { query: intsInRange, min: 5, max: 14 }
                                              initial: 0
                                              next:
                                                if:
                                                  when:
                                                    op: and
                                                    args:
                                                      - { op: '>', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: { ref: binding, name: $high } }, then: 1, else: 0 } } } }, right: 0 }
                                                      - { op: '>', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: { op: '-', left: { ref: binding, name: $high }, right: 1 } }, then: 1, else: 0 } } } }, right: 0 }
                                                      - { op: '>', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: { op: '-', left: { ref: binding, name: $high }, right: 2 } }, then: 1, else: 0 } } } }, right: 0 }
                                                      - { op: '>', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: { op: '-', left: { ref: binding, name: $high }, right: 3 } }, then: 1, else: 0 } } } }, right: 0 }
                                                      - { op: '>', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: { op: '-', left: { ref: binding, name: $high }, right: 4 } }, then: 1, else: 0 } } } }, right: 0 }
                                                  then:
                                                    if:
                                                      when: { op: '>', left: { ref: binding, name: $high }, right: { ref: binding, name: $bestHigh } }
                                                      then: { ref: binding, name: $high }
                                                      else: { ref: binding, name: $bestHigh }
                                                  else: { ref: binding, name: $bestHigh }
                                              resultBind: $straightHigh
                                              in:
                                                - let:
                                                    bind: $wheelStraight
                                                    value:
                                                      if:
                                                        when:
                                                          op: and
                                                          args:
                                                            - { op: '>', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: 14 }, then: 1, else: 0 } } } }, right: 0 }
                                                            - { op: '>', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: 5 }, then: 1, else: 0 } } } }, right: 0 }
                                                            - { op: '>', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: 4 }, then: 1, else: 0 } } } }, right: 0 }
                                                            - { op: '>', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: 3 }, then: 1, else: 0 } } } }, right: 0 }
                                                            - { op: '>', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: 2 }, then: 1, else: 0 } } } }, right: 0 }
                                                        then: true
                                                        else: false
                                                    in:
                                                      - let:
                                                          bind: $straightHighAdj
                                                          value:
                                                            if:
                                                              when:
                                                                op: and
                                                                args:
                                                                  - { op: '==', left: { ref: binding, name: $straightHigh }, right: 0 }
                                                                  - { op: '==', left: { ref: binding, name: $wheelStraight }, right: true }
                                                              then: 5
                                                              else: { ref: binding, name: $straightHigh }
                                                          in:
                                                            - let:
                                                                bind: $quadRank
                                                                value:
                                                                  aggregate:
                                                                    op: max
                                                                    query: { query: intsInRange, min: 2, max: 14 }
                                                                    bind: $rank
                                                                    valueExpr:
                                                                      if:
                                                                        when:
                                                                          op: ==
                                                                          left:
                                                                            aggregate:
                                                                              op: sum
                                                                              query: { param: cardsQuery }
                                                                              bind: $card
                                                                              valueExpr:
                                                                                if:
                                                                                  when:
                                                                                    op: ==
                                                                                    left: { ref: tokenProp, token: $card, prop: rank }
                                                                                    right: { ref: binding, name: $rank }
                                                                                  then: 1
                                                                                  else: 0
                                                                          right: 4
                                                                        then: { ref: binding, name: $rank }
                                                                        else: 0
                                                                in:
                                                                  - let:
                                                                      bind: $tripRank
                                                                      value:
                                                                        aggregate:
                                                                          op: max
                                                                          query: { query: intsInRange, min: 2, max: 14 }
                                                                          bind: $rank
                                                                          valueExpr:
                                                                            if:
                                                                              when:
                                                                                op: ==
                                                                                left:
                                                                                  aggregate:
                                                                                    op: sum
                                                                                    query: { param: cardsQuery }
                                                                                    bind: $card
                                                                                    valueExpr:
                                                                                      if:
                                                                                        when:
                                                                                          op: ==
                                                                                          left: { ref: tokenProp, token: $card, prop: rank }
                                                                                          right: { ref: binding, name: $rank }
                                                                                        then: 1
                                                                                        else: 0
                                                                                right: 3
                                                                              then: { ref: binding, name: $rank }
                                                                              else: 0
                                                                      in:
                                                                        - let:
                                                                            bind: $pairHigh
                                                                            value:
                                                                              aggregate:
                                                                                op: max
                                                                                query: { query: intsInRange, min: 2, max: 14 }
                                                                                bind: $rank
                                                                                valueExpr:
                                                                                  if:
                                                                                    when:
                                                                                      op: ==
                                                                                      left:
                                                                                        aggregate:
                                                                                          op: sum
                                                                                          query: { param: cardsQuery }
                                                                                          bind: $card
                                                                                          valueExpr:
                                                                                            if:
                                                                                              when:
                                                                                                op: ==
                                                                                                left: { ref: tokenProp, token: $card, prop: rank }
                                                                                                right: { ref: binding, name: $rank }
                                                                                              then: 1
                                                                                              else: 0
                                                                                      right: 2
                                                                                    then: { ref: binding, name: $rank }
                                                                                    else: 0
                                                                            in:
                                                                              - let:
                                                                                  bind: $pairLow
                                                                                  value:
                                                                                    aggregate:
                                                                                      op: max
                                                                                      query: { query: intsInRange, min: 2, max: 14 }
                                                                                      bind: $rank
                                                                                      valueExpr:
                                                                                        if:
                                                                                          when:
                                                                                            op: and
                                                                                            args:
                                                                                              - { op: '==', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: { ref: binding, name: $rank } }, then: 1, else: 0 } } } }, right: 2 }
                                                                                              - { op: '<', left: { ref: binding, name: $rank }, right: { ref: binding, name: $pairHigh } }
                                                                                          then: { ref: binding, name: $rank }
                                                                                          else: 0
                                                                                  in:
                                                                                    - let:
                                                                                        bind: $single1
                                                                                        value:
                                                                                          aggregate:
                                                                                            op: max
                                                                                            query: { query: intsInRange, min: 2, max: 14 }
                                                                                            bind: $rank
                                                                                            valueExpr:
                                                                                              if:
                                                                                                when: { op: '==', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: { ref: binding, name: $rank } }, then: 1, else: 0 } } } }, right: 1 }
                                                                                                then: { ref: binding, name: $rank }
                                                                                                else: 0
                                                                                        in:
                                                                                          - let:
                                                                                              bind: $single2
                                                                                              value:
                                                                                                aggregate:
                                                                                                  op: max
                                                                                                  query: { query: intsInRange, min: 2, max: 14 }
                                                                                                  bind: $rank
                                                                                                  valueExpr:
                                                                                                    if:
                                                                                                      when:
                                                                                                        op: and
                                                                                                        args:
                                                                                                          - { op: '==', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: { ref: binding, name: $rank } }, then: 1, else: 0 } } } }, right: 1 }
                                                                                                          - { op: '<', left: { ref: binding, name: $rank }, right: { ref: binding, name: $single1 } }
                                                                                                      then: { ref: binding, name: $rank }
                                                                                                      else: 0
                                                                                              in:
                                                                                                - let:
                                                                                                    bind: $single3
                                                                                                    value:
                                                                                                      aggregate:
                                                                                                        op: max
                                                                                                        query: { query: intsInRange, min: 2, max: 14 }
                                                                                                        bind: $rank
                                                                                                        valueExpr:
                                                                                                          if:
                                                                                                            when:
                                                                                                              op: and
                                                                                                              args:
                                                                                                                - { op: '==', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: { ref: binding, name: $rank } }, then: 1, else: 0 } } } }, right: 1 }
                                                                                                                - { op: '<', left: { ref: binding, name: $rank }, right: { ref: binding, name: $single2 } }
                                                                                                            then: { ref: binding, name: $rank }
                                                                                                            else: 0
                                                                                                    in:
                                                                                                      - let:
                                                                                                          bind: $single4
                                                                                                          value:
                                                                                                            aggregate:
                                                                                                              op: max
                                                                                                              query: { query: intsInRange, min: 2, max: 14 }
                                                                                                              bind: $rank
                                                                                                              valueExpr:
                                                                                                                if:
                                                                                                                  when:
                                                                                                                    op: and
                                                                                                                    args:
                                                                                                                      - { op: '==', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: { ref: binding, name: $rank } }, then: 1, else: 0 } } } }, right: 1 }
                                                                                                                      - { op: '<', left: { ref: binding, name: $rank }, right: { ref: binding, name: $single3 } }
                                                                                                                  then: { ref: binding, name: $rank }
                                                                                                                  else: 0
                                                                                                          in:
                                                                                                            - let:
                                                                                                                bind: $single5
                                                                                                                value:
                                                                                                                  aggregate:
                                                                                                                    op: max
                                                                                                                    query: { query: intsInRange, min: 2, max: 14 }
                                                                                                                    bind: $rank
                                                                                                                    valueExpr:
                                                                                                                      if:
                                                                                                                        when:
                                                                                                                          op: and
                                                                                                                          args:
                                                                                                                            - { op: '==', left: { aggregate: { op: sum, query: { param: cardsQuery }, bind: $card, valueExpr: { if: { when: { op: '==', left: { ref: tokenProp, token: $card, prop: rank }, right: { ref: binding, name: $rank } }, then: 1, else: 0 } } } }, right: 1 }
                                                                                                                            - { op: '<', left: { ref: binding, name: $rank }, right: { ref: binding, name: $single4 } }
                                                                                                                        then: { ref: binding, name: $rank }
                                                                                                                        else: 0
                                                                                                                in:
                                                                                                                  - let:
                                                                                                                      bind: $handType
                                                                                                                      value:
                                                                                                                        if:
                                                                                                                          when: { op: and, args: [{ op: '==', left: { ref: binding, name: $isFlush }, right: true }, { op: '>', left: { ref: binding, name: $straightHighAdj }, right: 0 }] }
                                                                                                                          then: 9
                                                                                                                          else:
                                                                                                                            if:
                                                                                                                              when: { op: '==', left: { ref: binding, name: $quadCount }, right: 1 }
                                                                                                                              then: 8
                                                                                                                              else:
                                                                                                                                if:
                                                                                                                                  when: { op: and, args: [{ op: '==', left: { ref: binding, name: $tripCount }, right: 1 }, { op: '==', left: { ref: binding, name: $pairCount }, right: 1 }] }
                                                                                                                                  then: 7
                                                                                                                                  else:
                                                                                                                                    if:
                                                                                                                                      when: { op: '==', left: { ref: binding, name: $isFlush }, right: true }
                                                                                                                                      then: 6
                                                                                                                                      else:
                                                                                                                                        if:
                                                                                                                                          when: { op: '>', left: { ref: binding, name: $straightHighAdj }, right: 0 }
                                                                                                                                          then: 5
                                                                                                                                          else:
                                                                                                                                            if:
                                                                                                                                              when: { op: '==', left: { ref: binding, name: $tripCount }, right: 1 }
                                                                                                                                              then: 4
                                                                                                                                              else:
                                                                                                                                                if:
                                                                                                                                                  when: { op: '==', left: { ref: binding, name: $pairCount }, right: 2 }
                                                                                                                                                  then: 3
                                                                                                                                                  else:
                                                                                                                                                    if:
                                                                                                                                                      when: { op: '==', left: { ref: binding, name: $pairCount }, right: 1 }
                                                                                                                                                      then: 2
                                                                                                                                                      else: 1
                                                                                                                      in:
                                                                                                                        - let:
                                                                                                                            bind: $c1
                                                                                                                            value:
                                                                                                                              if:
                                                                                                                                when: { op: '==', left: { ref: binding, name: $handType }, right: 9 }
                                                                                                                                then: { ref: binding, name: $straightHighAdj }
                                                                                                                                else:
                                                                                                                                  if:
                                                                                                                                    when: { op: '==', left: { ref: binding, name: $handType }, right: 8 }
                                                                                                                                    then: { ref: binding, name: $quadRank }
                                                                                                                                    else:
                                                                                                                                      if:
                                                                                                                                        when: { op: '==', left: { ref: binding, name: $handType }, right: 7 }
                                                                                                                                        then: { ref: binding, name: $tripRank }
                                                                                                                                        else:
                                                                                                                                          if:
                                                                                                                                            when: { op: '==', left: { ref: binding, name: $handType }, right: 6 }
                                                                                                                                            then: { ref: binding, name: $single1 }
                                                                                                                                            else:
                                                                                                                                              if:
                                                                                                                                                when: { op: '==', left: { ref: binding, name: $handType }, right: 5 }
                                                                                                                                                then: { ref: binding, name: $straightHighAdj }
                                                                                                                                                else:
                                                                                                                                                  if:
                                                                                                                                                    when: { op: '==', left: { ref: binding, name: $handType }, right: 4 }
                                                                                                                                                    then: { ref: binding, name: $tripRank }
                                                                                                                                                    else:
                                                                                                                                                      if:
                                                                                                                                                        when: { op: '==', left: { ref: binding, name: $handType }, right: 3 }
                                                                                                                                                        then: { ref: binding, name: $pairHigh }
                                                                                                                                                        else:
                                                                                                                                                          if:
                                                                                                                                                            when: { op: '==', left: { ref: binding, name: $handType }, right: 2 }
                                                                                                                                                            then: { ref: binding, name: $pairHigh }
                                                                                                                                                            else: { ref: binding, name: $single1 }
                                                                                                                            in:
                                                                                                                              - let:
                                                                                                                                  bind: $c2
                                                                                                                                  value:
                                                                                                                                    if:
                                                                                                                                      when: { op: '==', left: { ref: binding, name: $handType }, right: 8 }
                                                                                                                                      then: { ref: binding, name: $single1 }
                                                                                                                                      else:
                                                                                                                                        if:
                                                                                                                                          when: { op: '==', left: { ref: binding, name: $handType }, right: 7 }
                                                                                                                                          then: { ref: binding, name: $pairHigh }
                                                                                                                                          else:
                                                                                                                                            if:
                                                                                                                                              when: { op: '==', left: { ref: binding, name: $handType }, right: 6 }
                                                                                                                                              then: { ref: binding, name: $single2 }
                                                                                                                                              else:
                                                                                                                                                if:
                                                                                                                                                  when: { op: '==', left: { ref: binding, name: $handType }, right: 4 }
                                                                                                                                                  then: { ref: binding, name: $single1 }
                                                                                                                                                  else:
                                                                                                                                                    if:
                                                                                                                                                      when: { op: '==', left: { ref: binding, name: $handType }, right: 3 }
                                                                                                                                                      then: { ref: binding, name: $pairLow }
                                                                                                                                                      else:
                                                                                                                                                        if:
                                                                                                                                                          when: { op: '==', left: { ref: binding, name: $handType }, right: 2 }
                                                                                                                                                          then: { ref: binding, name: $single1 }
                                                                                                                                                          else:
                                                                                                                                                            if:
                                                                                                                                                              when: { op: '==', left: { ref: binding, name: $handType }, right: 1 }
                                                                                                                                                              then: { ref: binding, name: $single2 }
                                                                                                                                                              else: 0
                                                                                                                                  in:
                                                                                                                                    - let:
                                                                                                                                        bind: $c3
                                                                                                                                        value:
                                                                                                                                          if:
                                                                                                                                            when: { op: '==', left: { ref: binding, name: $handType }, right: 6 }
                                                                                                                                            then: { ref: binding, name: $single3 }
                                                                                                                                            else:
                                                                                                                                              if:
                                                                                                                                                when: { op: '==', left: { ref: binding, name: $handType }, right: 4 }
                                                                                                                                                then: { ref: binding, name: $single2 }
                                                                                                                                                else:
                                                                                                                                                  if:
                                                                                                                                                    when: { op: '==', left: { ref: binding, name: $handType }, right: 3 }
                                                                                                                                                    then: { ref: binding, name: $single1 }
                                                                                                                                                    else:
                                                                                                                                                      if:
                                                                                                                                                        when: { op: '==', left: { ref: binding, name: $handType }, right: 2 }
                                                                                                                                                        then: { ref: binding, name: $single2 }
                                                                                                                                                        else:
                                                                                                                                                          if:
                                                                                                                                                            when: { op: '==', left: { ref: binding, name: $handType }, right: 1 }
                                                                                                                                                            then: { ref: binding, name: $single3 }
                                                                                                                                                            else: 0
                                                                                                                                        in:
                                                                                                                                          - let:
                                                                                                                                              bind: $c4
                                                                                                                                              value:
                                                                                                                                                if:
                                                                                                                                                  when: { op: '==', left: { ref: binding, name: $handType }, right: 6 }
                                                                                                                                                  then: { ref: binding, name: $single4 }
                                                                                                                                                  else:
                                                                                                                                                    if:
                                                                                                                                                      when: { op: '==', left: { ref: binding, name: $handType }, right: 2 }
                                                                                                                                                      then: { ref: binding, name: $single3 }
                                                                                                                                                      else:
                                                                                                                                                        if:
                                                                                                                                                          when: { op: '==', left: { ref: binding, name: $handType }, right: 1 }
                                                                                                                                                          then: { ref: binding, name: $single4 }
                                                                                                                                                          else: 0
                                                                                                                                              in:
                                                                                                                                                - let:
                                                                                                                                                    bind: $c5
                                                                                                                                                    value:
                                                                                                                                                      if:
                                                                                                                                                        when: { op: '==', left: { ref: binding, name: $handType }, right: 6 }
                                                                                                                                                        then: { ref: binding, name: $single5 }
                                                                                                                                                        else:
                                                                                                                                                          if:
                                                                                                                                                            when: { op: '==', left: { ref: binding, name: $handType }, right: 2 }
                                                                                                                                                            then: { ref: binding, name: $single4 }
                                                                                                                                                            else:
                                                                                                                                                              if:
                                                                                                                                                                when: { op: '==', left: { ref: binding, name: $handType }, right: 1 }
                                                                                                                                                                then: { ref: binding, name: $single5 }
                                                                                                                                                                else: 0
                                                                                                                                                    in:
                                                                                                                                                      - bindValue:
                                                                                                                                                          bind: $handScore
                                                                                                                                                          value:
                                                                                                                                                            op: '+'
                                                                                                                                                            left:
                                                                                                                                                              op: '*'
                                                                                                                                                              left: { ref: binding, name: $handType }
                                                                                                                                                              right: 10000000000
                                                                                                                                                            right:
                                                                                                                                                              op: '+'
                                                                                                                                                              left:
                                                                                                                                                                op: '*'
                                                                                                                                                                left: { ref: binding, name: $c1 }
                                                                                                                                                                right: 100000000
                                                                                                                                                              right:
                                                                                                                                                                op: '+'
                                                                                                                                                                left:
                                                                                                                                                                  op: '*'
                                                                                                                                                                  left: { ref: binding, name: $c2 }
                                                                                                                                                                  right: 1000000
                                                                                                                                                                right:
                                                                                                                                                                  op: '+'
                                                                                                                                                                  left:
                                                                                                                                                                    op: '*'
                                                                                                                                                                    left: { ref: binding, name: $c3 }
                                                                                                                                                                    right: 10000
                                                                                                                                                                  right:
                                                                                                                                                                    op: '+'
                                                                                                                                                                    left:
                                                                                                                                                                      op: '*'
                                                                                                                                                                      left: { ref: binding, name: $c4 }
                                                                                                                                                                      right: 100
                                                                                                                                                                    right: { ref: binding, name: $c5 }

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

  - id: find-next-non-eliminated
    params:
      - { name: fromSeat, type: value }
    exports: []
    effects:
      - reduce:
          itemBind: $offset
          accBind: $nextFound
          over:
            query: intsInRange
            min: 1
            max: { aggregate: { op: count, query: { query: players } } }
          initial: -1
          next:
            if:
              when: { op: '!=', left: { ref: binding, name: $nextFound }, right: -1 }
              then: { ref: binding, name: $nextFound }
              else:
                if:
                  when:
                    op: '>'
                    left:
                      aggregate:
                        op: sum
                        query: { query: players }
                        bind: $player
                        valueExpr:
                          if:
                            when:
                              op: and
                              args:
                                - op: '=='
                                  left: { ref: binding, name: $player }
                                  right:
                                    if:
                                      when:
                                        op: '>='
                                        left: { op: '+', left: { param: fromSeat }, right: { ref: binding, name: $offset } }
                                        right: { aggregate: { op: count, query: { query: players } } }
                                      then:
                                        op: '-'
                                        left: { op: '+', left: { param: fromSeat }, right: { ref: binding, name: $offset } }
                                        right: { aggregate: { op: count, query: { query: players } } }
                                      else: { op: '+', left: { param: fromSeat }, right: { ref: binding, name: $offset } }
                                - op: '=='
                                  left: { ref: pvar, player: { chosen: '$player' }, var: eliminated }
                                  right: false
                            then: 1
                            else: 0
                    right: 0
                  then:
                    if:
                      when:
                        op: '>='
                        left: { op: '+', left: { param: fromSeat }, right: { ref: binding, name: $offset } }
                        right: { aggregate: { op: count, query: { query: players } } }
                      then:
                        op: '-'
                        left: { op: '+', left: { param: fromSeat }, right: { ref: binding, name: $offset } }
                        right: { aggregate: { op: count, query: { query: players } } }
                      else: { op: '+', left: { param: fromSeat }, right: { ref: binding, name: $offset } }
                  else: -1
          resultBind: $nextSeat
          in:
            - if:
                when: { op: '!=', left: { ref: binding, name: $nextSeat }, right: -1 }
                then:
                  - setVar: { scope: global, var: dealerSeat, value: { ref: binding, name: $nextSeat } }

  - id: find-next-to-act
    params:
      - { name: fromSeat, type: value }
    exports: []
    effects:
      - reduce:
          itemBind: $offset
          accBind: $nextFound
          over:
            query: intsInRange
            min: 1
            max: { aggregate: { op: count, query: { query: players } } }
          initial: -1
          next:
            if:
              when: { op: '!=', left: { ref: binding, name: $nextFound }, right: -1 }
              then: { ref: binding, name: $nextFound }
              else:
                if:
                  when:
                    op: '>'
                    left:
                      aggregate:
                        op: sum
                        query: { query: players }
                        bind: $player
                        valueExpr:
                          if:
                            when:
                              op: and
                              args:
                                - op: '=='
                                  left: { ref: binding, name: $player }
                                  right:
                                    if:
                                      when:
                                        op: '>='
                                        left: { op: '+', left: { param: fromSeat }, right: { ref: binding, name: $offset } }
                                        right: { aggregate: { op: count, query: { query: players } } }
                                      then:
                                        op: '-'
                                        left: { op: '+', left: { param: fromSeat }, right: { ref: binding, name: $offset } }
                                        right: { aggregate: { op: count, query: { query: players } } }
                                      else: { op: '+', left: { param: fromSeat }, right: { ref: binding, name: $offset } }
                                - op: '=='
                                  left: { ref: pvar, player: { chosen: '$player' }, var: eliminated }
                                  right: false
                                - op: '=='
                                  left: { ref: pvar, player: { chosen: '$player' }, var: handActive }
                                  right: true
                                - op: '=='
                                  left: { ref: pvar, player: { chosen: '$player' }, var: allIn }
                                  right: false
                            then: 1
                            else: 0
                    right: 0
                  then:
                    if:
                      when:
                        op: '>='
                        left: { op: '+', left: { param: fromSeat }, right: { ref: binding, name: $offset } }
                        right: { aggregate: { op: count, query: { query: players } } }
                      then:
                        op: '-'
                        left: { op: '+', left: { param: fromSeat }, right: { ref: binding, name: $offset } }
                        right: { aggregate: { op: count, query: { query: players } } }
                      else: { op: '+', left: { param: fromSeat }, right: { ref: binding, name: $offset } }
                  else: -1
          resultBind: $nextSeat
          in:
            - if:
                when: { op: '==', left: { ref: binding, name: $nextSeat }, right: -1 }
                then:
                  - setVar: { scope: global, var: bettingClosed, value: true }
                else:
                  - setVar: { scope: global, var: actingPosition, value: { ref: binding, name: $nextSeat } }
                  - setActivePlayer: { player: { chosen: '$nextSeat' } }

  - id: post-forced-bets-and-set-preflop-actor
    params: []
    exports: []
    effects:
      - if:
          when: { op: '==', left: { ref: gvar, var: activePlayers }, right: 2 }
          then:
            - reduce:
                itemBind: $offset
                accBind: $nextFound
                over:
                  query: intsInRange
                  min: 1
                  max: { aggregate: { op: count, query: { query: players } } }
                initial: -1
                next:
                  if:
                    when: { op: '!=', left: { ref: binding, name: $nextFound }, right: -1 }
                    then: { ref: binding, name: $nextFound }
                    else:
                      if:
                        when:
                          op: '>'
                          left:
                            aggregate:
                              op: sum
                              query: { query: players }
                              bind: $player
                              valueExpr:
                                if:
                                  when:
                                    op: and
                                    args:
                                      - op: '=='
                                        left: { ref: binding, name: $player }
                                        right:
                                          if:
                                            when:
                                              op: '>='
                                              left: { op: '+', left: { ref: gvar, var: dealerSeat }, right: { ref: binding, name: $offset } }
                                              right: { aggregate: { op: count, query: { query: players } } }
                                            then:
                                              op: '-'
                                              left: { op: '+', left: { ref: gvar, var: dealerSeat }, right: { ref: binding, name: $offset } }
                                              right: { aggregate: { op: count, query: { query: players } } }
                                            else: { op: '+', left: { ref: gvar, var: dealerSeat }, right: { ref: binding, name: $offset } }
                                      - op: '=='
                                        left: { ref: pvar, player: { chosen: '$player' }, var: eliminated }
                                        right: false
                                  then: 1
                                  else: 0
                          right: 0
                        then:
                          if:
                            when:
                              op: '>='
                              left: { op: '+', left: { ref: gvar, var: dealerSeat }, right: { ref: binding, name: $offset } }
                              right: { aggregate: { op: count, query: { query: players } } }
                            then:
                              op: '-'
                              left: { op: '+', left: { ref: gvar, var: dealerSeat }, right: { ref: binding, name: $offset } }
                              right: { aggregate: { op: count, query: { query: players } } }
                            else: { op: '+', left: { ref: gvar, var: dealerSeat }, right: { ref: binding, name: $offset } }
                        else: -1
                resultBind: $bbSeat
                in:
                  - let:
                      bind: $dealerSeatBinding
                      value: { ref: gvar, var: dealerSeat }
                      in:
                        - macro: collect-forced-bets
                          args:
                            sbPlayer: { chosen: '$dealerSeatBinding' }
                            bbPlayer: { chosen: '$bbSeat' }
                        - setVar: { scope: global, var: actingPosition, value: { ref: binding, name: $dealerSeatBinding } }
                        - setActivePlayer: { player: { chosen: '$dealerSeatBinding' } }
          else:
            - reduce:
                itemBind: $offset
                accBind: $nextFound
                over:
                  query: intsInRange
                  min: 1
                  max: { aggregate: { op: count, query: { query: players } } }
                initial: -1
                next:
                  if:
                    when: { op: '!=', left: { ref: binding, name: $nextFound }, right: -1 }
                    then: { ref: binding, name: $nextFound }
                    else:
                      if:
                        when:
                          op: '>'
                          left:
                            aggregate:
                              op: sum
                              query: { query: players }
                              bind: $player
                              valueExpr:
                                if:
                                  when:
                                    op: and
                                    args:
                                      - op: '=='
                                        left: { ref: binding, name: $player }
                                        right:
                                          if:
                                            when:
                                              op: '>='
                                              left: { op: '+', left: { ref: gvar, var: dealerSeat }, right: { ref: binding, name: $offset } }
                                              right: { aggregate: { op: count, query: { query: players } } }
                                            then:
                                              op: '-'
                                              left: { op: '+', left: { ref: gvar, var: dealerSeat }, right: { ref: binding, name: $offset } }
                                              right: { aggregate: { op: count, query: { query: players } } }
                                            else: { op: '+', left: { ref: gvar, var: dealerSeat }, right: { ref: binding, name: $offset } }
                                      - op: '=='
                                        left: { ref: pvar, player: { chosen: '$player' }, var: eliminated }
                                        right: false
                                  then: 1
                                  else: 0
                          right: 0
                        then:
                          if:
                            when:
                              op: '>='
                              left: { op: '+', left: { ref: gvar, var: dealerSeat }, right: { ref: binding, name: $offset } }
                              right: { aggregate: { op: count, query: { query: players } } }
                            then:
                              op: '-'
                              left: { op: '+', left: { ref: gvar, var: dealerSeat }, right: { ref: binding, name: $offset } }
                              right: { aggregate: { op: count, query: { query: players } } }
                            else: { op: '+', left: { ref: gvar, var: dealerSeat }, right: { ref: binding, name: $offset } }
                        else: -1
                resultBind: $sbSeat
                in:
                  - reduce:
                      itemBind: $offset
                      accBind: $nextFound
                      over:
                        query: intsInRange
                        min: 1
                        max: { aggregate: { op: count, query: { query: players } } }
                      initial: -1
                      next:
                        if:
                          when: { op: '!=', left: { ref: binding, name: $nextFound }, right: -1 }
                          then: { ref: binding, name: $nextFound }
                          else:
                            if:
                              when:
                                op: '>'
                                left:
                                  aggregate:
                                    op: sum
                                    query: { query: players }
                                    bind: $player
                                    valueExpr:
                                      if:
                                        when:
                                          op: and
                                          args:
                                            - op: '=='
                                              left: { ref: binding, name: $player }
                                              right:
                                                if:
                                                  when:
                                                    op: '>='
                                                    left: { op: '+', left: { ref: binding, name: $sbSeat }, right: { ref: binding, name: $offset } }
                                                    right: { aggregate: { op: count, query: { query: players } } }
                                                  then:
                                                    op: '-'
                                                    left: { op: '+', left: { ref: binding, name: $sbSeat }, right: { ref: binding, name: $offset } }
                                                    right: { aggregate: { op: count, query: { query: players } } }
                                                  else: { op: '+', left: { ref: binding, name: $sbSeat }, right: { ref: binding, name: $offset } }
                                            - op: '=='
                                              left: { ref: pvar, player: { chosen: '$player' }, var: eliminated }
                                              right: false
                                        then: 1
                                        else: 0
                                right: 0
                              then:
                                if:
                                  when:
                                    op: '>='
                                    left: { op: '+', left: { ref: binding, name: $sbSeat }, right: { ref: binding, name: $offset } }
                                    right: { aggregate: { op: count, query: { query: players } } }
                                  then:
                                    op: '-'
                                    left: { op: '+', left: { ref: binding, name: $sbSeat }, right: { ref: binding, name: $offset } }
                                    right: { aggregate: { op: count, query: { query: players } } }
                                  else: { op: '+', left: { ref: binding, name: $sbSeat }, right: { ref: binding, name: $offset } }
                              else: -1
                      resultBind: $bbSeat
                      in:
                        - reduce:
                            itemBind: $offset
                            accBind: $nextFound
                            over:
                              query: intsInRange
                              min: 1
                              max: { aggregate: { op: count, query: { query: players } } }
                            initial: -1
                            next:
                              if:
                                when: { op: '!=', left: { ref: binding, name: $nextFound }, right: -1 }
                                then: { ref: binding, name: $nextFound }
                                else:
                                  if:
                                    when:
                                      op: '>'
                                      left:
                                        aggregate:
                                          op: sum
                                          query: { query: players }
                                          bind: $player
                                          valueExpr:
                                            if:
                                              when:
                                                op: and
                                                args:
                                                  - op: '=='
                                                    left: { ref: binding, name: $player }
                                                    right:
                                                      if:
                                                        when:
                                                          op: '>='
                                                          left: { op: '+', left: { ref: binding, name: $bbSeat }, right: { ref: binding, name: $offset } }
                                                          right: { aggregate: { op: count, query: { query: players } } }
                                                        then:
                                                          op: '-'
                                                          left: { op: '+', left: { ref: binding, name: $bbSeat }, right: { ref: binding, name: $offset } }
                                                          right: { aggregate: { op: count, query: { query: players } } }
                                                        else: { op: '+', left: { ref: binding, name: $bbSeat }, right: { ref: binding, name: $offset } }
                                                  - op: '=='
                                                    left: { ref: pvar, player: { chosen: '$player' }, var: eliminated }
                                                    right: false
                                              then: 1
                                              else: 0
                                      right: 0
                                    then:
                                      if:
                                        when:
                                          op: '>='
                                          left: { op: '+', left: { ref: binding, name: $bbSeat }, right: { ref: binding, name: $offset } }
                                          right: { aggregate: { op: count, query: { query: players } } }
                                        then:
                                          op: '-'
                                          left: { op: '+', left: { ref: binding, name: $bbSeat }, right: { ref: binding, name: $offset } }
                                          right: { aggregate: { op: count, query: { query: players } } }
                                        else: { op: '+', left: { ref: binding, name: $bbSeat }, right: { ref: binding, name: $offset } }
                                    else: -1
                            resultBind: $utgSeat
                            in:
                              - macro: collect-forced-bets
                                args:
                                  sbPlayer: { chosen: '$sbSeat' }
                                  bbPlayer: { chosen: '$bbSeat' }
                              - setVar: { scope: global, var: actingPosition, value: { ref: binding, name: $utgSeat } }
                              - setActivePlayer: { player: { chosen: '$utgSeat' } }

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

  - id: advance-after-betting
    params: []
    exports: []
    effects:
      - if:
          when: { op: '==', left: { ref: gvar, var: bettingClosed }, right: false }
          then:
            - macro: find-next-to-act
              args:
                fromSeat: { ref: gvar, var: actingPosition }
      - if:
          when: { op: '<=', left: { ref: gvar, var: playersInHand }, right: 1 }
          then:
            - gotoPhaseExact: { phase: showdown }
      - if:
          when:
            op: and
            args:
              - { op: '==', left: { ref: gvar, var: bettingClosed }, right: true }
              - { op: '>', left: { ref: gvar, var: playersInHand }, right: 1 }
          then:
            - if:
                when: { op: '==', left: { ref: gvar, var: handPhase }, right: 0 }
                then:
                  - gotoPhaseExact: { phase: flop }
            - if:
                when: { op: '==', left: { ref: gvar, var: handPhase }, right: 1 }
                then:
                  - gotoPhaseExact: { phase: turn }
            - if:
                when: { op: '==', left: { ref: gvar, var: handPhase }, right: 2 }
                then:
                  - gotoPhaseExact: { phase: river }
            - if:
                when: { op: '==', left: { ref: gvar, var: handPhase }, right: 3 }
                then:
                  - gotoPhaseExact: { phase: showdown }

  - id: side-pot-distribution
    params: []
    exports: []
    effects:
      - forEach:
          bind: $tier
          over: { query: intsInRange, min: 1, max: { ref: gvar, var: activePlayers } }
          effects:
            - let:
                bind: $minContribution
                value:
                  aggregate:
                    op: min
                    query: { query: players }
                    bind: $player
                    valueExpr:
                      if:
                        when: { op: '>', left: { ref: pvar, player: { chosen: $player }, var: totalBet }, right: 0 }
                        then: { ref: pvar, player: { chosen: $player }, var: totalBet }
                        else: 1000000000
                in:
                  - if:
                      when: { op: '<', left: { ref: binding, name: $minContribution }, right: 1000000000 }
                      then:
                        - let:
                            bind: $contributors
                            value:
                              aggregate:
                                op: sum
                                query: { query: players }
                                bind: $player
                                valueExpr:
                                  if:
                                    when: { op: '>', left: { ref: pvar, player: { chosen: $player }, var: totalBet }, right: 0 }
                                    then: 1
                                    else: 0
                            in:
                              - let:
                                  bind: $layerAmount
                                  value:
                                    op: '*'
                                    left: { ref: binding, name: $minContribution }
                                    right: { ref: binding, name: $contributors }
                                  in:
                                    - let:
                                        bind: $bestScore
                                        value:
                                          aggregate:
                                            op: max
                                            query: { query: players }
                                            bind: $player
                                            valueExpr:
                                              if:
                                                when:
                                                  op: and
                                                  args:
                                                    - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: handActive }, right: true }
                                                    - { op: '>', left: { ref: pvar, player: { chosen: $player }, var: totalBet }, right: 0 }
                                                then: { ref: pvar, player: { chosen: $player }, var: showdownScore }
                                                else: -1
                                        in:
                                          - let:
                                              bind: $winnerCount
                                              value:
                                                aggregate:
                                                  op: sum
                                                  query: { query: players }
                                                  bind: $player
                                                  valueExpr:
                                                    if:
                                                      when:
                                                        op: and
                                                        args:
                                                          - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: handActive }, right: true }
                                                          - { op: '>', left: { ref: pvar, player: { chosen: $player }, var: totalBet }, right: 0 }
                                                          - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: showdownScore }, right: { ref: binding, name: $bestScore } }
                                                      then: 1
                                                      else: 0
                                              in:
                                                - if:
                                                    when: { op: '>', left: { ref: binding, name: $winnerCount }, right: 0 }
                                                    then:
                                                      - let:
                                                          bind: $baseShare
                                                          value:
                                                            op: floorDiv
                                                            left: { ref: binding, name: $layerAmount }
                                                            right: { ref: binding, name: $winnerCount }
                                                          in:
                                                            - forEach:
                                                                bind: $player
                                                                over: { query: players }
                                                                effects:
                                                                  - if:
                                                                      when:
                                                                        op: and
                                                                        args:
                                                                          - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: handActive }, right: true }
                                                                          - { op: '>', left: { ref: pvar, player: { chosen: $player }, var: totalBet }, right: 0 }
                                                                          - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: showdownScore }, right: { ref: binding, name: $bestScore } }
                                                                      then:
                                                                        - addVar: { scope: pvar, player: { chosen: $player }, var: chipStack, delta: { ref: binding, name: $baseShare } }
                                                            - setVar:
                                                                scope: global
                                                                var: oddChipRemainder
                                                                value:
                                                                  op: '-'
                                                                  left: { ref: binding, name: $layerAmount }
                                                                  right:
                                                                    op: '*'
                                                                    left: { ref: binding, name: $baseShare }
                                                                    right: { ref: binding, name: $winnerCount }
                                                            - forEach:
                                                                bind: $player
                                                                over: { query: players }
                                                                effects:
                                                                  - if:
                                                                      when:
                                                                        op: and
                                                                        args:
                                                                          - { op: '>', left: { ref: gvar, var: oddChipRemainder }, right: 0 }
                                                                          - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: handActive }, right: true }
                                                                          - { op: '>', left: { ref: pvar, player: { chosen: $player }, var: totalBet }, right: 0 }
                                                                          - { op: '==', left: { ref: pvar, player: { chosen: $player }, var: showdownScore }, right: { ref: binding, name: $bestScore } }
                                                                      then:
                                                                        - addVar: { scope: pvar, player: { chosen: $player }, var: chipStack, delta: 1 }
                                                                        - addVar: { scope: global, var: oddChipRemainder, delta: -1 }
                                    - forEach:
                                        bind: $player
                                        over: { query: players }
                                        effects:
                                          - if:
                                              when: { op: '>', left: { ref: pvar, player: { chosen: $player }, var: totalBet }, right: 0 }
                                              then:
                                                - addVar:
                                                    scope: pvar
                                                    player: { chosen: $player }
                                                    var: totalBet
                                                    delta:
                                                      op: '-'
                                                      left: 0
                                                      right: { ref: binding, name: $minContribution }
                                    - addVar:
                                        scope: global
                                        var: pot
                                        delta:
                                          op: '-'
                                          left: 0
                                          right: { ref: binding, name: $layerAmount }

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
      - let:
          bind: $nextBlindLevel
          value: { op: '+', left: { ref: gvar, var: blindLevel }, right: 1 }
          in:
            - let:
                bind: $handsRequiredForNextLevel
                value:
                  aggregate:
                    op: sum
                    query: { query: assetRows, tableId: settings.blindSchedule }
                    bind: $row
                    valueExpr:
                      if:
                        when:
                          op: '<'
                          left: { ref: assetField, row: '$row', tableId: settings.blindSchedule, field: level }
                          right: { ref: binding, name: $nextBlindLevel }
                        then: { ref: assetField, row: '$row', tableId: settings.blindSchedule, field: handsUntilNext }
                        else: 0
                in:
                  - if:
                      when:
                        op: '>='
                        left: { ref: gvar, var: handsPlayed }
                        right: { ref: binding, name: $handsRequiredForNextLevel }
                      then:
                        - forEach:
                            bind: $blindRow
                            over:
                              query: assetRows
                              tableId: settings.blindSchedule
                              where:
                                - field: level
                                  op: eq
                                  value: { ref: binding, name: $nextBlindLevel }
                            effects:
                              - setVar:
                                  scope: global
                                  var: blindLevel
                                  value: { ref: assetField, row: '$blindRow', tableId: settings.blindSchedule, field: level }
                              - setVar:
                                  scope: global
                                  var: smallBlind
                                  value: { ref: assetField, row: '$blindRow', tableId: settings.blindSchedule, field: sb }
                              - setVar:
                                  scope: global
                                  var: bigBlind
                                  value: { ref: assetField, row: '$blindRow', tableId: settings.blindSchedule, field: bb }
                              - setVar:
                                  scope: global
                                  var: ante
                                  value: { ref: assetField, row: '$blindRow', tableId: settings.blindSchedule, field: ante }
```
