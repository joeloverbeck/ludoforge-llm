# Fire in the Lake - Vocabulary

```yaml
zones:
  - id: deck
    owner: none
    visibility: hidden
    ordering: stack
    behavior:
      type: deck
      drawFrom: top
  - id: available-US
    owner: none
    visibility: public
    ordering: set
  - id: out-of-play-US
    owner: none
    visibility: public
    ordering: set
  - id: available-ARVN
    owner: none
    visibility: public
    ordering: set
  - id: out-of-play-ARVN
    owner: none
    visibility: public
    ordering: set
  - id: available-NVA
    owner: none
    visibility: public
    ordering: set
  - id: available-VC
    owner: none
    visibility: public
    ordering: set
  - id: casualties-US
    owner: none
    visibility: public
    ordering: set
  - id: leader
    owner: none
    visibility: public
    ordering: stack
  - id: lookahead
    owner: none
    visibility: public
    ordering: stack
  - id: played
    owner: none
    visibility: public
    ordering: stack
globalMarkerLattices:
  - batch:
      ids:
        - cap_topGun
        - cap_arcLight
        - cap_abrams
        - cap_cobras
        - cap_m48Patton
        - cap_caps
        - cap_cords
        - cap_lgbs
        - cap_searchAndDestroy
        - cap_aaa
        - cap_longRangeGuns
        - cap_migs
        - cap_sa2s
        - cap_pt76
        - cap_armoredCavalry
        - cap_mandateOfHeaven
        - cap_boobyTraps
        - cap_mainForceBns
        - cap_cadres
      states:
        - inactive
        - unshaded
        - shaded
      defaultState: inactive
  - id: activeLeader
    states:
      - minh
      - khanh
      - youngTurks
      - ky
      - thieu
    defaultState: minh
  - id: leaderFlipped
    states:
      - normal
      - flipped
    defaultState: normal
globalVars:
  - name: coinResources
    type: int
    init: 10
    min: 0
    max: 50
  - name: usResources
    type: int
    init: 7
    min: 0
    max: 50
  - name: airLiftRemaining
    type: int
    init: 0
    min: 0
    max: 6
  - name: airStrikeRemaining
    type: int
    init: 0
    min: 0
    max: 6
  - batch:
      names:
        - trainCount
        - patrolCount
        - sweepCount
        - assaultCount
        - rallyCount
        - marchCount
        - attackCount
        - adviseCount
        - airLiftCount
        - airStrikeCount
        - governCount
        - transportCount
        - raidCount
        - infiltrateCount
        - bombardCount
        - nvaAmbushCount
        - taxCount
        - subvertCount
        - vcAmbushCount
      type: int
      init: 0
      min: 0
      max: 20
  - batch:
      names:
        - usOpCount
        - arvnOpCount
      type: int
      init: 0
      min: 0
      max: 50
  - batch:
      names:
        - mom_wildWeasels
        - mom_adsid
        - mom_rollingThunder
        - mom_medevacUnshaded
        - mom_medevacShaded
        - mom_blowtorchKomer
        - mom_claymores
        - mom_daNang
        - mom_mcnamaraLine
        - mom_oriskany
        - mom_bombingPause
        - mom_559thTransportGrp
        - mom_bodyCount
        - mom_generalLansdale
        - mom_typhoonKate
      type: boolean
      init: false
  - name: fitl_acesAirStrikeWindow
    type: boolean
    init: false
  - name: linebacker11Allowed
    type: boolean
    init: false
  - name: linebacker11SupportAvailable
    type: int
    init: 0
    min: 0
    max: 200
perPlayerVars:
  - name: resources
    type: int
    init: 20
    min: 0
    max: 50
```
