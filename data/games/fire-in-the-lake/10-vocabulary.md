# Fire in the Lake - Vocabulary

```yaml
zones:
  - id: deck
    owner: none
    visibility: hidden
    ordering: stack
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
  - id: cap_topGun
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_arcLight
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_abrams
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_cobras
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_m48Patton
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_caps
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_cords
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_lgbs
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_searchAndDestroy
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_aaa
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_longRangeGuns
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_migs
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_sa2s
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_pt76
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_armoredCavalry
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_mandateOfHeaven
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_boobyTraps
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_mainForceBns
    states:
      - inactive
      - unshaded
      - shaded
    defaultState: inactive
  - id: cap_cadres
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
globalVars:
  - name: coinResources
    type: int
    init: 10
    min: 0
    max: 50
  - name: trainCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: patrolCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: sweepCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: assaultCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: rallyCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: marchCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: attackCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: usResources
    type: int
    init: 7
    min: 0
    max: 50
  - name: adviseCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: airLiftCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: airStrikeCount
    type: int
    init: 0
    min: 0
    max: 20
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
  - name: governCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: transportCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: raidCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: infiltrateCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: bombardCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: nvaAmbushCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: taxCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: subvertCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: vcAmbushCount
    type: int
    init: 0
    min: 0
    max: 20
  - name: usOpCount
    type: int
    init: 0
    min: 0
    max: 50
  - name: arvnOpCount
    type: int
    init: 0
    min: 0
    max: 50
  - name: mom_wildWeasels
    type: boolean
    init: false
  - name: mom_adsid
    type: boolean
    init: false
  - name: mom_rollingThunder
    type: boolean
    init: false
  - name: mom_medevacUnshaded
    type: boolean
    init: false
  - name: mom_medevacShaded
    type: boolean
    init: false
  - name: mom_blowtorchKomer
    type: boolean
    init: false
  - name: mom_claymores
    type: boolean
    init: false
  - name: mom_daNang
    type: boolean
    init: false
  - name: mom_mcnamaraLine
    type: boolean
    init: false
  - name: mom_oriskany
    type: boolean
    init: false
  - name: mom_bombingPause
    type: boolean
    init: false
  - name: mom_559thTransportGrp
    type: boolean
    init: false
  - name: mom_bodyCount
    type: boolean
    init: false
  - name: mom_generalLansdale
    type: boolean
    init: false
  - name: mom_typhoonKate
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
  - name: leaderBoxCardCount
    type: int
    init: 0
    min: 0
    max: 8
perPlayerVars:
  - name: resources
    type: int
    init: 20
    min: 0
    max: 50
```
