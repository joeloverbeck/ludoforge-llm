# Fire in the Lake - Content Event Decks

```yaml
eventDecks:
  - id: fitl-events-initial-card-pack
    drawZone: deck:none
    discardZone: played:none
    shuffleOnSetup: true
    cards:
      - id: card-82
        title: Domino Theory
        sideMode: dual
        order: 82
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "VC", "US", "NVA"]
          flavorText: "U.S. prestige is on the line."
        unshaded:
          text: "Aid and ARVN Resources each +9. Return pieces from Out of Play."
          branches:
            - id: resources-and-aid
              order: 2
              effects:
                - addVar: { scope: global, var: arvnResources, delta: 9 }
                - addVar: { scope: global, var: aid, delta: 9 }
            - id: return-from-out-of-play
              order: 1
              targets:
                - id: us-out-of-play
                  selector:
                    query: players
                  cardinality: { max: 3 }
                - id: arvn-out-of-play
                  selector:
                    query: players
                  cardinality: { max: 6 }
              effects:
                - removeByPriority:
                    budget: 3
                    groups:
                      - bind: usOutOfPlay
                        over:
                          query: tokensInZone
                          zone: out-of-play-US:none
                          filter:
                            - { prop: faction, eq: US }
                        to:
                          zoneExpr: available-US:none
                - removeByPriority:
                    budget: 6
                    groups:
                      - bind: arvnOutOfPlay
                        over:
                          query: tokensInZone
                          zone: out-of-play-ARVN:none
                          filter:
                            - { prop: faction, eq: ARVN }
                        to:
                          zoneExpr: available-ARVN:none
                - addVar: { scope: global, var: aid, delta: 1 }
        shaded:
          text: "Containment falters: Aid -9."
          targets:
            - id: us-troops-available
              selector:
                query: players
              cardinality: { max: 3 }
          effects:
            - addVar: { scope: global, var: aid, delta: -9 }
      - id: card-64
        title: Honolulu Conference
        sideMode: single
        order: 64
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "US", "NVA", "VC"]
          flavorText: "Summit signals renewed support for Saigon."
        unshaded:
          text: "Aid and Patronage each +6."
          effects:
            - macro: add-global-var-delta
              args: { varName: aid, deltaExpr: 6 }
            - macro: add-global-var-delta
              args: { varName: patronage, deltaExpr: 6 }
      - id: card-67
        title: Amphib Landing
        sideMode: dual
        order: 67
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "US", "VC", "NVA"]
          flavorText: "Coastal insertion opens a fast COIN push."
        unshaded:
          text: "Relocate ARVN Troops among coastal spaces; ARVN executes free Sweep then free Assault."
          freeOperationGrants:
            - seat: "ARVN"
              sequence: { chain: amphib-landing-arvn, step: 0 }
              operationClass: operation
              actionIds: [sweep]
            - seat: "ARVN"
              sequence: { chain: amphib-landing-arvn, step: 1 }
              operationClass: operation
              actionIds: [assault]
        shaded:
          text: "Insurgent response: Remove 2 ARVN Troops from coastal spaces."
      - id: card-69
        title: MACV
        sideMode: single
        order: 69
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "US", "VC", "NVA"]
          flavorText: "Command integration accelerates ARVN tempo."
        unshaded:
          text: "ARVN executes free Special Activities."
          freeOperationGrants:
            - seat: "ARVN"
              sequence: { chain: macv-arvn-special-activity, step: 0 }
              operationClass: limitedOperation
      - id: card-70
        title: ROKs
        sideMode: dual
        order: 70
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "US", "VC", "NVA"]
          flavorText: "Allied contingents strengthen ARVN offensive options."
        unshaded:
          text: "ARVN Sweep/Assault in selected spaces as if US."
          freeOperationGrants:
            - seat: "ARVN"
              executeAsSeat: "US"
              sequence: { chain: roks-arvn-as-us, step: 0 }
              operationClass: operation
              actionIds: [sweep]
            - seat: "ARVN"
              executeAsSeat: "US"
              sequence: { chain: roks-arvn-as-us, step: 1 }
              operationClass: operation
              actionIds: [assault]
        shaded:
          text: "ARVN losses mount: remove 2 ARVN pieces."
      - id: card-72
        title: Body Count
        sideMode: dual
        order: 72
        tags: [momentum]
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "NVA", "US", "VC"]
          flavorText: "Kill metrics begin to drive battlefield behavior."
        unshaded:
          text: "US/ARVN operations prioritize attrition. MOMENTUM"
          lastingEffects:
            - id: mom-body-count
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_bodyCount }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_bodyCount }
        shaded:
          text: "Insurgent adaptation blunts kill-ratio pressure."
      - id: card-73
        title: Great Society
        sideMode: dual
        order: 73
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "NVA", "US", "VC"]
          flavorText: "LBJ advances social agenda."
        unshaded:
          text: "Conduct a Commitment Phase."
          effects:
            - pushInterruptPhase: { phase: commitment, resumePhase: main }
        shaded:
          text: "War wrecks economy: US moves 3 pieces from Available to out of play."
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: usAvailablePiece
                    over:
                      query: tokensInZone
                      zone: available-US:none
                      filter:
                        - { prop: faction, eq: US }
                    to:
                      zoneExpr: out-of-play-US:none
      - id: card-76
        title: Annam
        sideMode: dual
        order: 76
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "NVA", "VC", "US"]
          flavorText: "Regional instability strains Saigon's finances."
        unshaded:
          text: "NVA and VC Resources each -3; Patronage +3."
          effects:
            - macro: add-global-var-delta
              args: { varName: nvaResources, deltaExpr: -3 }
            - macro: add-global-var-delta
              args: { varName: vcResources, deltaExpr: -3 }
            - macro: add-global-var-delta
              args: { varName: patronage, deltaExpr: 3 }
        shaded:
          text: "Patronage -3 and ARVN Resources -6."
          effects:
            - macro: add-global-var-delta
              args: { varName: patronage, deltaExpr: -3 }
            - macro: add-global-var-delta
              args: { varName: arvnResources, deltaExpr: -6 }
      - id: card-78
        title: General Landsdale
        sideMode: dual
        order: 78
        tags: [momentum]
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "NVA", "VC", "US"]
          flavorText: "Political warfare effort reshapes pacification tempo."
        unshaded:
          text: "Landsdale sidelined; no lasting momentum effect."
        shaded:
          text: "Political influence campaign takes hold. MOMENTUM"
          lastingEffects:
            - id: mom-general-landsdale
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_generalLansdale }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_generalLansdale }
      - id: card-81
        title: CIDG
        sideMode: dual
        order: 81
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "VC", "US", "NVA"]
          flavorText: "Civilian irregular networks are reorganized."
        unshaded:
          text: "Replace ARVN pieces with Irregulars/Rangers in selected spaces."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 2 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: irregular
                    over:
                      query: tokensInZone
                      zone: available-US:none
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: irregular }
                    to:
                      zoneExpr: $targetSpace
        shaded:
          text: "CIDG positions collapse: replace Irregulars with VC Guerrillas."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 2 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: irregular
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: irregular }
                    to:
                      zoneExpr: available-US:none
            - removeByPriority:
                budget: 2
                groups:
                  - bind: vcGuerrilla
                    over:
                      query: tokensInZone
                      zone: available-VC:none
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetSpace
      - id: card-83
        title: Election
        sideMode: dual
        order: 83
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "VC", "US", "NVA"]
          flavorText: "Balloting reshapes control and aid expectations."
        unshaded:
          text: "Shift up to 3 spaces one level toward Active Support; Aid +6."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
                filter:
                  op: or
                  args:
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: city }
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
              cardinality: { max: 3 }
          effects:
            - macro: shift-support-opposition
              args: { space: $targetSpace, deltaExpr: 1 }
            - macro: add-global-var-delta
              args: { varName: aid, deltaExpr: 6 }
        shaded:
          text: "Shift up to 3 spaces one level toward Active Opposition."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
                filter:
                  op: or
                  args:
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: city }
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
              cardinality: { max: 3 }
          effects:
            - macro: shift-support-opposition
              args: { space: $targetSpace, deltaExpr: -1 }
      - id: card-85
        title: USAID
        sideMode: dual
        order: 85
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "VC", "US", "NVA"]
          flavorText: "Development spending competes with local capture."
        unshaded:
          text: "Shift up to 2 spaces one level toward Active Support."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 2 }
          effects:
            - macro: shift-support-opposition
              args: { space: $targetSpace, deltaExpr: 1 }
        shaded:
          text: "Shift up to 2 spaces one level toward Active Opposition."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 2 }
          effects:
            - macro: shift-support-opposition
              args: { space: $targetSpace, deltaExpr: -1 }
      - id: card-86
        title: Mandate of Heaven
        sideMode: dual
        order: 86
        tags: [capability, ARVN]
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "VC", "NVA", "US"]
          flavorText: "Legitimacy campaign rewrites ARVN governance limits."
        unshaded:
          text: "Capability: ARVN Govern in one space without support shift."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_mandateOfHeaven, markerState: unshaded }
        shaded:
          text: "Capability: ARVN Govern may select only one space."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_mandateOfHeaven, markerState: shaded }
      - id: card-87
        title: Nguyen Chanh Thi
        sideMode: dual
        order: 87
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "VC", "NVA", "US"]
          flavorText: "Regional command turnover drives sudden force shifts."
        unshaded:
          text: "Place ARVN pieces and shift one selected city toward Support."
          targets:
            - id: $targetCity
              selector:
                query: mapSpaces
                filter:
                  op: '=='
                  left: { ref: zoneProp, zone: $zone, prop: category }
                  right: city
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: arvnTroop
                    over:
                      query: tokensInZone
                      zone: available-ARVN:none
                      filter:
                        - { prop: faction, eq: ARVN }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: $targetCity
            - macro: shift-support-opposition
              args: { space: $targetCity, deltaExpr: 1 }
        shaded:
          text: "Place VC/NVA pieces and shift one selected city toward Opposition."
          targets:
            - id: $targetCity
              selector:
                query: mapSpaces
                filter:
                  op: '=='
                  left: { ref: zoneProp, zone: $zone, prop: category }
                  right: city
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 1
                groups:
                  - bind: vcGuerrilla
                    over:
                      query: tokensInZone
                      zone: available-VC:none
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetCity
            - removeByPriority:
                budget: 1
                groups:
                  - bind: nvaGuerrilla
                    over:
                      query: tokensInZone
                      zone: available-NVA:none
                      filter:
                        - { prop: faction, eq: NVA }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetCity
            - macro: shift-support-opposition
              args: { space: $targetCity, deltaExpr: -1 }
      - id: card-89
        title: Tam Chau
        sideMode: dual
        order: 89
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "VC", "NVA", "US"]
          flavorText: "Buddhist political leverage expands in Saigon."
        unshaded:
          text: "Shift Saigon one level toward Active Support; Patronage +3."
          effects:
            - macro: shift-support-opposition
              args: { space: saigon:none, deltaExpr: 1 }
            - macro: add-global-var-delta
              args: { varName: patronage, deltaExpr: 3 }
        shaded:
          text: "Shift Saigon one level toward Active Opposition; Patronage -3."
          effects:
            - macro: shift-support-opposition
              args: { space: saigon:none, deltaExpr: -1 }
            - macro: add-global-var-delta
              args: { varName: patronage, deltaExpr: -3 }
      - id: card-90
        title: Walt Rostow
        sideMode: dual
        order: 90
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["ARVN", "VC", "NVA", "US"]
          flavorText: "Escalation planning accelerates deployment adjustments."
        unshaded:
          text: "Place and relocate COIN pieces among selected spaces."
          targets:
            - id: $sourceSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
            - id: $destSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: coinPiece
                    over:
                      query: tokensInZone
                      zone: $sourceSpace
                      filter:
                        - { prop: faction, op: in, value: ['US', 'ARVN'] }
                    to:
                      zoneExpr: $destSpace
        shaded:
          text: "Redeploy selected COIN pieces to Available."
          targets:
            - id: $sourceSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: coinPiece
                    over:
                      query: tokensInZone
                      zone: $sourceSpace
                      filter:
                        - { prop: faction, op: in, value: ['US', 'ARVN'] }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $coinPiece, prop: faction }, ':none'] }
      - id: card-68
        title: Green Berets
        sideMode: dual
        order: 68
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["ARVN", "US", "VC", "NVA"]
          flavorText: "Elite trainers."
        unshaded:
          text: "Place 3 Irregulars or 3 Rangers in a Province without NVA Control. Set it to Active Support."
          branches:
            - id: place-irregulars-and-support
              order: 1
              targets:
                - id: $targetProvince
                  selector:
                    query: mapSpaces
                    filter:
                      op: and
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
                        - op: <=
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  - { prop: faction, op: eq, value: 'NVA' }
                          right:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  - { prop: faction, op: in, value: ['US', 'ARVN', 'VC'] }
                  cardinality: { max: 1 }
              effects:
                - removeByPriority:
                    budget: 3
                    groups:
                      - bind: irregular
                        over:
                          query: tokensInZone
                          zone: available-US:none
                          filter:
                            - { prop: faction, eq: US }
                            - { prop: type, eq: irregular }
                        to:
                          zoneExpr: $targetProvince
                - setMarker:
                    space: $targetProvince
                    marker: supportOpposition
                    state: activeSupport
            - id: place-rangers-and-support
              order: 2
              targets:
                - id: $targetProvince
                  selector:
                    query: mapSpaces
                    filter:
                      op: and
                      args:
                        - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
                        - op: <=
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  - { prop: faction, op: eq, value: 'NVA' }
                          right:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  - { prop: faction, op: in, value: ['US', 'ARVN', 'VC'] }
                  cardinality: { max: 1 }
              effects:
                - removeByPriority:
                    budget: 3
                    groups:
                      - bind: ranger
                        over:
                          query: tokensInZone
                          zone: available-ARVN:none
                          filter:
                            - { prop: faction, eq: ARVN }
                            - { prop: type, eq: ranger }
                        to:
                          zoneExpr: $targetProvince
                - setMarker:
                    space: $targetProvince
                    marker: supportOpposition
                    state: activeSupport
        shaded:
          text: "Reluctant trainees: Remove any 3 Irregulars to Available and set 1 of their Provinces to Active Opposition."
          effects:
            - if:
                when:
                  op: '>'
                  left:
                    aggregate:
                      op: count
                      query:
                        query: tokensInMapSpaces
                        filter:
                          - { prop: faction, eq: US }
                          - { prop: type, eq: irregular }
                  right: 0
                then:
                  - chooseN:
                      bind: $irregularsToRemove
                      options:
                        query: tokensInMapSpaces
                        filter:
                          - { prop: faction, eq: US }
                          - { prop: type, eq: irregular }
                      min: 0
                      max: 3
                  - chooseOne:
                      bind: $oppositionProvince
                      options:
                        query: mapSpaces
                        filter:
                          op: and
                          args:
                            - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
                            - op: '>'
                              left:
                                aggregate:
                                  op: count
                                  query:
                                    query: tokensInZone
                                    zone: $zone
                                    filter:
                                      - { prop: faction, eq: US }
                                      - { prop: type, eq: irregular }
                              right: 0
                  - forEach:
                      bind: $irregular
                      over: { query: binding, name: $irregularsToRemove }
                      effects:
                        - moveToken:
                            token: $irregular
                            from: { zoneExpr: { ref: tokenZone, token: $irregular } }
                            to: { zoneExpr: available-US:none }
                  - setMarker:
                      space: $oppositionProvince
                      marker: supportOpposition
                      state: activeOpposition
                else: []
      - id: card-1
        title: Gulf of Tonkin
        sideMode: dual
        order: 1
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["US", "NVA", "ARVN", "VC"]
          flavorText: "Escalation trigger."
        unshaded:
          text: "US free Air Strikes, then moves 6 US pieces from out-of-play to any Cities."
          effectTiming: afterGrants
          freeOperationGrants:
            - seat: "NVA"
              executeAsSeat: "US"
              sequence: { chain: gulf-of-tonkin-us-airstrike, step: 0 }
              operationClass: operation
              actionIds: [airStrike]
          effects:
            - distributeTokens:
                tokens:
                  query: tokensInZone
                  zone: out-of-play-US:none
                  filter:
                    - { prop: faction, eq: US }
                destinations:
                  query: mapSpaces
                  filter:
                    op: '=='
                    left: { ref: zoneProp, zone: $zone, prop: category }
                    right: 'city'
                max: 6
        shaded:
          text: "Congressional regrets: Aid -1 per Casualty. All Casualties out of play."
          effects:
            - addVar:
                scope: global
                var: aid
                delta:
                  op: '*'
                  left:
                    aggregate:
                      op: count
                      query:
                        query: tokensInZone
                        zone: casualties-US:none
                        filter:
                          - { prop: faction, eq: US }
                  right: -1
            - moveAll:
                from: casualties-US:none
                to: out-of-play-US:none
      - id: card-2
        title: Kissinger
        sideMode: dual
        order: 2
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["US", "NVA", "ARVN", "VC"]
          flavorText: "Operation Menu."
        unshaded:
          text: "Remove a die roll of Insurgent pieces total from Cambodia and Laos."
          effects:
            - rollRandom:
                bind: $dieRoll
                min: 1
                max: 6
                in:
                  - chooseN:
                      bind: $insurgentPieces
                      options:
                        query: concat
                        sources:
                          - query: tokensInMapSpaces
                            spaceFilter:
                              op: or
                              args:
                                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
                                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                            filter:
                              - { prop: faction, op: in, value: ['NVA', 'VC'] }
                              - { prop: type, op: in, value: [troops, guerrilla] }
                          - query: tokensInMapSpaces
                            spaceFilter:
                              op: or
                              args:
                                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
                                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                            filter:
                              - { prop: faction, op: in, value: ['NVA', 'VC'] }
                              - { prop: type, eq: base }
                              - { prop: tunnel, eq: untunneled }
                      min: 0
                      max: { ref: binding, name: $dieRoll }
                  - forEach:
                      bind: $piece
                      over: { query: binding, name: $insurgentPieces }
                      effects:
                        - moveToken:
                            token: $piece
                            from: { zoneExpr: { ref: tokenZone, token: $piece } }
                            to: { zoneExpr: { concat: ['available-', { ref: tokenProp, token: $piece, prop: faction }, ':none'] } }
        shaded:
          text: "NVA places 2 pieces in Cambodia. US moves any 2 US Troops to out of play. Aid -6."
          effects:
            # 1. NVA places 2 pieces from Available into Cambodia
            - distributeTokens:
                tokens:
                  query: tokensInZone
                  zone: available-NVA:none
                  filter:
                    - { prop: faction, eq: NVA }
                destinations:
                  query: mapSpaces
                  filter:
                    op: '=='
                    left: { ref: zoneProp, zone: $zone, prop: country }
                    right: cambodia
                min: 0
                max: 2
            # 2. US moves any 2 US Troops to out of play (map, Available, or Casualties)
            - chooseN:
                bind: $usTroops
                options:
                  query: concat
                  sources:
                    - query: tokensInMapSpaces
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
                    - query: tokensInZone
                      zone: available-US:none
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
                    - query: tokensInZone
                      zone: casualties-US:none
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
                min: 0
                max: 2
            - forEach:
                bind: $usTroop
                over: { query: binding, name: $usTroops }
                effects:
                  - moveToken:
                      token: $usTroop
                      from: { zoneExpr: { ref: tokenZone, token: $usTroop } }
                      to: { zoneExpr: out-of-play-US:none }
            # 3. Aid -6
            - addVar: { scope: global, var: aid, delta: -6 }
      - id: card-3
        title: Peace Talks
        sideMode: dual
        order: 3
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["US", "NVA", "ARVN", "VC"]
          flavorText: "Public negotiations mask battlefield pressure."
        unshaded:
          text: "NVA Resources -9. Linebacker II allowed when Support + Available US (Troops + Bases) > 25."
          effects:
            - addVar: { scope: global, var: nvaResources, delta: -9 }
            - setVar: { scope: global, var: linebacker11SupportAvailable, value: 0 }
            - forEach:
                bind: $space
                over: { query: mapSpaces }
                effects:
                  - if:
                      when: { op: '==', left: { ref: markerState, space: $space, marker: supportOpposition }, right: passiveSupport }
                      then:
                        - addVar: { scope: global, var: linebacker11SupportAvailable, delta: { ref: zoneProp, zone: $space, prop: population } }
                  - if:
                      when: { op: '==', left: { ref: markerState, space: $space, marker: supportOpposition }, right: activeSupport }
                      then:
                        - addVar:
                            scope: global
                            var: linebacker11SupportAvailable
                            delta: { op: '*', left: { ref: zoneProp, zone: $space, prop: population }, right: 2 }
            - addVar:
                scope: global
                var: linebacker11SupportAvailable
                delta:
                  aggregate:
                    op: count
                    query:
                      query: tokensInZone
                      zone: available-US:none
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
            - addVar:
                scope: global
                var: linebacker11SupportAvailable
                delta:
                  aggregate:
                    op: count
                    query:
                      query: tokensInZone
                      zone: available-US:none
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: base }
            - if:
                when: { op: '>', left: { ref: gvar, var: linebacker11SupportAvailable }, right: 25 }
                then:
                  - setVar: { scope: global, var: linebacker11Allowed, value: true }
                else:
                  - setVar: { scope: global, var: linebacker11Allowed, value: false }
        shaded:
          text: "Bombing halt: NVA Resources +9. If Trail is 0-2, set Trail to 3."
          effects:
            - addVar: { scope: global, var: nvaResources, delta: 9 }
            - if:
                when: { op: '<=', left: { ref: gvar, var: trail }, right: 2 }
                then:
                  - setVar: { scope: global, var: trail, value: 3 }
      - id: card-4
        title: Top Gun
        sideMode: dual
        order: 4
        tags: [capability, US]
        metadata:
          period: "1968"
          seatOrder: ["US", "NVA", "ARVN", "VC"]
          flavorText: "Naval aviators sharpen air-superiority tactics."
        unshaded:
          text: "Cancel shaded MiGs. Air Strikes Degrade Trail 2 boxes. US CAPABILITY."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_topGun, markerState: unshaded }
            - if:
                when: { op: '==', left: { ref: globalMarkerState, marker: cap_migs }, right: shaded }
                then:
                  - macro: set-global-marker
                    args: { markerId: cap_migs, markerState: inactive }
        shaded:
          text: "Air Strike Degrades Trail after applying 2 hits only on die roll of 4-6."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_topGun, markerState: shaded }
      - id: card-5
        title: Wild Weasels
        sideMode: dual
        order: 5
        tags: [momentum]
        metadata:
          period: "1965"
          seatOrder: ["US", "NVA", "ARVN", "VC"]
          flavorText: "Air defense suppression."
        unshaded:
          text: "Remove shaded SA-2s or, if no shaded SA-2s, Degrade Trail 2 boxes and NVA Resources -9."
          effects:
            - if:
                when: { op: '==', left: { ref: globalMarkerState, marker: cap_sa2s }, right: shaded }
                then:
                  - macro: set-global-marker
                    args: { markerId: cap_sa2s, markerState: inactive }
                else:
                  - addVar: { scope: global, var: trail, delta: -2 }
                  - addVar: { scope: global, var: nvaResources, delta: -9 }
        shaded:
          text: "Complex strike packages: Until Coup, Air Strike either Degrades Trail or may remove just 1 piece (not 1-6). MOMENTUM"
          lastingEffects:
            - id: mom-wild-weasels
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_wildWeasels }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_wildWeasels }
      - id: card-6
        title: Aces
        sideMode: dual
        order: 6
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["US", "NVA", "VC", "ARVN"]
          flavorText: "Robin Olds ambushes MiGs."
        unshaded:
          text: "Free Air Strike any 1 space outside the South with 6 hits and Degrade Trail 2 boxes."
          effectTiming: afterGrants
          freeOperationGrants:
            - seat: "US"
              sequence: { chain: aces-us-airstrike, step: 0 }
              operationClass: operation
              actionIds: [airStrike]
          lastingEffects:
            - id: evt-aces-window
              duration: turn
              setupEffects:
                - setVar: { scope: global, var: fitl_acesAirStrikeWindow, value: true }
              teardownEffects:
                - setVar: { scope: global, var: fitl_acesAirStrikeWindow, value: false }
          effects:
            - setVar: { scope: global, var: fitl_acesAirStrikeWindow, value: false }
            - addVar: { scope: global, var: trail, delta: -2 }
        shaded:
          text: "MiG ace 'Colonel Tomb': 2 Available US Troops to Casualties. Improve Trail by 2 boxes."
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: usTroop
                    over:
                      query: tokensInZone
                      zone: available-US:none
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: casualties-US:none
            - addVar: { scope: global, var: trail, delta: 2 }
      - id: card-7
        title: ADSID
        sideMode: dual
        order: 7
        tags: [momentum]
        metadata:
          period: "1965"
          seatOrder: ["US", "NVA", "VC", "ARVN"]
          flavorText: "Air-delivered seismic intrusion detector."
        unshaded:
          text: "Through Coup, -6 NVA Resources at any Trail# change. MOMENTUM"
          lastingEffects:
            - id: mom-adsid
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_adsid }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_adsid }
        shaded:
          text: "Dubious technology: Improve Trail by 1 box and to a minimum of 2. ARVN Resources -9."
          effects:
            - addVar: { scope: global, var: trail, delta: 1 }
            - if:
                when: { op: '<', left: { ref: gvar, var: trail }, right: 2 }
                then:
                  - setVar: { scope: global, var: trail, value: 2 }
            - addVar: { scope: global, var: arvnResources, delta: -9 }
      - id: card-8
        title: Arc Light
        sideMode: dual
        order: 8
        tags: [capability, US]
        metadata:
          period: "1965"
          seatOrder: ["US", "NVA", "VC", "ARVN"]
          flavorText: "Guided B-52 tactical bombing."
        unshaded:
          text: "1 space each Air Strike may be a Province without COIN pieces. US CAPABILITY."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_arcLight, markerState: unshaded }
        shaded:
          text: "Air Strike spaces removing >1 piece shift 2 levels toward Active Opposition."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_arcLight, markerState: shaded }
      - id: card-9
        title: Psychedelic Cookie
        sideMode: dual
        order: 9
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["US", "NVA", "VC", "ARVN"]
          flavorText: "Field improvisation expands helicopter mobility."
        unshaded:
          text: "US moves up to 3 US Troops from out of play to Available or South Vietnam, or from the map to Available."
          effects:
            - chooseN:
                bind: $usTroops
                options:
                  query: concat
                  sources:
                    - query: tokensInZone
                      zone: out-of-play-US:none
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
                    - query: tokensInMapSpaces
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
                min: 0
                max: 3
            - forEach:
                bind: $usTroop
                over: { query: binding, name: $usTroops }
                effects:
                  - if:
                      when: { op: '==', left: { ref: tokenZone, token: $usTroop }, right: out-of-play-US:none }
                      then:
                        - chooseOne:
                            bind: '$oopTroopDestination@{$usTroop}'
                            options: { query: enums, values: ['available-US:none', 'south-vietnam-map'] }
                        - if:
                            when: { op: '==', left: { ref: binding, name: '$oopTroopDestination@{$usTroop}' }, right: 'available-US:none' }
                            then:
                              - moveToken:
                                  token: $usTroop
                                  from: { zoneExpr: { ref: tokenZone, token: $usTroop } }
                                  to: { zoneExpr: available-US:none }
                            else:
                              - chooseOne:
                                  bind: '$southVietnamSpace@{$usTroop}'
                                  options:
                                    query: mapSpaces
                                    filter:
                                      op: '=='
                                      left: { ref: zoneProp, zone: $zone, prop: country }
                                      right: southVietnam
                              - moveToken:
                                  token: $usTroop
                                  from: { zoneExpr: { ref: tokenZone, token: $usTroop } }
                                  to: { zoneExpr: { ref: binding, name: '$southVietnamSpace@{$usTroop}' } }
                      else:
                        - moveToken:
                            token: $usTroop
                            from: { zoneExpr: { ref: tokenZone, token: $usTroop } }
                            to: { zoneExpr: available-US:none }
        shaded:
          text: "US takes 3 of its Troops from the map out of play."
          effects:
            - chooseN:
                bind: $usMapTroops
                options:
                  query: tokensInMapSpaces
                  filter:
                    - { prop: faction, eq: US }
                    - { prop: type, eq: troops }
                min: 0
                max: 3
            - forEach:
                bind: $usTroop
                over: { query: binding, name: $usMapTroops }
                effects:
                  - moveToken:
                      token: $usTroop
                      from: { zoneExpr: { ref: tokenZone, token: $usTroop } }
                      to: { zoneExpr: out-of-play-US:none }
      - id: card-10
        title: Rolling Thunder
        sideMode: dual
        order: 10
        tags: [momentum]
        metadata:
          period: "1965"
          seatOrder: ["US", "NVA", "VC", "ARVN"]
          flavorText: "Sustained bombing."
        unshaded:
          text: "Degrade Trail 2 boxes. -9 NVA Resources. NVA Ineligible through next card."
          eligibilityOverrides:
            - { target: { kind: seat, seat: 'NVA' }, eligible: false, windowId: make-ineligible }
          effects:
            - addVar: { scope: global, var: trail, delta: -2 }
            - addVar: { scope: global, var: nvaResources, delta: -9 }
        shaded:
          text: "Assets to restricted strategic air campaign: -5 ARVN Resources. No Air Strike until Coup. MOMENTUM"
          effects:
            - addVar: { scope: global, var: arvnResources, delta: -5 }
          lastingEffects:
            - id: mom-rolling-thunder
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_rollingThunder }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_rollingThunder }
      - id: card-11
        title: Abrams
        sideMode: dual
        order: 11
        tags: [capability, US]
        metadata:
          period: "1968"
          seatOrder: ["US", "ARVN", "NVA", "VC"]
          flavorText: "Command shift prioritizes selective base targeting."
        unshaded:
          text: "1 US Assault space may remove 1 enemy non-Tunnel Base first not last."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_abrams, markerState: unshaded }
        shaded:
          text: "US may select max 2 spaces per Assault."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_abrams, markerState: shaded }
      - id: card-12
        title: Capt Buck Adams
        sideMode: dual
        order: 12
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["US", "ARVN", "NVA", "VC"]
          flavorText: "Strategic reconnaissance."
        unshaded:
          text: "Outside the South, flip all Insurgents Active and remove 1 NVA Base."
          effects:
            - forEach:
                bind: $insurgentGuerrilla
                over:
                  query: tokensInMapSpaces
                  spaceFilter:
                    op: or
                    args:
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: northVietnam }
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
                  filter:
                    - { prop: faction, op: in, value: ['NVA', 'VC'] }
                    - { prop: type, eq: guerrilla }
                    - { prop: activity, eq: active }
                effects:
                  - setTokenProp: { token: $insurgentGuerrilla, prop: activity, value: underground }
            - chooseN:
                bind: $nvaBaseToRemove
                options:
                  query: tokensInMapSpaces
                  spaceFilter:
                    op: or
                    args:
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: northVietnam }
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
                  filter:
                    - { prop: faction, eq: NVA }
                    - { prop: type, eq: base }
                min: 0
                max: 1
            - forEach:
                bind: $nvaBase
                over: { query: binding, name: $nvaBaseToRemove }
                effects:
                  - moveToken:
                      token: $nvaBase
                      from: { zoneExpr: { ref: tokenZone, token: $nvaBase } }
                      to: { zoneExpr: available-NVA:none }
        shaded:
          text: "SR-71 pilot must outrun SA-2s. Place 1 NVA Base at NVA Control outside the South and flip any 3 NVA Guerrillas Underground."
          effects:
            - chooseN:
                bind: $nvaBaseFromAvailable
                options:
                  query: tokensInZone
                  zone: available-NVA:none
                  filter:
                    - { prop: faction, eq: NVA }
                    - { prop: type, eq: base }
                min: 0
                max: 1
            - if:
                when:
                  op: and
                  args:
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: binding
                            name: $nvaBaseFromAvailable
                      right: 0
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: mapSpaces
                            filter:
                              op: and
                              args:
                                - op: or
                                  args:
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: northVietnam }
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
                                - op: '=='
                                  left: { ref: zoneProp, zone: $zone, prop: category }
                                  right: province
                                - op: '>'
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
                                          - { prop: faction, op: in, value: ['US', 'ARVN', 'VC'] }
                                - op: '<'
                                  left:
                                    aggregate:
                                      op: count
                                      query:
                                        query: tokensInZone
                                        zone: $zone
                                        filter:
                                          - { prop: type, op: eq, value: base }
                                  right: 2
                      right: 0
                then:
                  - chooseOne:
                      bind: $nvaBaseDestination
                      options:
                        query: mapSpaces
                        filter:
                          op: and
                          args:
                            - op: or
                              args:
                                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: northVietnam }
                                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                                - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
                            - op: '=='
                              left: { ref: zoneProp, zone: $zone, prop: category }
                              right: province
                            - op: '>'
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
                                      - { prop: faction, op: in, value: ['US', 'ARVN', 'VC'] }
                            - op: '<'
                              left:
                                aggregate:
                                  op: count
                                  query:
                                    query: tokensInZone
                                    zone: $zone
                                    filter:
                                      - { prop: type, op: eq, value: base }
                              right: 2
                  - forEach:
                      bind: $nvaBase
                      over: { query: binding, name: $nvaBaseFromAvailable }
                      effects:
                        - moveToken:
                            token: $nvaBase
                            from: { zoneExpr: available-NVA:none }
                            to: { zoneExpr: $nvaBaseDestination }
                else: []
            - chooseN:
                bind: $nvaGuerrillasToHide
                options:
                  query: tokensInMapSpaces
                  filter:
                    - { prop: faction, eq: NVA }
                    - { prop: type, eq: guerrilla }
                    - { prop: activity, eq: active }
                min: 0
                max: 3
            - forEach:
                bind: $nvaGuerrilla
                over: { query: binding, name: $nvaGuerrillasToHide }
                effects:
                  - setTokenProp: { token: $nvaGuerrilla, prop: activity, value: underground }
      - id: card-13
        title: Cobras
        sideMode: dual
        order: 13
        tags: [capability, US]
        metadata:
          period: "1968"
          seatOrder: ["US", "ARVN", "NVA", "VC"]
          flavorText: "Gunship support amplifies Sweep and complicates Assault."
        unshaded:
          text: "2 US/ ARVN Sweep spaces each remove 1 Active unTunneled enemy (Troops first, Bases last). US CAPABILITY."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_cobras, markerState: unshaded }
        shaded:
          text: "Each US Assault space, 1 US Troop to Casualties on a die roll of 1-3."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_cobras, markerState: shaded }
      - id: card-14
        title: M-48 Patton
        sideMode: dual
        order: 14
        tags: [capability, US]
        metadata:
          period: "1965"
          seatOrder: ["US", "ARVN", "NVA", "VC"]
          flavorText: "Armored punch."
        unshaded:
          text: "2 non-Lowland US Assault spaces each remove 2 extra enemy pieces."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_m48Patton, markerState: unshaded }
        shaded:
          text: "RPGs: After US/ARVN Patrol, NVA removes up to 2 cubes that moved (US to Casualties)."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_m48Patton, markerState: shaded }
      - id: card-16
        title: Blowtorch Komer
        sideMode: dual
        order: 16
        tags: [momentum]
        metadata:
          period: "1968"
          seatOrder: ["US", "ARVN", "VC", "NVA"]
          flavorText: "Pacification drive intensifies political pressure."
        unshaded:
          text: "Through Coup, Pacification shifts 1 additional level toward Support. MOMENTUM"
          lastingEffects:
            - id: mom-blowtorch-komer
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_blowtorchKomer }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_blowtorchKomer }
        shaded:
          text: "Pacification backlash: rural coercion increases opposition pressure."
      - id: card-18
        title: Combined Action Platoons
        sideMode: dual
        order: 18
        tags: [capability, US]
        metadata:
          period: "1965"
          seatOrder: ["US", "ARVN", "VC", "NVA"]
          flavorText: "Hamlet defense."
        unshaded:
          text: "US Training places or relocates an added Police into any 1 space with US Troops."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_caps, markerState: unshaded }
        shaded:
          text: "Passive posture: US may select max 2 spaces per Sweep."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_caps, markerState: shaded }
      - id: card-19
        title: CORDS
        sideMode: dual
        order: 19
        tags: [capability, US]
        metadata:
          period: "1968"
          seatOrder: ["US", "ARVN", "VC", "NVA"]
          flavorText: "Civil-military integration accelerates local governance."
        unshaded:
          text: "US capability: US/ARVN Train may execute sub-activity in up to 2 spaces."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_cords, markerState: unshaded }
        shaded:
          text: "US capability (shaded): Pacification in Train can only set to Passive Support."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_cords, markerState: shaded }
      - id: card-20
        title: Laser Guided Bombs
        sideMode: dual
        order: 20
        tags: [capability, US]
        metadata:
          period: "1968"
          seatOrder: ["US", "ARVN", "VC", "NVA"]
          flavorText: "Precision strike doctrine changes target priorities."
        unshaded:
          text: "US capability: Air Strike may spare one selected space from casualties."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_lgbs, markerState: unshaded }
        shaded:
          text: "US capability (shaded): Air Strike may remove at most 4 pieces total."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_lgbs, markerState: shaded }
      - id: card-21
        title: Americal
        sideMode: dual
        order: 21
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["US", "VC", "NVA", "ARVN"]
          flavorText: "Rapid redeployment reshapes local balance."
        unshaded:
          text: "US Troops reposition to pressure insurgent strongholds."
        shaded:
          text: "Escalation costs: local backlash shifts spaces toward Opposition."
      - id: card-22
        title: Da Nang
        sideMode: dual
        order: 22
        tags: [momentum]
        metadata:
          period: "1965"
          seatOrder: ["US", "VC", "NVA", "ARVN"]
          flavorText: "US Marines arrive."
        unshaded:
          text: "US places up to 6 Troops in Da Nang, up to 3 from out of play."
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: usTroopOutOfPlay
                    over:
                      query: tokensInZone
                      zone: out-of-play-US:none
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: da-nang:none
            - removeByPriority:
                budget: 3
                groups:
                  - bind: usTroopAvailable
                    over:
                      query: tokensInZone
                      zone: available-US:none
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: da-nang:none
        shaded:
          text: "VC fire closes air base: Remove all Support within 1 space of Da Nang. No Air Strike until Coup. MOMENTUM"
          lastingEffects:
            - id: mom-da-nang
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_daNang }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_daNang }
      - id: card-23
        title: Operation Attleboro
        sideMode: dual
        order: 23
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["US", "VC", "NVA", "ARVN"]
          flavorText: "Stab at Iron Triangle."
        unshaded:
          text: "US free Air Lifts into, Sweeps in, then Assaults a space with a Tunnel, removing Tunneled Bases as if no Tunnel."
          freeOperationGrants:
            - seat: "US"
              sequence: { chain: operation-attleboro-us, step: 0 }
              operationClass: operation
              actionIds: [airLift]
            - seat: "US"
              sequence: { chain: operation-attleboro-us, step: 1 }
              operationClass: operation
              actionIds: [sweep]
            - seat: "US"
              sequence: { chain: operation-attleboro-us, step: 2 }
              operationClass: operation
              actionIds: [assault]
        shaded:
          text: "Heavy casualties, few results: Select a Tunnel space: remove a die roll of US Troops within 1 space of it to Casualties."
      - id: card-24
        title: Operation Starlite
        sideMode: dual
        order: 24
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["US", "VC", "NVA", "ARVN"]
          flavorText: "VC caught off guard."
        unshaded:
          text: "Remove all VC from a coastal Province with or adjacent to US Troops."
          targets:
            - id: $targetProvince
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 99
                groups:
                  - bind: vcPiece
                    over:
                      query: tokensInZone
                      zone: $targetProvince
                      filter:
                        - { prop: faction, eq: VC }
                    to:
                      zoneExpr: available-VC:none
        shaded:
          text: "Slipped away: In up to 3 Provinces, flip all VC Guerrillas Underground. Stay Eligible."
          targets:
            - id: $targetProvince
              selector:
                query: mapSpaces
              cardinality: { max: 3 }
          eligibilityOverrides:
            - { target: { kind: active }, eligible: true, windowId: remain-eligible }
          effects:
            - forEach:
                bind: $vcGuerrilla
                over:
                  query: tokensInZone
                  zone: $targetProvince
                  filter:
                    - { prop: faction, eq: VC }
                    - { prop: type, eq: guerrilla }
                    - { prop: activity, eq: active }
                effects:
                  - setTokenProp: { token: $vcGuerrilla, prop: activity, value: underground }
      - id: card-25
        title: TF-116 Riverines
        sideMode: dual
        order: 25
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["US", "VC", "NVA", "ARVN"]
          flavorText: "Delta boats."
        unshaded:
          text: "Remove all NVA/VC from Mekong LoCs. US or ARVN free Sweep into/in then free Assault each Lowland touching Mekong."
          freeOperationGrants:
            - seat: "US"
              sequence: { chain: tf116-us, step: 0 }
              operationClass: operation
              actionIds: [sweep, assault]
            - seat: "ARVN"
              sequence: { chain: tf116-arvn, step: 0 }
              operationClass: operation
              actionIds: [sweep, assault]
          targets:
            - id: $targetLoc
              selector:
                query: mapSpaces
                filter:
                  op: '=='
                  left: { ref: zoneProp, zone: $zone, prop: category }
                  right: loc
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 99
                groups:
                  - bind: insurgentPiece
                    over:
                      query: tokensInZone
                      zone: $targetLoc
                      filter:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $insurgentPiece, prop: faction }, ':none'] }
        shaded:
          text: "VC river fortifications: Place 2 VC Guerrillas per Mekong LoC space, then Sabotage each that has more VC than COIN."
          targets:
            - id: $targetLoc
              selector:
                query: mapSpaces
                filter:
                  op: '=='
                  left: { ref: zoneProp, zone: $zone, prop: category }
                  right: loc
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: vcGuerrilla
                    over:
                      query: tokensInZone
                      zone: available-VC:none
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetLoc
      - id: card-28
        title: Search and Destroy
        sideMode: dual
        order: 28
        tags: [capability, US]
        metadata:
          period: "1965"
          seatOrder: ["US", "VC", "ARVN", "NVA"]
          flavorText: "Mobile counter-guerrilla ops."
        unshaded:
          text: "Each US Assault space may remove 1 Underground Guerrilla."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_searchAndDestroy, markerState: unshaded }
        shaded:
          text: "Villagers in the crossfire: Each US and ARVN Assault Province shifts by 1 level toward Active Opposition."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_searchAndDestroy, markerState: shaded }
      - id: card-27
        title: Phoenix Program
        sideMode: dual
        order: 27
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["US", "VC", "ARVN", "NVA"]
          flavorText: "Neutralization campaigns expand."
        unshaded:
          text: "Intelligence campaign: Aid -1."
          targets:
            - id: vc-in-coin-control
              selector:
                query: players
              cardinality: { max: 3 }
          effects:
            - addVar: { scope: global, var: aid, delta: -1 }
        shaded:
          text: "Repression backlash: Aid -2 and ARVN Resources -1."
          targets:
            - id: terror-spaces
              selector:
                query: mapSpaces
              cardinality: { max: 2 }
          effects:
            - addVar: { scope: global, var: aid, delta: -2 }
            - addVar: { scope: global, var: arvnResources, delta: -1 }
      - id: card-43
        title: Economic Aid
        sideMode: dual
        order: 43
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["NVA", "ARVN", "US", "VC"]
          flavorText: "Free World aids Saigon."
        unshaded:
          text: "2 ARVN or 2 US Bases out-of-play to Available. Then ARVN Resources +6 or Aid +12."
          branches:
            - id: return-us-bases-and-aid
              order: 1
              targets:
                - id: us-out-of-play-bases
                  selector:
                    query: players
                  cardinality: { max: 2 }
              effects:
                - removeByPriority:
                    budget: 2
                    groups:
                      - bind: usBaseOutOfPlay
                        over:
                          query: tokensInZone
                          zone: out-of-play-US:none
                          filter:
                            - { prop: faction, eq: US }
                            - { prop: type, eq: base }
                        to:
                          zoneExpr: available-US:none
                - addVar: { scope: global, var: aid, delta: 12 }
            - id: return-arvn-bases-and-resources
              order: 2
              targets:
                - id: arvn-out-of-play-bases
                  selector:
                    query: players
                  cardinality: { max: 2 }
              effects:
                - removeByPriority:
                    budget: 2
                    groups:
                      - bind: arvnBaseOutOfPlay
                        over:
                          query: tokensInZone
                          zone: out-of-play-ARVN:none
                          filter:
                            - { prop: faction, eq: ARVN }
                            - { prop: type, eq: base }
                        to:
                          zoneExpr: available-ARVN:none
                - addVar: { scope: global, var: arvnResources, delta: 6 }
        shaded:
          text: "Moscow aids Hanoi: Improve the Trail 1 box. Then either Improve it 1 more box or add +10 NVA Resources."
          branches:
            - id: improve-trail-twice
              order: 1
              effects:
                - addVar: { scope: global, var: trail, delta: 1 }
                - addVar: { scope: global, var: trail, delta: 1 }
            - id: improve-trail-and-add-resources
              order: 2
              effects:
                - addVar: { scope: global, var: trail, delta: 1 }
                - addVar: { scope: global, var: nvaResources, delta: 10 }
      - id: card-44
        title: Ia Drang
        sideMode: dual
        order: 44
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["NVA", "ARVN", "US", "VC"]
          flavorText: "Silver Bayonet."
        unshaded:
          text: "US free Air Lifts into 1 space with any NVA piece, then free Sweeps and Assaults there."
          freeOperationGrants:
            - seat: "US"
              sequence: { chain: ia-drang-us, step: 0 }
              operationClass: operation
              actionIds: [airLift]
              zoneFilter:
                op: '>'
                left:
                  aggregate:
                    op: count
                    query:
                      query: tokensInZone
                      zone: $zone
                      filter:
                        - { prop: faction, eq: NVA }
                right: 0
            - seat: "US"
              sequence: { chain: ia-drang-us, step: 1 }
              operationClass: operation
              actionIds: [sweep]
              zoneFilter:
                op: '>'
                left:
                  aggregate:
                    op: count
                    query:
                      query: tokensInZone
                      zone: $zone
                      filter:
                        - { prop: faction, eq: NVA }
                right: 0
            - seat: "US"
              sequence: { chain: ia-drang-us, step: 2 }
              operationClass: operation
              actionIds: [assault]
              zoneFilter:
                op: '>'
                left:
                  aggregate:
                    op: count
                    query:
                      query: tokensInZone
                      zone: $zone
                      filter:
                        - { prop: faction, eq: NVA }
                right: 0
        shaded:
          text: "Dong Xuan campaign-hot LZs: Select a Province with NVA Troops then remove a die roll of US Troops within 1 space of it to Casualties."
          targets:
            - id: $targetProvince
              selector:
                query: mapSpaces
                filter:
                  op: and
                  args:
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, eq: NVA }
                              - { prop: type, eq: troops }
                      right: 0
              cardinality: { max: 1 }
          effects:
            - rollRandom:
                bind: $iaDrangLossRoll
                min: 1
                max: 6
                in:
                  - removeByPriority:
                      budget: { ref: binding, name: $iaDrangLossRoll }
                      remainingBind: $remainingLosses
                      groups:
                        - bind: usTroopInProvince
                          over:
                            query: tokensInZone
                            zone: $targetProvince
                            filter:
                              - { prop: faction, eq: US }
                              - { prop: type, eq: troops }
                          to:
                            zoneExpr: casualties-US:none
                      in:
                        - forEach:
                            bind: $adjacentSpace
                            over:
                              query: adjacentZones
                              zone: $targetProvince
                            effects:
                              - if:
                                  when: { op: '>', left: { ref: binding, name: $remainingLosses }, right: 0 }
                                  then:
                                    - removeByPriority:
                                        budget: { ref: binding, name: $remainingLosses }
                                        remainingBind: $remainingLosses
                                        groups:
                                          - bind: usTroopAdjacent
                                            over:
                                              query: tokensInZone
                                              zone: $adjacentSpace
                                              filter:
                                                - { prop: faction, eq: US }
                                                - { prop: type, eq: troops }
                                            to:
                                              zoneExpr: casualties-US:none
                                  else: []
      - id: card-79
        title: Henry Cabot Lodge
        sideMode: dual
        order: 79
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["ARVN", "NVA", "VC", "US"]
          flavorText: "Ambassador proposes US protectorate."
        unshaded:
          text: "Aid +20."
          effects:
            - addVar: { scope: global, var: aid, delta: 20 }
        shaded:
          text: "Internecine enabler: Remove up to 3 ARVN pieces. Patronage +2 for each. ARVN Ineligible through next card."
          eligibilityOverrides:
            - { target: { kind: seat, seat: 'ARVN' }, eligible: false, windowId: make-ineligible }
          effects:
            - chooseN:
                bind: $arvnPiecesToRemove
                options:
                  query: tokensInMapSpaces
                  filter:
                    - { prop: faction, eq: ARVN }
                min: 0
                max: 3
            - forEach:
                bind: $arvnPiece
                over: { query: binding, name: $arvnPiecesToRemove }
                effects:
                  - moveToken:
                      token: $arvnPiece
                      from: { zoneExpr: { ref: tokenZone, token: $arvnPiece } }
                      to: { zoneExpr: available-ARVN:none }
                countBind: $removedCount
                in:
                  - addVar:
                      scope: global
                      var: patronage
                      delta:
                        op: "*"
                        left: 2
                        right: { ref: binding, name: $removedCount }
      - id: card-107
        title: Burning Bonze
        sideMode: dual
        order: 107
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["VC", "NVA", "ARVN", "US"]
          flavorText: "Gruesome protests close elite ranks."
        unshaded:
          text: "Patronage +3 or, if Saigon at Active Support, +6."
          effects:
            - if:
                when:
                  op: "=="
                  left: { ref: markerState, space: saigon:none, marker: supportOpposition }
                  right: activeSupport
                then:
                  - addVar: { scope: global, var: patronage, delta: 6 }
                else:
                  - addVar: { scope: global, var: patronage, delta: 3 }
        shaded:
          text: "Anti-regime self-immolation: Shift Saigon 1 level toward Active Opposition. Aid -12."
          effects:
            - shiftMarker:
                space: saigon:none
                marker: supportOpposition
                delta: -1
            - addVar: { scope: global, var: aid, delta: -12 }
      - id: card-112
        title: Colonel Chau
        sideMode: dual
        order: 112
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["VC", "ARVN", "US", "NVA"]
          flavorText: "Census-grievance teams."
        unshaded:
          text: "Place 1 Police into each of 6 Provinces."
          targets:
            - id: $targetProvince
              selector:
                query: mapSpaces
              cardinality: { max: 6 }
          effects:
            - removeByPriority:
                budget: 6
                groups:
                  - bind: police
                    over:
                      query: tokensInZone
                      zone: available-ARVN:none
                      filter:
                        - { prop: faction, eq: ARVN }
                        - { prop: type, eq: police }
                    to:
                      zoneExpr: $targetProvince
        shaded:
          text: "Local Viet Minh tradition: Shift 3 Provinces with ARVN each 1 level toward Active Opposition. Place a VC Guerrilla in each."
          targets:
            - id: $targetProvince
              selector:
                query: mapSpaces
              cardinality: { max: 3 }
          effects:
            - shiftMarker:
                space: $targetProvince
                marker: supportOpposition
                delta: -1
            - removeByPriority:
                budget: 3
                groups:
                  - bind: guerrilla
                    over:
                      query: tokensInZone
                      zone: available-VC:none
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetProvince
      - id: card-55
        title: Trucks
        sideMode: dual
        order: 55
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["NVA", "VC", "US", "ARVN"]
          flavorText: "Logistics under pressure."
        unshaded:
          text: "Degrade Trail 2 boxes. NVA selects and removes 4 of its pieces each from Laos and Cambodia."
          effects:
            # 1. Trail degrades 2 boxes
            - addVar: { scope: global, var: trail, delta: -2 }
            # 2. NVA selects up to 4 of its pieces from ALL Laos spaces
            - chooseN:
                bind: $nvaLaosPieces
                options:
                  query: tokensInMapSpaces
                  spaceFilter:
                    op: '=='
                    left: { ref: zoneProp, zone: $zone, prop: country }
                    right: laos
                  filter:
                    - { prop: faction, eq: NVA }
                min: 0
                max: 4
            - forEach:
                bind: $nvaLaosPiece
                over: { query: binding, name: $nvaLaosPieces }
                effects:
                  - moveToken:
                      token: $nvaLaosPiece
                      from: { zoneExpr: { ref: tokenZone, token: $nvaLaosPiece } }
                      to: { zoneExpr: available-NVA:none }
            # 3. NVA selects up to 4 of its pieces from ALL Cambodia spaces
            - chooseN:
                bind: $nvaCambodiaPieces
                options:
                  query: tokensInMapSpaces
                  spaceFilter:
                    op: '=='
                    left: { ref: zoneProp, zone: $zone, prop: country }
                    right: cambodia
                  filter:
                    - { prop: faction, eq: NVA }
                min: 0
                max: 4
            - forEach:
                bind: $nvaCambodiaPiece
                over: { query: binding, name: $nvaCambodiaPieces }
                effects:
                  - moveToken:
                      token: $nvaCambodiaPiece
                      from: { zoneExpr: { ref: tokenZone, token: $nvaCambodiaPiece } }
                      to: { zoneExpr: available-NVA:none }
        shaded:
          text: "Add twice Trail value to each NVA and VC Resources. NVA moves its unTunneled Bases anywhere within Laos/Cambodia."
          effects:
            # 1. Add 2 * Trail to both NVA and VC Resources
            - let:
                bind: $trailBonus
                value: { op: '*', left: 2, right: { ref: gvar, var: trail } }
                in:
                  - addVar: { scope: global, var: nvaResources, delta: { ref: binding, name: $trailBonus } }
                  - addVar: { scope: global, var: vcResources, delta: { ref: binding, name: $trailBonus } }
            # 2. NVA repositions each unTunneled Base within Laos/Cambodia
            - forEach:
                bind: $nvaBase
                over:
                  query: tokensInMapSpaces
                  spaceFilter:
                    op: or
                    args:
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                      - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
                  filter:
                    - { prop: faction, eq: NVA }
                    - { prop: type, eq: base }
                    - { prop: tunnel, eq: untunneled }
                effects:
                  - chooseOne:
                      bind: '$baseDestination@{$nvaBase}'
                      options:
                        query: mapSpaces
                        filter:
                          op: or
                          args:
                            - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: laos }
                            - { op: '==', left: { ref: zoneProp, zone: $zone, prop: country }, right: cambodia }
                  - moveToken:
                      token: $nvaBase
                      from: { zoneExpr: { ref: tokenZone, token: $nvaBase } }
                      to: { zoneExpr: { ref: binding, name: '$baseDestination@{$nvaBase}' } }
      - id: card-97
        title: Brinks Hotel
        sideMode: dual
        order: 97
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["VC", "US", "ARVN", "NVA"]
          flavorText: "Saigon shaken."
        unshaded:
          text: "Aid +10, or 4 Patronage to ARVN Resources. Flip any current RVN leader card: its text is ignored."
          branches:
            - id: aid-plus-ten-and-flip-leader
              order: 1
              effects:
                - addVar: { scope: global, var: aid, delta: 10 }
                - if:
                    when:
                      op: '!='
                      left: { ref: globalMarkerState, marker: activeLeader }
                      right: minh
                    then:
                      - setGlobalMarker: { marker: leaderFlipped, state: flipped }
            - id: transfer-patronage-to-aid-and-flip-leader
              order: 2
              effects:
                - let:
                    bind: $transfer
                    value:
                      if:
                        when: { op: '>', left: { ref: gvar, var: patronage }, right: 4 }
                        then: 4
                        else: { ref: gvar, var: patronage }
                    in:
                      - addVar:
                          scope: global
                          var: patronage
                          delta:
                            op: '-'
                            left: 0
                            right: { ref: binding, name: $transfer }
                      - addVar:
                          scope: global
                          var: aid
                          delta: { ref: binding, name: $transfer }
                - if:
                    when:
                      op: '!='
                      left: { ref: globalMarkerState, marker: activeLeader }
                      right: minh
                    then:
                      - setGlobalMarker: { marker: leaderFlipped, state: flipped }
        shaded:
          text: "Shift a City that has VC by 2 levels toward Active Opposition and add a Terror marker there."
          targets:
            - id: $targetCity
              selector:
                query: mapSpaces
                filter:
                  op: 'and'
                  args:
                    - op: '=='
                      left: { ref: zoneProp, zone: $zone, prop: category }
                      right: city
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter: [{ prop: faction, eq: VC }]
                      right: 0
              cardinality: { max: 1 }
          effects:
            - shiftMarker:
                space: $targetCity
                marker: supportOpposition
                delta: -2
            - addVar: { scope: zoneVar, zone: $targetCity, var: terrorCount, delta: 1 }
            - addVar: { scope: global, var: terrorSabotageMarkersPlaced, delta: 1 }
      - id: card-95
        title: Westmoreland
        sideMode: dual
        order: 95
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["VC", "US", "NVA", "ARVN"]
          flavorText: "Root 'em out."
        unshaded:
          text: "US free Air Lifts, then Sweeps (no moves) or Assaults (no ARVN) in 2 spaces, then Air Strikes."
          freeOperationGrants:
            - seat: "US"
              sequence: { chain: westmoreland-us, step: 0 }
              operationClass: operation
              actionIds: [airLift]
            - seat: "US"
              sequence: { chain: westmoreland-us, step: 1 }
              operationClass: operation
              actionIds: [sweep, assault]
            - seat: "US"
              sequence: { chain: westmoreland-us, step: 2 }
              operationClass: operation
              actionIds: [airStrike]
        shaded:
          text: "Big-unit war bypasses population: Shift 3 Provinces with no Police each 2 levels toward Active Opposition."
      - id: card-98
        title: Long Tan
        sideMode: dual
        order: 98
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["VC", "US", "ARVN", "NVA"]
          flavorText: "Royal Australians."
        unshaded:
          text: "Place 2 out-of-play US Troops into a Province or remove all Guerrillas from all Jungle with US Troops."
          branches:
            - id: long-tan-place-us-troops
              order: 1
              targets:
                - id: $targetProvince
                  selector:
                    query: mapSpaces
                    filter:
                      op: '=='
                      left: { ref: zoneProp, zone: $zone, prop: category }
                      right: province
                  cardinality: { max: 1 }
              effects:
                - removeByPriority:
                    budget: 2
                    groups:
                      - bind: usTroop
                        over:
                          query: tokensInZone
                          zone: out-of-play-US:none
                          filter:
                            - { prop: faction, eq: US }
                            - { prop: type, eq: troops }
                        to:
                          zoneExpr: $targetProvince
            - id: long-tan-clear-jungle-guerrillas
              order: 2
              targets:
                - id: $targetJungle
                  selector:
                    query: mapSpaces
                    filter:
                      op: and
                      args:
                        - { op: zonePropIncludes, zone: $zone, prop: terrainTags, value: jungle }
                        - op: '>'
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  - { prop: faction, eq: US }
                                  - { prop: type, eq: troops }
                          right: 0
                  cardinality: { max: 1 }
              effects:
                - removeByPriority:
                    budget: 99
                    groups:
                      - bind: insurgentGuerrilla
                        over:
                          query: tokensInZone
                          zone: $targetJungle
                          filter:
                            - { prop: faction, op: in, value: ['NVA', 'VC'] }
                            - { prop: type, eq: guerrilla }
                        to:
                          zoneExpr: { concat: ['available-', { ref: tokenProp, token: $insurgentGuerrilla, prop: faction }, ':none'] }
        shaded:
          text: "VC strike newly arrived troops: 1 US Base and 1 US Troop in a Jungle with 2+ VC Guerrillas to Casualties."
          targets:
            - id: $targetJungle
              selector:
                query: mapSpaces
                filter:
                  op: and
                  args:
                    - { op: zonePropIncludes, zone: $zone, prop: terrainTags, value: jungle }
                    - op: '>='
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, eq: VC }
                              - { prop: type, eq: guerrilla }
                      right: 2
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: usBase
                    over:
                      query: tokensInZone
                      zone: $targetJungle
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: base }
                    to:
                      zoneExpr: casualties-US:none
                  - bind: usTroop
                    over:
                      query: tokensInZone
                      zone: $targetJungle
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: casualties-US:none
      - id: card-99
        title: Masher/White Wing
        sideMode: dual
        order: 99
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["VC", "US", "ARVN", "NVA"]
          flavorText: "Sweep flushes enemy into kill zone."
        unshaded:
          text: "US or ARVN free Sweeps 1 non-Jungle space with US and ARVN Troops. They free Assault as US."
          freeOperationGrants:
            - seat: "US"
              sequence: { chain: masher-white-wing-us, step: 0 }
              operationClass: operation
              actionIds: [sweep]
            - seat: "US"
              sequence: { chain: masher-white-wing-us, step: 1 }
              operationClass: operation
              actionIds: [assault]
            - seat: "ARVN"
              executeAsSeat: "US"
              sequence: { chain: masher-white-wing-arvn-as-us, step: 0 }
              operationClass: operation
              actionIds: [sweep]
            - seat: "ARVN"
              executeAsSeat: "US"
              sequence: { chain: masher-white-wing-arvn-as-us, step: 1 }
              operationClass: operation
              actionIds: [assault]
        shaded:
          text: "Poor OPSEC: VC or NVA free March Guerrillas to any 3 spaces then free Ambush in each (even if Active)."
      - id: card-100
        title: Rach Ba Rai
        sideMode: dual
        order: 100
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["VC", "US", "ARVN", "NVA"]
          flavorText: "Riverines hunt Charlie."
        unshaded:
          text: "Remove all VC or all non-Troop NVA from a Lowland with US Troops."
          branches:
            - id: rach-ba-rai-remove-vc
              order: 1
              targets:
                - id: $targetLowland
                  selector:
                    query: mapSpaces
                    filter:
                      op: and
                      args:
                        - { op: zonePropIncludes, zone: $zone, prop: terrainTags, value: lowland }
                        - op: '>'
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  - { prop: faction, eq: US }
                                  - { prop: type, eq: troops }
                          right: 0
                  cardinality: { max: 1 }
              effects:
                - removeByPriority:
                    budget: 99
                    groups:
                      - bind: vcPiece
                        over:
                          query: tokensInZone
                          zone: $targetLowland
                          filter:
                            - { prop: faction, eq: VC }
                        to:
                          zoneExpr: available-VC:none
            - id: rach-ba-rai-remove-nva-non-troops
              order: 2
              targets:
                - id: $targetLowland
                  selector:
                    query: mapSpaces
                    filter:
                      op: and
                      args:
                        - { op: zonePropIncludes, zone: $zone, prop: terrainTags, value: lowland }
                        - op: '>'
                          left:
                            aggregate:
                              op: count
                              query:
                                query: tokensInZone
                                zone: $zone
                                filter:
                                  - { prop: faction, eq: US }
                                  - { prop: type, eq: troops }
                          right: 0
                  cardinality: { max: 1 }
              effects:
                - removeByPriority:
                    budget: 99
                    groups:
                      - bind: nvaPiece
                        over:
                          query: tokensInZone
                          zone: $targetLowland
                          filter:
                            - { prop: faction, eq: NVA }
                            - { prop: type, op: in, value: [base, guerrilla] }
                        to:
                          zoneExpr: available-NVA:none
        shaded:
          text: "VC river ambush: In a Lowland with any VC, remove a die roll of US/ARVN cubes (US to Casualties). Place 1 VC piece."
          targets:
            - id: $targetLowland
              selector:
                query: mapSpaces
                filter:
                  op: and
                  args:
                    - { op: zonePropIncludes, zone: $zone, prop: terrainTags, value: lowland }
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, eq: VC }
                      right: 0
              cardinality: { max: 1 }
          effects:
            - rollRandom:
                bind: $dieRoll
                min: 1
                max: 6
                in:
                  - removeByPriority:
                      budget: { ref: binding, name: $dieRoll }
                      groups:
                        - bind: usCube
                          over:
                            query: tokensInZone
                            zone: $targetLowland
                            filter:
                              - { prop: faction, eq: US }
                              - { prop: type, op: in, value: [troops, police] }
                          to:
                            zoneExpr: casualties-US:none
                        - bind: arvnCube
                          over:
                            query: tokensInZone
                            zone: $targetLowland
                            filter:
                              - { prop: faction, eq: ARVN }
                              - { prop: type, op: in, value: [troops, police] }
                          to:
                            zoneExpr: available-ARVN:none
            - removeByPriority:
                budget: 1
                groups:
                  - bind: vcPiece
                    over:
                      query: tokensInZone
                      zone: available-VC:none
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, op: in, value: [base, guerrilla] }
                    to:
                      zoneExpr: $targetLowland
      - id: card-102
        title: Cu Chi
        sideMode: dual
        order: 102
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["VC", "NVA", "US", "ARVN"]
          flavorText: "Clear and secure."
        unshaded:
          text: "Remove all Guerrillas from 1 space with a Tunnel and COIN Control."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 99
                groups:
                  - bind: insurgentGuerrilla
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $insurgentGuerrilla, prop: faction }, ':none'] }
        shaded:
          text: "Iron Triangle: Place Tunnel markers on each Insurgent Base in 1 Province. Place 1 NVA and 1 VC Guerrilla there."
          targets:
            - id: $targetProvince
              selector:
                query: mapSpaces
                filter:
                  op: '=='
                  left: { ref: zoneProp, zone: $zone, prop: category }
                  right: province
              cardinality: { max: 1 }
          effects:
            - forEach:
                bind: $insurgentBase
                over:
                  query: tokensInZone
                  zone: $targetProvince
                  filter:
                    - { prop: faction, op: in, value: ['NVA', 'VC'] }
                    - { prop: type, eq: base }
                effects:
                  - setTokenProp: { token: $insurgentBase, prop: tunnel, value: tunneled }
            - removeByPriority:
                budget: 1
                groups:
                  - bind: nvaGuerrilla
                    over:
                      query: tokensInZone
                      zone: available-NVA:none
                      filter:
                        - { prop: faction, eq: NVA }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetProvince
            - removeByPriority:
                budget: 1
                groups:
                  - bind: vcGuerrilla
                    over:
                      query: tokensInZone
                      zone: available-VC:none
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetProvince
      - id: card-104
        title: Main Force Bns
        sideMode: dual
        order: 104
        tags: [capability, VC]
        metadata:
          period: "1965"
          seatOrder: ["VC", "NVA", "US", "ARVN"]
          flavorText: "Larger footprints."
        unshaded:
          text: "Capability: March into Support/LoC Activates if moving plus non-Base COIN >1 (vice >3)."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_mainForceBns, markerState: unshaded }
        shaded:
          text: "Capability: 1 VC Ambush space may remove 2 enemy pieces."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_mainForceBns, markerState: shaded }
      - id: card-105
        title: Rural Pressure
        sideMode: dual
        order: 105
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["VC", "NVA", "US", "ARVN"]
          flavorText: "Onerous VC taxation."
        unshaded:
          text: "Shift 4 Provinces with any VC each by 1 level toward Active Support."
          targets:
            - id: $targetProvince
              selector:
                query: mapSpaces
                filter:
                  op: and
                  args:
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, eq: VC }
                      right: 0
              cardinality: { max: 4 }
          effects:
            - macro: shift-support-opposition
              args: { space: $targetProvince, deltaExpr: 1 }
        shaded:
          text: "Local government corruption: Shift 3 Provinces with Police each by 1 level toward Active Opposition. Patronage +6 or -6."
          targets:
            - id: $targetProvince
              selector:
                query: mapSpaces
                filter:
                  op: and
                  args:
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, eq: ARVN }
                              - { prop: type, eq: police }
                      right: 0
              cardinality: { max: 3 }
          branches:
            - id: rural-pressure-plus-patronage
              order: 1
              effects:
                - macro: shift-support-opposition
                  args: { space: $targetProvince, deltaExpr: -1 }
                - macro: add-global-var-delta
                  args: { varName: patronage, deltaExpr: 6 }
            - id: rural-pressure-minus-patronage
              order: 2
              effects:
                - macro: shift-support-opposition
                  args: { space: $targetProvince, deltaExpr: -1 }
                - macro: add-global-var-delta
                  args: { varName: patronage, deltaExpr: -6 }
      - id: card-106
        title: Binh Duong
        sideMode: single
        order: 106
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["VC", "NVA", "ARVN", "US"]
          flavorText: "Revolutionary land reform seeks traction in prosperous districts."
        unshaded:
          text: "In each of 2 Provinces adjacent to Saigon, shift Support/Opposition 1 level either direction and place a VC Guerrilla or Police."
          targets:
            - id: $targetProvince
              selector:
                query: mapSpaces
                filter:
                  op: and
                  args:
                    - { op: '==', left: { ref: zoneProp, zone: $zone, prop: category }, right: province }
                    - { op: adjacent, left: $zone, right: saigon:none }
              cardinality: { max: 2 }
          effects:
            - macro: shift-support-opposition
              args: { space: $targetProvince, deltaExpr: 1 }
            - removeByPriority:
                budget: 1
                groups:
                  - bind: vcGuerrilla
                    over:
                      query: tokensInZone
                      zone: available-VC:none
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetProvince
      - id: card-108
        title: Draft Dodgers
        sideMode: dual
        order: 108
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["VC", "NVA", "ARVN", "US"]
          flavorText: "Public furor sparks enlistment."
        unshaded:
          text: "If fewer than 3 Casualty pieces, 3 US Troops from out of play to Available."
          effects:
            - if:
                when:
                  op: '<'
                  left:
                    aggregate:
                      op: count
                      query:
                        query: tokensInZone
                        zone: casualties-US:none
                  right: 3
                then:
                  - removeByPriority:
                      budget: 3
                      groups:
                        - bind: usTroop
                          over:
                            query: tokensInZone
                            zone: out-of-play-US:none
                            filter:
                              - { prop: faction, eq: US }
                              - { prop: type, eq: troops }
                          to:
                            zoneExpr: available-US:none
                else: []
        shaded:
          text: "Recruiting sags: Move 1 US Troop per Casualty piece, to a maximum of 3, from Available to out-of-play."
          effects:
            - let:
                bind: $casualtyCount
                value:
                  aggregate:
                    op: count
                    query:
                      query: tokensInZone
                      zone: casualties-US:none
                in:
                  - let:
                      bind: $maxTroopsMoved
                      value:
                        if:
                          when: { op: '>', left: { ref: binding, name: $casualtyCount }, right: 3 }
                          then: 3
                          else: { ref: binding, name: $casualtyCount }
                      in:
                        - removeByPriority:
                            budget: { ref: binding, name: $maxTroopsMoved }
                            groups:
                              - bind: usTroop
                                over:
                                  query: tokensInZone
                                  zone: available-US:none
                                  filter:
                                    - { prop: faction, eq: US }
                                    - { prop: type, eq: troops }
                                to:
                                  zoneExpr: out-of-play-US:none
      - id: card-109
        title: Nguyen Huu Tho
        sideMode: dual
        order: 109
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["VC", "NVA", "ARVN", "US"]
          flavorText: "Party control of NLF draws anti-communist reaction."
        unshaded:
          text: "Shift each City with VC 1 level toward Active Support."
        shaded:
          text: "National Liberation Front leader: Place a VC base and a VC Guerrilla in Saigon. Stay Eligible."
          eligibilityOverrides:
            - { target: { kind: active }, eligible: true, windowId: remain-eligible }
      - id: card-114
        title: Tri Quang
        sideMode: dual
        order: 114
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["VC", "ARVN", "US", "NVA"]
          flavorText: "Buddhists counter Communists."
        unshaded:
          text: "Set up to 3 Neutral or Opposition Cities to Passive Support."
          targets:
            - id: $targetCity
              selector:
                query: mapSpaces
                filter:
                  op: '=='
                  left: { ref: zoneProp, zone: $zone, prop: category }
                  right: city
              cardinality: { max: 3 }
          effects:
            - setMarker:
                space: $targetCity
                marker: supportOpposition
                state: passiveSupport
        shaded:
          text: "People's Revolutionary Committee: Shift Hue, Da Nang, and Saigon 1 level toward Active Opposition. Place a VC piece in Saigon."
          effects:
            - macro: shift-support-opposition
              args: { space: hue:none, deltaExpr: -1 }
            - macro: shift-support-opposition
              args: { space: da-nang:none, deltaExpr: -1 }
            - macro: shift-support-opposition
              args: { space: saigon:none, deltaExpr: -1 }
            - removeByPriority:
                budget: 1
                groups:
                  - bind: vcPiece
                    over:
                      query: tokensInZone
                      zone: available-VC:none
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, op: in, value: [base, guerrilla] }
                    to:
                      zoneExpr: saigon:none
      - id: card-116
        title: Cadres
        sideMode: dual
        order: 116
        tags: [capability, VC]
        metadata:
          period: "1964"
          seatOrder: ["VC", "ARVN", "NVA", "US"]
          flavorText: "Manpower to political sections."
        unshaded:
          text: "Capability: VC to Terror or Agitate must remove 2 VC Guerrillas per space."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_cadres, markerState: unshaded }
        shaded:
          text: "Capability: VC Rally in 1 space where VC already had a Base may Agitate as if Support Phase even if COIN Control."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_cadres, markerState: shaded }
      - id: card-75
        title: Sihanouk
        sideMode: dual
        order: 75
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["ARVN", "NVA", "US", "VC"]
          flavorText: "Cambodian maneuvering."
        unshaded:
          text: "ARVN free Sweep or Assault in Cambodia."
          freeOperationGrants:
            - seat: "ARVN"
              sequence: { chain: sihanouk-unshaded-arvn, step: 0 }
              operationClass: operation
              actionIds: [sweep, assault]
              zoneFilter:
                op: '=='
                left: { ref: zoneProp, zone: $zone, prop: country }
                right: cambodia
        shaded:
          text: "VC then NVA each get a free operation."
          freeOperationGrants:
            - seat: "VC"
              sequence: { chain: sihanouk-shaded-vc-nva, step: 0 }
              operationClass: operation
            - seat: "NVA"
              sequence: { chain: sihanouk-shaded-vc-nva, step: 1 }
              operationClass: operation
      - id: card-51
        title: 301st Supply Bn
        sideMode: dual
        order: 51
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["NVA", "VC", "US", "ARVN"]
          flavorText: "Throughput under strain."
        unshaded:
          text: "Remove non-base Insurgents outside South Vietnam."
          targets:
            - id: $outsideSouthSpace
              selector:
                query: mapSpaces
                filter:
                  op: '!='
                  left: { ref: zoneProp, zone: $zone, prop: country }
                  right: southVietnam
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: nvaTroops
                    over:
                      query: tokensInZone
                      zone: $outsideSouthSpace
                      filter:
                        - { prop: faction, eq: NVA }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: available-NVA:none
                  - bind: nvaGuerrilla
                    over:
                      query: tokensInZone
                      zone: $outsideSouthSpace
                      filter:
                        - { prop: faction, eq: NVA }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: available-NVA:none
                  - bind: vcGuerrilla
                    over:
                      query: tokensInZone
                      zone: $outsideSouthSpace
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: available-VC:none
        shaded:
          text: "Improve Trail 1 box and add NVA Resources equal to a die roll."
          effects:
            - addVar: { scope: global, var: trail, delta: 1 }
            - rollRandom:
                bind: $dieRoll
                min: 1
                max: 6
                in:
                  - addVar:
                      scope: global
                      var: nvaResources
                      delta: { ref: binding, name: $dieRoll }
      - id: card-101
        title: Booby Traps
        sideMode: dual
        order: 101
        tags: [capability, VC]
        metadata:
          period: "1964"
          seatOrder: ["VC", "NVA", "US", "ARVN"]
          flavorText: "Preparations tip off enemy."
        unshaded:
          text: "VC and NVA Ambush in max 1 space."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_boobyTraps, markerState: unshaded }
        shaded:
          text: "Mines and punji: each Sweep space risks 1 Sweeping Troop loss on roll 1-3."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_boobyTraps, markerState: shaded }
      - id: card-17
        title: Claymores
        sideMode: dual
        order: 17
        tags: [momentum]
        metadata:
          period: "1964"
          seatOrder: ["US", "ARVN", "VC", "NVA"]
          flavorText: "Perimeter."
        unshaded:
          text: "Stay Eligible. Until Coup, no Ambush; remove 1 Guerrilla from each Marching group that Activates."
          eligibilityOverrides:
            - { target: { kind: active }, eligible: true, windowId: remain-eligible }
          lastingEffects:
            - id: mom-claymores
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_claymores }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_claymores }
        shaded:
          text: "Infiltrators turn mines around: remove 1 COIN Base and 1 Underground Insurgent from a space with both."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
                filter:
                  op: and
                  args:
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, op: in, value: ['US', 'ARVN'] }
                              - { prop: type, eq: base }
                      right: 0
                    - op: '>'
                      left:
                        aggregate:
                          op: count
                          query:
                            query: tokensInZone
                            zone: $zone
                            filter:
                              - { prop: faction, op: in, value: ['NVA', 'VC'] }
                              - { prop: type, eq: guerrilla }
                              - { prop: activity, eq: underground }
                      right: 0
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: targetCoinBase
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, op: in, value: ['US', 'ARVN'] }
                        - { prop: type, eq: base }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $targetCoinBase, prop: faction }, ':none'] }
                  - bind: targetInsurgent
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                        - { prop: type, eq: guerrilla }
                        - { prop: activity, eq: underground }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $targetInsurgent, prop: faction }, ':none'] }
      - id: card-15
        title: Medevac
        sideMode: dual
        order: 15
        tags: [momentum]
        metadata:
          period: "1964"
          seatOrder: ["US", "ARVN", "NVA", "VC"]
          flavorText: "Helicopter evacuation doctrine expands."
        unshaded:
          text: "Through Coup, all Troop casualties return to Available."
          lastingEffects:
            - id: mom-medevac-unshaded
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_medevacUnshaded }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_medevacUnshaded }
        shaded:
          text: "Through Coup, US Troop casualties remain unavailable."
          lastingEffects:
            - id: mom-medevac-shaded
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_medevacShaded }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_medevacShaded }
      - id: card-26
        title: LRRP
        sideMode: dual
        order: 26
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["US", "VC", "ARVN", "NVA"]
          flavorText: "Long-range reconnaissance patrols probe deep."
        unshaded:
          text: "Place up to 2 Irregulars, then US executes free Air Strike."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: irregular
                    over:
                      query: tokensInZone
                      zone: available-US:none
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: irregular }
                    to:
                      zoneExpr: $targetSpace
          freeOperationGrants:
            - seat: "US"
              sequence: { chain: lrrp-us-airstrike, step: 0 }
              operationClass: operation
              actionIds: [airStrike]
        shaded:
          text: "Counterintelligence sweep: remove up to 2 Irregulars to Available."
          targets:
            - id: $sourceSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: irregular
                    over:
                      query: tokensInZone
                      zone: $sourceSpace
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: irregular }
                    to:
                      zoneExpr: available-US:none
      - id: card-29
        title: Tribesmen
        sideMode: dual
        order: 29
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["US", "VC", "ARVN", "NVA"]
          flavorText: "Highland loyalties shift under pressure."
        unshaded:
          text: "Remove Insurgent Guerrillas, then replace with Irregulars."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: insurgentGuerrilla
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $insurgentGuerrilla, prop: faction }, ':none'] }
            - removeByPriority:
                budget: 2
                groups:
                  - bind: irregular
                    over:
                      query: tokensInZone
                      zone: available-US:none
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: irregular }
                    to:
                      zoneExpr: $targetSpace
        shaded:
          text: "Montagnard backlash: remove Irregulars and infiltrate Guerrillas."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: irregular
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: irregular }
                    to:
                      zoneExpr: available-US:none
            - removeByPriority:
                budget: 2
                groups:
                  - bind: nvaGuerrilla
                    over:
                      query: tokensInZone
                      zone: available-NVA:none
                      filter:
                        - { prop: faction, eq: NVA }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetSpace
      - id: card-30
        title: USS New Jersey
        sideMode: dual
        order: 30
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["US", "VC", "ARVN", "NVA"]
          flavorText: "Battleship fire support pounds coastal positions."
        unshaded:
          text: "US executes free Air Strikes in coastal spaces."
        shaded:
          text: "Counterfire and dispersion blunt naval bombardment."
      - id: card-31
        title: AAA
        sideMode: dual
        order: 31
        tags: [capability, NVA]
        metadata:
          period: "1964"
          seatOrder: ["NVA", "US", "ARVN", "VC"]
          flavorText: "Air defense guns thicken around infiltration routes."
        unshaded:
          text: "NVA capability: Rally Trail improvement restricted."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_aaa, markerState: unshaded }
        shaded:
          text: "NVA capability (shaded): air defense suppresses COIN air power."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_aaa, markerState: shaded }
      - id: card-32
        title: Long Range Guns
        sideMode: dual
        order: 32
        tags: [capability, NVA]
        metadata:
          period: "1968"
          seatOrder: ["NVA", "US", "ARVN", "VC"]
          flavorText: "Long-range artillery extends pressure across contested routes."
        unshaded:
          text: "NVA capability: Bombard can target adjacent spaces from farther range."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_longRangeGuns, markerState: unshaded }
        shaded:
          text: "NVA capability (shaded): COIN movement near artillery zones risks attrition."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_longRangeGuns, markerState: shaded }
      - id: card-33
        title: MiGs
        sideMode: dual
        order: 33
        tags: [capability, NVA]
        metadata:
          period: "1968"
          seatOrder: ["NVA", "US", "ARVN", "VC"]
          flavorText: "Interceptors contest US air power over the North."
        unshaded:
          text: "NVA capability: Air Strike pressure is reduced unless unshaded Top Gun is active."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_migs, markerState: unshaded }
        shaded:
          text: "NVA capability (shaded): US Air Strike can trigger extra troop costs in affected spaces."
          effects:
            - if:
                when: { op: '==', left: { ref: globalMarkerState, marker: cap_topGun }, right: unshaded }
                then:
                  - macro: set-global-marker
                    args: { markerId: cap_migs, markerState: inactive }
                else:
                  - macro: set-global-marker
                    args: { markerId: cap_migs, markerState: shaded }
      - id: card-35
        title: Thanh Hoa
        sideMode: dual
        order: 35
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["NVA", "US", "ARVN", "VC"]
          flavorText: "Air-defense concentration blunts repeated bridge attacks."
        unshaded:
          text: "NVA fortifies logistics corridor resilience around Trail adjustments."
        shaded:
          text: "Strike disruption causes COIN losses and protects northern throughput."
      - id: card-36
        title: Hamburger Hill
        sideMode: dual
        order: 36
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["NVA", "US", "VC", "ARVN"]
          flavorText: "A brutal highland battle drives force repositioning and tunnel pressure."
        unshaded:
          text: "Reposition selected NVA/VC forces and intensify pressure against exposed COIN units."
        shaded:
          text: "COIN assault gains ground but incurs attrition and tunnel-side effects."
      - id: card-37
        title: Khe Sanh
        sideMode: dual
        order: 37
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["NVA", "US", "VC", "ARVN"]
          flavorText: "Siege operations force major commitment and casualties."
        unshaded:
          text: "Mass removal pressure in one contested area; route vulnerable US losses to Casualties."
        shaded:
          text: "Relief effort redistributes pieces and partially relieves siege pressure."
      - id: card-40
        title: PoWs
        sideMode: dual
        order: 40
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["NVA", "US", "VC", "ARVN"]
          flavorText: "Prisoner exchanges and detention politics alter casualty flows."
        unshaded:
          text: "Move selected Casualties and adjust resources based on exchange outcomes."
        shaded:
          text: "Captivity leverage deepens COIN attrition and slows force recovery."
      - id: card-41
        title: Bombing Pause
        sideMode: dual
        order: 41
        tags: [momentum]
        metadata:
          period: "1968"
          seatOrder: ["NVA", "ARVN", "US", "VC"]
          flavorText: "Air campaign pauses shift tempo across infiltration and support tracks."
        unshaded:
          text: "No Air Strike until Coup. MOMENTUM"
          lastingEffects:
            - id: mom-bombing-pause
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_bombingPause }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_bombingPause }
        shaded:
          text: "Pause collapses: US resumes heavy air pressure and NVA pays strategic costs."
      - id: card-42
        title: Chou En Lai
        sideMode: dual
        order: 42
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["NVA", "ARVN", "US", "VC"]
          flavorText: "Chinese leverage links diplomacy to wartime resource shifts."
        unshaded:
          text: "Resource shifts follow diplomatic signaling and die-based political momentum."
        shaded:
          text: "Diplomatic friction disrupts aid flows and rebalances insurgent support."
      - id: card-45
        title: PT-76
        sideMode: dual
        order: 45
        tags: [capability, NVA]
        metadata:
          period: "1968"
          seatOrder: ["NVA", "ARVN", "US", "VC"]
          flavorText: "Amphibious armor expands NVA assault options in difficult terrain."
        unshaded:
          text: "NVA capability: selected Assaults gain armored removal pressure."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_pt76, markerState: unshaded }
        shaded:
          text: "NVA capability (shaded): armored commitments increase NVA troop exposure."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_pt76, markerState: shaded }
      - id: card-49
        title: Russian Arms
        sideMode: dual
        order: 49
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["NVA", "ARVN", "VC", "US"]
          flavorText: "External materiel shipments increase insurgent placement flexibility."
        unshaded:
          text: "Place NVA/VC pieces into eligible spaces and improve insurgent posture."
        shaded:
          text: "Arms pipeline disruption limits placement and redirects strategic effort."
      - id: card-52
        title: RAND
        sideMode: dual
        order: 52
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["NVA", "VC", "US", "ARVN"]
          flavorText: "Analyst leaks expose hidden assumptions and reverse perceived advantages."
        unshaded:
          text: "Flip one currently active capability to its opposite side."
          effects:
            - chooseOne:
                bind: $randCapabilityMarker
                options:
                  query: globalMarkers
                  states: [unshaded, shaded]
            - flipGlobalMarker:
                marker: { ref: binding, name: $randCapabilityMarker }
                stateA: unshaded
                stateB: shaded
        shaded:
          text: "Flip one currently active capability to its opposite side."
          effects:
            - chooseOne:
                bind: $randCapabilityMarker
                options:
                  query: globalMarkers
                  states: [unshaded, shaded]
            - flipGlobalMarker:
                marker: { ref: binding, name: $randCapabilityMarker }
                stateA: unshaded
                stateB: shaded
      - id: card-54
        title: Son Tay
        sideMode: dual
        order: 54
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["NVA", "VC", "US", "ARVN"]
          flavorText: "Raid planning reshapes near-term eligibility and initiative windows."
        unshaded:
          text: "Adjust next-card eligibility to favor COIN follow-on operations."
        shaded:
          text: "Raid aftermath shifts eligibility toward insurgent initiative."
      - id: card-57
        title: International Unrest
        sideMode: dual
        order: 57
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["NVA", "VC", "ARVN", "US"]
          flavorText: "Global pressure amplifies domestic war costs and casualty politics."
        unshaded:
          text: "Casualty-driven die roll reduces COIN political leverage."
        shaded:
          text: "External backlash constrains insurgent options and forces resource tradeoffs."
      - id: card-58
        title: Pathet Lao
        sideMode: dual
        order: 58
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["NVA", "VC", "ARVN", "US"]
          flavorText: "Laotian coordination alters trail security and redeployment pressure."
        unshaded:
          text: "Conditionally improve Trail or trigger selective redeploy effects."
        shaded:
          text: "Cross-border disruption degrades Trail tempo and complicates redeploy planning."
      - id: card-60
        title: War Photographer
        sideMode: dual
        order: 60
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["NVA", "VC", "ARVN", "US"]
          flavorText: "Images from the front alter force posture and political appetite."
        unshaded:
          text: "Place pieces from Out of Play into selected spaces."
        shaded:
          text: "Media backlash moves selected forces back out of theater."
      - id: card-61
        title: Armored Cavalry
        sideMode: dual
        order: 61
        tags: [capability, ARVN]
        metadata:
          period: "1968"
          seatOrder: ["ARVN", "US", "NVA", "VC"]
          flavorText: "Mechanized formations increase ARVN operational reach."
        unshaded:
          text: "ARVN capability: Armored columns improve ARVN mobile operation efficiency."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_armoredCavalry, markerState: unshaded }
        shaded:
          text: "ARVN capability (shaded): armored commitments create vulnerabilities around ARVN moves."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_armoredCavalry, markerState: shaded }
      - id: card-62
        title: Cambodian Civil War
        sideMode: dual
        order: 62
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["ARVN", "US", "NVA", "VC"]
          flavorText: "Border conflict opens corridors for rapid intervention and disruption."
        unshaded:
          text: "COIN executes free Air Lift then free Sweep; remove one insurgent Base from Cambodia."
        shaded:
          text: "Regional escalation favors insurgents: remove one COIN Base from Cambodia."
      - id: card-65
        title: International Forces
        sideMode: dual
        order: 65
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["ARVN", "US", "NVA", "VC"]
          flavorText: "External contingents alter force availability and aid posture."
        unshaded:
          text: "Roll a die and move up to that many COIN pieces from Out of Play to Available."
        shaded:
          text: "Roll a die and reduce Aid by result."
      - id: card-71
        title: An Loc
        sideMode: dual
        order: 71
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["ARVN", "NVA", "US", "VC"]
          flavorText: "Urban defense at An Loc forces troop losses and emergency repositioning."
        unshaded:
          text: "Remove selected NVA Troops and place ARVN Troops in contested spaces."
        shaded:
          text: "ARVN losses mount; redeploy NVA pressure around An Loc."
      - id: card-74
        title: Lam Son 719
        sideMode: dual
        order: 74
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["ARVN", "NVA", "US", "VC"]
          flavorText: "Cross-border incursion strains ARVN logistics and Trail stability."
        unshaded:
          text: "Place ARVN Troops in Laos/Cambodia and degrade Trail by 1."
        shaded:
          text: "Operation falters: remove ARVN Troops and improve Trail by 1."
      - id: card-77
        title: Detente
        sideMode: dual
        order: 77
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["ARVN", "NVA", "VC", "US"]
          flavorText: "Great-power easing cools conflict intensity and shrinks wartime budgets."
        unshaded:
          text: "Cut ARVN, NVA, and VC Resources in half."
          effects:
            - setVar:
                scope: global
                var: arvnResources
                value: { op: '/', left: { ref: gvar, var: arvnResources }, right: 2 }
            - setVar:
                scope: global
                var: nvaResources
                value: { op: '/', left: { ref: gvar, var: nvaResources }, right: 2 }
            - setVar:
                scope: global
                var: vcResources
                value: { op: '/', left: { ref: gvar, var: vcResources }, right: 2 }
        shaded:
          text: "Cut ARVN, NVA, and VC Resources in half."
          effects:
            - setVar:
                scope: global
                var: arvnResources
                value: { op: '/', left: { ref: gvar, var: arvnResources }, right: 2 }
            - setVar:
                scope: global
                var: nvaResources
                value: { op: '/', left: { ref: gvar, var: nvaResources }, right: 2 }
            - setVar:
                scope: global
                var: vcResources
                value: { op: '/', left: { ref: gvar, var: vcResources }, right: 2 }
      - id: card-80
        title: Light at the End of the Tunnel
        sideMode: single
        order: 80
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["ARVN", "NVA", "VC", "US"]
          flavorText: "War-weariness and optimism collide in piecemeal force adjustments."
        unshaded:
          text: "Apply piece-by-piece force adjustments across factions as listed on the card."
      - id: card-84
        title: To Quoc
        sideMode: dual
        order: 84
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["ARVN", "VC", "US", "NVA"]
          flavorText: "Nationalist appeals drive local recruitment and police concentration."
        unshaded:
          text: "Place ARVN pieces by space and shift support where ARVN presence expands."
        shaded:
          text: "Insurgent counter-mobilization places guerrillas where ARVN policing is weak."
      - id: card-88
        title: Phan Quang Dan
        sideMode: dual
        order: 88
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["ARVN", "VC", "NVA", "US"]
          flavorText: "Political reforms in Saigon trade patronage for public support."
        unshaded:
          text: "Shift Saigon toward Support and adjust Patronage."
        shaded:
          text: "Shift Saigon toward Opposition and adjust Patronage."
      - id: card-91
        title: Bob Hope
        sideMode: dual
        order: 91
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["VC", "US", "NVA", "ARVN"]
          flavorText: "Show-tour logistics and media optics reshape force posture."
        unshaded:
          text: "Relocate US Troops among selected spaces and move matching losses to Casualties."
        shaded:
          text: "Show backlash strains US posture and increases casualty pressure."
      - id: card-92
        title: SEALORDS
        sideMode: dual
        order: 92
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["VC", "US", "NVA", "ARVN"]
          flavorText: "Riverine interdiction drives concentrated operations around the delta."
        unshaded:
          text: "US executes free Sweep then free Assault in/adjacent to Can Tho."
        shaded:
          text: "Interdiction overreach opens gaps for insurgent movement."
      - id: card-94
        title: Tunnel Rats
        sideMode: single
        order: 94
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["VC", "US", "NVA", "ARVN"]
          flavorText: "Close-quarters tunnel fighting shifts subterranean control."
        unshaded:
          text: "Place or remove a Tunnel marker in one selected space."
      - id: card-96
        title: APC
        sideMode: dual
        order: 96
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["VC", "US", "ARVN", "NVA"]
          flavorText: "Mechanized pacification pressure collides with insurgent shock timing."
        unshaded:
          text: "ARVN executes free Pacify in selected spaces."
        shaded:
          text: "If Tet Offensive has been played, return it to VC; otherwise VC executes General Uprising."
          effects:
            - if:
                when:
                  op: '>'
                  left:
                    aggregate:
                      op: count
                      query:
                        query: tokensInZone
                        zone: played:none
                        filter:
                          - { prop: cardId, eq: card-124 }
                  right: 0
                then:
                  - forEach:
                      bind: tetCard
                      over:
                        query: tokensInZone
                        zone: played:none
                        filter:
                          - { prop: cardId, eq: card-124 }
                      limit: 1
                      effects:
                        - moveToken:
                            token: tetCard
                            from: played:none
                            to: { zoneExpr: leader:none }
                else:
                  - grantFreeOperation:
                      seat: "VC"
                      operationClass: operation
                      actionIds: [operation]
      - id: card-103
        title: Kent State
        sideMode: dual
        order: 103
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["VC", "NVA", "US", "ARVN"]
          flavorText: "Domestic unrest converts battlefield casualties into political constraints."
        unshaded:
          text: "Move selected US Troops from map to Casualties."
        shaded:
          text: "US executes free Limited Operation under tightened domestic limits."
      - id: card-111
        title: Agent Orange
        sideMode: dual
        order: 111
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["VC", "ARVN", "US", "NVA"]
          flavorText: "Defoliation campaigns reveal insurgent networks while escalating costs."
        unshaded:
          text: "Flip selected Guerrillas to Active and execute free Air Strikes."
        shaded:
          text: "Chemical warfare backlash suppresses COIN momentum and favors insurgent recovery."
      - id: card-113
        title: Ruff Puff
        sideMode: dual
        order: 113
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["VC", "ARVN", "US", "NVA"]
          flavorText: "Regional force restructuring shifts police and militia composition."
        unshaded:
          text: "Place ARVN Police in selected spaces."
        shaded:
          text: "Replace selected ARVN pieces with Rangers in eligible spaces."
      - id: card-115
        title: Typhoon Kate
        sideMode: single
        order: 115
        tags: [momentum]
        metadata:
          period: "1968"
          seatOrder: ["VC", "ARVN", "US", "NVA"]
          flavorText: "Storm disruption constrains mobility and long-range support tempo."
        unshaded:
          text: "No Air Lift, Transport, or Bombard; remaining SAs to 1 space until Coup. MOMENTUM"
          lastingEffects:
            - id: mom-typhoon-kate
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_typhoonKate }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_typhoonKate }
      - id: card-117
        title: Corps Commanders
        sideMode: dual
        order: 117
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["VC", "ARVN", "NVA", "US"]
          flavorText: "Regional command intervention reallocates troops by political roll of the dice."
        unshaded:
          text: "ARVN places 3 of its Troops from out of play or Available into 1 or 2 adjacent spaces then free Sweeps each."
          effects:
            - setActivePlayer:
                player: "ARVN"
            - chooseOne:
                bind: $anchorSpace
                options:
                  query: mapSpaces
            - chooseN:
                bind: $adjacentSpace
                max: 1
                options:
                  query: adjacentZones
                  zone: $anchorSpace
            - chooseN:
                bind: $selectedTroops
                min:
                  op: min
                  left: 3
                  right:
                    aggregate:
                      op: count
                      query:
                        query: concat
                        sources:
                          - query: tokensInZone
                            zone: available-ARVN:none
                            filter:
                              - { prop: faction, eq: ARVN }
                              - { prop: type, eq: troops }
                          - query: tokensInZone
                            zone: out-of-play-ARVN:none
                            filter:
                              - { prop: faction, eq: ARVN }
                              - { prop: type, eq: troops }
                max:
                  op: min
                  left: 3
                  right:
                    aggregate:
                      op: count
                      query:
                        query: concat
                        sources:
                          - query: tokensInZone
                            zone: available-ARVN:none
                            filter:
                              - { prop: faction, eq: ARVN }
                              - { prop: type, eq: troops }
                          - query: tokensInZone
                            zone: out-of-play-ARVN:none
                            filter:
                              - { prop: faction, eq: ARVN }
                              - { prop: type, eq: troops }
                options:
                  query: concat
                  sources:
                    - query: tokensInZone
                      zone: available-ARVN:none
                      filter:
                        - { prop: faction, eq: ARVN }
                        - { prop: type, eq: troops }
                    - query: tokensInZone
                      zone: out-of-play-ARVN:none
                      filter:
                        - { prop: faction, eq: ARVN }
                        - { prop: type, eq: troops }
            - chooseN:
                bind: $troopsToAnchor
                max:
                  aggregate:
                    op: count
                    query:
                      query: binding
                      name: $selectedTroops
                options:
                  query: binding
                  name: $selectedTroops
            - forEach:
                bind: $troopToAnchor
                over:
                  query: binding
                  name: $troopsToAnchor
                effects:
                  - moveToken:
                      token: $troopToAnchor
                      from:
                        zoneExpr: { ref: tokenZone, token: $troopToAnchor }
                      to:
                        zoneExpr: { ref: binding, name: $anchorSpace }
            - if:
                when:
                  op: '>'
                  left:
                    aggregate:
                      op: count
                      query:
                        query: binding
                        name: $adjacentSpace
                  right: 0
                then:
                  - chooseOne:
                      bind: $selectedAdjacent
                      options:
                        query: binding
                        name: $adjacentSpace
                  - forEach:
                      bind: $troop
                      over:
                        query: binding
                        name: $selectedTroops
                      effects:
                        - if:
                            when:
                              op: not
                              arg:
                                op: in
                                item: { ref: binding, name: $troop }
                                set: { ref: binding, name: $troopsToAnchor }
                            then:
                              - moveToken:
                                  token: $troop
                                  from:
                                    zoneExpr: { ref: tokenZone, token: $troop }
                                  to:
                                    zoneExpr: { ref: binding, name: $selectedAdjacent }
                            else: []
                else:
                  - forEach:
                      bind: $troop
                      over:
                        query: binding
                        name: $selectedTroops
                      effects:
                        - if:
                            when:
                              op: not
                              arg:
                                op: in
                                item: { ref: binding, name: $troop }
                                set: { ref: binding, name: $troopsToAnchor }
                            then:
                              - moveToken:
                                  token: $troop
                                  from:
                                    zoneExpr: { ref: tokenZone, token: $troop }
                                  to:
                                    zoneExpr: { ref: binding, name: $anchorSpace }
                            else: []
            - setActivePlayer:
                player: actor
            - grantFreeOperation:
                seat: "ARVN"
                operationClass: operation
                actionIds: [sweep]
                zoneFilter:
                  op: '=='
                  left: $zone
                  right: '{$anchorSpace}'
            - forEach:
                bind: $adjSpace
                over:
                  query: binding
                  name: $adjacentSpace
                effects:
                  - grantFreeOperation:
                      seat: "ARVN"
                      operationClass: operation
                      actionIds: [sweep]
                      zoneFilter:
                        op: '=='
                        left: $zone
                        right: '{$adjSpace}'
        shaded:
          text: "Remove a die roll of ARVN pieces from 1 or 2 adjacent spaces. ARVN Ineligible through next card."
          eligibilityOverrides:
            - { target: { kind: seat, seat: 'ARVN' }, eligible: false, windowId: make-ineligible }
          effects:
            - chooseOne:
                bind: $anchorSpace
                options:
                  query: mapSpaces
            - chooseN:
                bind: $adjacentSpace
                max: 1
                options:
                  query: adjacentZones
                  zone: $anchorSpace
            - rollRandom:
                bind: $lossRoll
                min: 1
                max: 6
                in:
                  - removeByPriority:
                      budget: { ref: binding, name: $lossRoll }
                      remainingBind: $remainingLosses
                      groups:
                        - bind: arvnPieceInAnchor
                          over:
                            query: tokensInZone
                            zone: $anchorSpace
                            filter:
                              - { prop: faction, eq: ARVN }
                          to:
                            zoneExpr: available-ARVN:none
                      in:
                        - forEach:
                            bind: $adjSpace
                            over:
                              query: binding
                              name: $adjacentSpace
                            effects:
                              - if:
                                  when: { op: '>', left: { ref: binding, name: $remainingLosses }, right: 0 }
                                  then:
                                    - removeByPriority:
                                        budget: { ref: binding, name: $remainingLosses }
                                        remainingBind: $remainingLosses
                                        groups:
                                          - bind: arvnPieceInAdjacent
                                            over:
                                              query: tokensInZone
                                              zone: $adjSpace
                                              filter:
                                                - { prop: faction, eq: ARVN }
                                            to:
                                              zoneExpr: available-ARVN:none
                                  else: []
      - id: card-119
        title: My Lai
        sideMode: dual
        order: 119
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["VC", "ARVN", "NVA", "US"]
          flavorText: "Atrocity fallout drives opposition shifts and force repositioning."
        unshaded:
          text: "Shift selected spaces toward Opposition and place VC pieces."
        shaded:
          text: "Backlash weakens insurgent narrative and repositions COIN forces."
      - id: card-120
        title: US Press Corps
        sideMode: dual
        order: 120
        tags: []
        metadata:
          period: "1968"
          seatOrder: ["VC", "ARVN", "NVA", "US"]
          flavorText: "Media access changes where pressure can be concentrated or withdrawn."
        unshaded:
          text: "Conditionally move US pieces among selected spaces."
        shaded:
          text: "Media framing limits COIN movement and amplifies insurgent leverage."
      - id: card-34
        title: SA-2s
        sideMode: dual
        order: 34
        tags: [capability, NVA]
        metadata:
          period: "1965"
          seatOrder: ["NVA", "US", "ARVN", "VC"]
          flavorText: "Surface-to-air missiles tighten the northern shield."
        unshaded:
          text: "NVA capability: Air Strike can remove only 2 pieces in one selected space."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_sa2s, markerState: unshaded }
        shaded:
          text: "NVA capability (shaded): Air Strike losses can include US Troops when available."
          effects:
            - macro: set-global-marker
              args: { markerId: cap_sa2s, markerState: shaded }
      - id: card-38
        title: McNamara Line
        sideMode: single
        order: 38
        tags: [momentum]
        metadata:
          period: "1965"
          seatOrder: ["NVA", "US", "VC", "ARVN"]
          flavorText: "Barrier planning constrains infiltration routes."
        unshaded:
          text: "No Infiltrate or Trail Improvement until Coup. MOMENTUM"
          lastingEffects:
            - id: mom-mcnamara-line
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_mcnamaraLine }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_mcnamaraLine }
      - id: card-39
        title: Oriskany
        sideMode: dual
        order: 39
        tags: [momentum]
        metadata:
          period: "1965"
          seatOrder: ["NVA", "US", "VC", "ARVN"]
          flavorText: "Carrier deck fire disrupts strike tempo."
        unshaded:
          text: "Air Strike degrades Trail by 2 and lowers NVA Resources by 9."
        shaded:
          text: "No Trail degrade from Air Strike until Coup. MOMENTUM"
          lastingEffects:
            - id: mom-oriskany
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_oriskany }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_oriskany }
      - id: card-46
        title: 559th Transport Grp
        sideMode: dual
        order: 46
        tags: [momentum]
        metadata:
          period: "1965"
          seatOrder: ["NVA", "ARVN", "VC", "US"]
          flavorText: "Route command tightens corridor discipline."
        unshaded:
          text: "NVA Infiltrate to only 1 destination space through Coup. MOMENTUM"
          lastingEffects:
            - id: mom-559th-transport-grp
              duration: round
              setupEffects:
                - macro: set-global-flag-true
                  args: { varName: mom_559thTransportGrp }
              teardownEffects:
                - macro: set-global-flag-false
                  args: { varName: mom_559thTransportGrp }
        shaded:
          text: "US Aid -6 and NVA Resources +6."
          effects:
            - addVar: { scope: global, var: aid, delta: -6 }
            - addVar: { scope: global, var: nvaResources, delta: 6 }
      - id: card-47
        title: Chu Luc
        sideMode: dual
        order: 47
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["NVA", "ARVN", "VC", "US"]
          flavorText: "Main-force concentration accelerates in contested provinces."
        unshaded:
          text: "Place 3 NVA Troops into any spaces with NVA pieces."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
                filter:
                  op: '>'
                  left:
                    aggregate:
                      op: count
                      query:
                        query: tokensInZone
                        zone: $zone
                        filter:
                          - { prop: faction, eq: NVA }
                  right: 0
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: nvaTroop
                    over:
                      query: tokensInZone
                      zone: available-NVA:none
                      filter:
                        - { prop: faction, eq: NVA }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: $targetSpace
        shaded:
          text: "Place 2 VC Guerrillas into any spaces with VC pieces."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
                filter:
                  op: '>'
                  left:
                    aggregate:
                      op: count
                      query:
                        query: tokensInZone
                        zone: $zone
                        filter:
                          - { prop: faction, eq: VC }
                  right: 0
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: vcGuerrilla
                    over:
                      query: tokensInZone
                      zone: available-VC:none
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetSpace
      - id: card-53
        title: Sappers
        sideMode: dual
        order: 53
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["NVA", "VC", "US", "ARVN"]
          flavorText: "Shock teams probe base perimeters."
        unshaded:
          text: "Remove a COIN Base and up to 2 Troops from one selected space."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: coinBase
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, op: in, value: ['US', 'ARVN'] }
                        - { prop: type, eq: base }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $coinBase, prop: faction }, ':none'] }
                  - bind: coinTroop
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, op: in, value: ['US', 'ARVN'] }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $coinTroop, prop: faction }, ':none'] }
        shaded:
          text: "Remove 3 NVA/VC Guerrillas from one selected space."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: insurgentGuerrilla
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $insurgentGuerrilla, prop: faction }, ':none'] }
      - id: card-56
        title: Vo Nguyen Giap
        sideMode: dual
        order: 56
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["NVA", "VC", "ARVN", "US"]
          flavorText: "Operational tempo follows strategic concentration."
        unshaded:
          text: "NVA execute free March then free Attack."
          freeOperationGrants:
            - seat: "NVA"
              sequence: { chain: vo-nguyen-giap-nva, step: 0 }
              operationClass: operation
              actionIds: [march]
            - seat: "NVA"
              sequence: { chain: vo-nguyen-giap-nva, step: 1 }
              operationClass: operation
              actionIds: [attack]
        shaded:
          text: "NVA execute free March in up to 3 spaces, then 1 free Op or Special Activity in each."
      - id: card-59
        title: Plei Mei
        sideMode: dual
        order: 59
        tags: []
        metadata:
          period: "1965"
          seatOrder: ["NVA", "VC", "ARVN", "US"]
          flavorText: "Highland clashes force rapid tactical repositioning."
        unshaded:
          text: "Remove enemy pieces in one selected Highland and execute free March."
          freeOperationGrants:
            - seat: "NVA"
              sequence: { chain: plei-mei-nva, step: 0 }
              operationClass: operation
              actionIds: [march]
        shaded:
          text: "Remove COIN pieces in one selected Highland and execute free Attack."
          freeOperationGrants:
            - seat: "NVA"
              sequence: { chain: plei-mei-nva, step: 0 }
              operationClass: operation
              actionIds: [attack]
      - id: card-48
        title: Nam Dong
        sideMode: dual
        order: 48
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["NVA", "ARVN", "VC", "US"]
          flavorText: "A CIDG camp attack ripples across I Corps."
        unshaded:
          text: "Remove Guerrillas and a COIN Base in one space."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: insurgentGuerrilla
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, op: in, value: ['NVA', 'VC'] }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $insurgentGuerrilla, prop: faction }, ':none'] }
            - removeByPriority:
                budget: 1
                groups:
                  - bind: coinBase
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, op: in, value: ['US', 'ARVN'] }
                        - { prop: type, eq: base }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $coinBase, prop: faction }, ':none'] }
        shaded:
          text: "Propaganda aftermath: remove a COIN Base; NVA Resources +3."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 1
                groups:
                  - bind: coinBase
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, op: in, value: ['US', 'ARVN'] }
                        - { prop: type, eq: base }
                    to:
                      zoneExpr: { concat: ['available-', { ref: tokenProp, token: $coinBase, prop: faction }, ':none'] }
            - addVar: { scope: global, var: nvaResources, delta: 3 }
      - id: card-50
        title: Uncle Ho
        sideMode: dual
        order: 50
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["NVA", "ARVN", "VC", "US"]
          flavorText: "Strategic guidance reshapes tempo of operations."
        unshaded:
          text: "Either ARVN executes 2 free Limited Operations, or VC then NVA execute 3 total."
          branches:
            - id: arvn-two-free-limited-ops
              order: 1
              freeOperationGrants:
                - seat: "ARVN"
                  sequence: { chain: uncle-ho-unshaded-arvn-two, step: 0 }
                  operationClass: limitedOperation
                - seat: "ARVN"
                  sequence: { chain: uncle-ho-unshaded-arvn-two, step: 1 }
                  operationClass: limitedOperation
            - id: vc-then-nva-three-free-limited-ops
              order: 2
              freeOperationGrants:
                - seat: "VC"
                  sequence: { chain: uncle-ho-unshaded-vc-nva-three, step: 0 }
                  operationClass: limitedOperation
                - seat: "VC"
                  sequence: { chain: uncle-ho-unshaded-vc-nva-three, step: 1 }
                  operationClass: limitedOperation
                - seat: "NVA"
                  sequence: { chain: uncle-ho-unshaded-vc-nva-three, step: 2 }
                  operationClass: limitedOperation
        shaded:
          text: "COIN initiative: US/ARVN execute 3 total free Limited Operations."
          branches:
            - id: us-then-arvn-three-free-limited-ops
              order: 1
              freeOperationGrants:
                - seat: "US"
                  sequence: { chain: uncle-ho-shaded-us-arvn-three, step: 0 }
                  operationClass: limitedOperation
                - seat: "ARVN"
                  sequence: { chain: uncle-ho-shaded-us-arvn-three, step: 1 }
                  operationClass: limitedOperation
                - seat: "ARVN"
                  sequence: { chain: uncle-ho-shaded-us-arvn-three, step: 2 }
                  operationClass: limitedOperation
            - id: us-two-free-limited-ops
              order: 2
              freeOperationGrants:
                - seat: "US"
                  sequence: { chain: uncle-ho-shaded-us-two, step: 0 }
                  operationClass: limitedOperation
                - seat: "US"
                  sequence: { chain: uncle-ho-shaded-us-two, step: 1 }
                  operationClass: limitedOperation
      - id: card-63
        title: Fact Finding
        sideMode: dual
        order: 63
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["ARVN", "US", "NVA", "VC"]
          flavorText: "Investigations expose gaps in pacification claims."
        unshaded:
          text: "Return pieces from Out of Play; transfer die-roll Patronage to Aid."
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: usOutOfPlay
                    over:
                      query: tokensInZone
                      zone: out-of-play-US:none
                      filter:
                        - { prop: faction, eq: US }
                    to:
                      zoneExpr: available-US:none
            - removeByPriority:
                budget: 3
                groups:
                  - bind: arvnOutOfPlay
                    over:
                      query: tokensInZone
                      zone: out-of-play-ARVN:none
                      filter:
                        - { prop: faction, eq: ARVN }
                    to:
                      zoneExpr: available-ARVN:none
            - rollRandom:
                bind: $dieRoll
                min: 1
                max: 6
                in:
                  - addVar:
                      scope: global
                      var: patronage
                      delta:
                        op: '*'
                        left: -1
                        right: { ref: binding, name: $dieRoll }
                  - addVar:
                      scope: global
                      var: aid
                      delta: { ref: binding, name: $dieRoll }
        shaded:
          text: "Scandal fallout: transfer die-roll Aid to Patronage."
          effects:
            - rollRandom:
                bind: $dieRoll
                min: 1
                max: 6
                in:
                  - addVar:
                      scope: global
                      var: aid
                      delta:
                        op: '*'
                        left: -1
                        right: { ref: binding, name: $dieRoll }
                  - addVar:
                      scope: global
                      var: patronage
                      delta: { ref: binding, name: $dieRoll }
      - id: card-66
        title: Ambassador Taylor
        sideMode: dual
        order: 66
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["ARVN", "US", "VC", "NVA"]
          flavorText: "Military envoy presses for tighter control."
        unshaded:
          text: "Aid and ARVN Resources rise; remove a level of Support."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - addVar: { scope: global, var: aid, delta: 6 }
            - addVar: { scope: global, var: arvnResources, delta: 6 }
            - shiftMarker:
                space: $targetSpace
                marker: supportOpposition
                delta: -1
        shaded:
          text: "Backlash empowers insurgents: shift toward Opposition; NVA Resources +6."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - shiftMarker:
                space: $targetSpace
                marker: supportOpposition
                delta: 1
            - addVar: { scope: global, var: nvaResources, delta: 6 }
      - id: card-93
        title: Senator Fulbright
        sideMode: dual
        order: 93
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["VC", "US", "NVA", "ARVN"]
          flavorText: "Congressional skepticism constrains intervention."
        unshaded:
          text: "Move US pieces to Available and reduce Aid."
          targets:
            - id: $sourceSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: usTroop
                    over:
                      query: tokensInZone
                      zone: $sourceSpace
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: available-US:none
                  - bind: usIrregular
                    over:
                      query: tokensInZone
                      zone: $sourceSpace
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: irregular }
                    to:
                      zoneExpr: available-US:none
                  - bind: usBase
                    over:
                      query: tokensInZone
                      zone: $sourceSpace
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: base }
                    to:
                      zoneExpr: available-US:none
            - addVar: { scope: global, var: aid, delta: -6 }
        shaded:
          text: "Withdrawal pressure deepens: more US pieces to Available; Aid -12."
          targets:
            - id: $sourceSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 6
                groups:
                  - bind: usTroop
                    over:
                      query: tokensInZone
                      zone: $sourceSpace
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: available-US:none
                  - bind: usIrregular
                    over:
                      query: tokensInZone
                      zone: $sourceSpace
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: irregular }
                    to:
                      zoneExpr: available-US:none
                  - bind: usBase
                    over:
                      query: tokensInZone
                      zone: $sourceSpace
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: base }
                    to:
                      zoneExpr: available-US:none
            - addVar: { scope: global, var: aid, delta: -12 }
      - id: card-110
        title: No Contact
        sideMode: dual
        order: 110
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["VC", "NVA", "ARVN", "US"]
          flavorText: "Fog of war creates sudden reversals."
        unshaded:
          text: "Place US Casualties on map; flip up to 2 Insurgent Guerrillas Active."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: usCasualty
                    over:
                      query: tokensInZone
                      zone: casualties-US:none
                      filter:
                        - { prop: faction, eq: US }
                    to:
                      zoneExpr: $targetSpace
            - forEach:
                bind: $insurgentGuerrilla
                over:
                  query: tokensInZone
                  zone: $targetSpace
                  filter:
                    - { prop: faction, op: in, value: ['NVA', 'VC'] }
                    - { prop: type, eq: guerrilla }
                    - { prop: activity, eq: underground }
                limit: 2
                effects:
                  - setTokenProp: { token: $insurgentGuerrilla, prop: activity, value: active }
        shaded:
          text: "Counterdeception: flip up to 2 Active Insurgents Underground; move 2 US Troops to Casualties."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - forEach:
                bind: $insurgentGuerrilla
                over:
                  query: tokensInZone
                  zone: $targetSpace
                  filter:
                    - { prop: faction, op: in, value: ['NVA', 'VC'] }
                    - { prop: type, eq: guerrilla }
                    - { prop: activity, eq: active }
                limit: 2
                effects:
                  - setTokenProp: { token: $insurgentGuerrilla, prop: activity, value: underground }
            - removeByPriority:
                budget: 2
                groups:
                  - bind: usTroop
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, eq: US }
                        - { prop: type, eq: troops }
                    to:
                      zoneExpr: casualties-US:none
      - id: card-118
        title: Korean War Arms
        sideMode: dual
        order: 118
        tags: []
        metadata:
          period: "1964"
          seatOrder: ["VC", "ARVN", "NVA", "US"]
          flavorText: "Old stockpiles rearm southern insurgency."
        unshaded:
          text: "VC remove Guerrillas, then place VC pieces."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 3
                groups:
                  - bind: vcGuerrilla
                    over:
                      query: tokensInZone
                      zone: $targetSpace
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: available-VC:none
            - removeByPriority:
                budget: 2
                groups:
                  - bind: vcGuerrilla
                    over:
                      query: tokensInZone
                      zone: available-VC:none
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetSpace
        shaded:
          text: "Cross-border infusion: place VC and NVA Guerrillas."
          targets:
            - id: $targetSpace
              selector:
                query: mapSpaces
              cardinality: { max: 1 }
          effects:
            - removeByPriority:
                budget: 2
                groups:
                  - bind: vcGuerrilla
                    over:
                      query: tokensInZone
                      zone: available-VC:none
                      filter:
                        - { prop: faction, eq: VC }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetSpace
            - removeByPriority:
                budget: 1
                groups:
                  - bind: nvaGuerrilla
                    over:
                      query: tokensInZone
                      zone: available-NVA:none
                      filter:
                        - { prop: faction, eq: NVA }
                        - { prop: type, eq: guerrilla }
                    to:
                      zoneExpr: $targetSpace
      - id: card-121
        title: Linebacker II
        sideMode: single
        order: 121
        tags: [pivotal, US]
        metadata:
          seatOrder: ["US", "ARVN", "VC", "NVA"]
          flavorText: "Unrestricted air war."
        playCondition:
          op: and
          args:
            - { op: ">=", left: { ref: gvar, var: leaderBoxCardCount }, right: 2 }
            - op: or
              args:
                - op: '>'
                  left:
                    op: '+'
                    left:
                      op: '+'
                      left:
                        aggregate:
                          op: sum
                          query:
                            query: mapSpaces
                            filter:
                              op: '=='
                              left: { ref: markerState, space: $zone, marker: supportOpposition }
                              right: passiveSupport
                          bind: $zone
                          valueExpr: { ref: zoneProp, zone: $zone, prop: population }
                      right:
                        op: '*'
                        left: 2
                        right:
                          aggregate:
                            op: sum
                            query:
                              query: mapSpaces
                              filter:
                                op: '=='
                                left: { ref: markerState, space: $zone, marker: supportOpposition }
                                right: activeSupport
                            bind: $zone
                            valueExpr: { ref: zoneProp, zone: $zone, prop: population }
                    right:
                      aggregate:
                        op: count
                        query:
                          query: tokensInZone
                          zone: available-US:none
                          filter:
                            - { prop: faction, eq: US }
                            - { prop: type, op: in, value: [troops, base] }
                  right: 40
                - { op: '==', left: { ref: gvar, var: linebacker11Allowed }, right: true }
        unshaded:
          text: "Unrestricted air war: NVA removes 2 Bases, reduces Resources to half (round down), Ineligible through next card. 3 US Casualties to Available."
      - id: card-122
        title: Easter Offensive
        sideMode: single
        order: 122
        tags: [pivotal, NVA]
        metadata:
          seatOrder: ["NVA", "VC", "ARVN", "US"]
          flavorText: "Invasion."
        playCondition:
          op: and
          args:
            - { op: ">=", left: { ref: gvar, var: leaderBoxCardCount }, right: 2 }
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: tokensInMapSpaces
                    filter:
                      - { prop: faction, eq: NVA }
                      - { prop: type, eq: troops }
              right:
                aggregate:
                  op: count
                  query:
                    query: tokensInMapSpaces
                    filter:
                      - { prop: faction, eq: US }
                      - { prop: type, eq: troops }
        unshaded:
          text: "Invasion: NVA free Marches. Then NVA Troops on LoCs with no US/ARVN may move 1 space. Then all NVA Troops free Attack."
      - id: card-123
        title: Vietnamization
        sideMode: single
        order: 123
        tags: [pivotal, ARVN]
        metadata:
          seatOrder: ["ARVN", "US", "NVA", "VC"]
          flavorText: "Mechanization."
        playCondition:
          op: and
          args:
            - { op: ">=", left: { ref: gvar, var: leaderBoxCardCount }, right: 2 }
            - op: '<'
              left:
                aggregate:
                  op: count
                  query:
                    query: tokensInMapSpaces
                    filter:
                      - { prop: faction, eq: US }
                      - { prop: type, eq: troops }
              right: 20
        unshaded:
          text: "Mechanization: +12 ARVN Resources. +12 Aid. All out-of-play ARVN Available. Place 4 ARVN cubes anywhere."
      - id: card-124
        title: Tet Offensive
        sideMode: single
        order: 124
        tags: [pivotal, VC]
        metadata:
          seatOrder: ["VC", "NVA", "US", "ARVN"]
          flavorText: "General uprising."
        playCondition:
          op: and
          args:
            - { op: ">=", left: { ref: gvar, var: leaderBoxCardCount }, right: 2 }
            - op: '>'
              left:
                aggregate:
                  op: count
                  query:
                    query: tokensInMapSpaces
                    spaceFilter:
                      op: '=='
                      left: { ref: zoneProp, zone: $zone, prop: country }
                      right: southVietnam
                    filter:
                      - { prop: faction, eq: VC }
                      - { prop: type, eq: guerrilla }
              right: 20
        unshaded:
          text: "General uprising: Free Terror with 1 Underground VC per space. Place 6 VC pieces in any cities. VC + NVA Guerrillas free Attack where enemies (remove VC first)."
      - id: card-125
        title: Nguyen Khanh
        sideMode: single
        order: 125
        tags: [coup]
        metadata:
          flavorText: "Corps commanders ascendant."
        unshaded:
          text: "Transport uses max 1 LoC space."
          effects:
            - setGlobalMarker: { marker: activeLeader, state: khanh }
            - addVar: { scope: global, var: leaderBoxCardCount, delta: 1 }
      - id: card-126
        title: Young Turks
        sideMode: single
        order: 126
        tags: [coup]
        metadata:
          flavorText: "Thi, Ky, & Thieu wag the US dog."
        unshaded:
          text: "Each ARVN Govern Special Activity adds +2 Patronage."
          effects:
            - setGlobalMarker: { marker: activeLeader, state: youngTurks }
            - addVar: { scope: global, var: leaderBoxCardCount, delta: 1 }
      - id: card-127
        title: Nguyen Cao Ky
        sideMode: single
        order: 127
        tags: [coup]
        metadata:
          flavorText: "Brash brass Ky."
        unshaded:
          text: "Pacification costs 4 Resources per Terror or level."
          effects:
            - setGlobalMarker: { marker: activeLeader, state: ky }
            - addVar: { scope: global, var: leaderBoxCardCount, delta: 1 }
      - id: card-128
        title: Nguyen Van Thieu
        sideMode: single
        order: 128
        tags: [coup]
        metadata:
          flavorText: "Stabilizer."
        unshaded:
          text: "No effect."
          effects:
            - setGlobalMarker: { marker: activeLeader, state: thieu }
            - addVar: { scope: global, var: leaderBoxCardCount, delta: 1 }
      - id: card-129
        title: Failed Attempt
        sideMode: single
        order: 129
        tags: [coup]
        metadata:
          flavorText: "Desertion."
        unshaded:
          text: "ARVN removes 1 in 3 of its cubes per space (round down). Place below any RVN Leader card."
          effects:
            - addVar: { scope: global, var: leaderBoxCardCount, delta: 1 }
            - macro: rvn-leader-failed-attempt-desertion
      - id: card-130
        title: Failed Attempt
        sideMode: single
        order: 130
        tags: [coup]
        metadata:
          flavorText: "Desertion."
        unshaded:
          text: "ARVN removes 1 in 3 of its cubes per space (round down). Place below any RVN Leader card."
          effects:
            - addVar: { scope: global, var: leaderBoxCardCount, delta: 1 }
            - macro: rvn-leader-failed-attempt-desertion

# ══════════════════════════════════════════════════════════════════════════════
# Pool Zones (piece availability pools — supplement map-derived board zones)
# ══════════════════════════════════════════════════════════════════════════════

```
