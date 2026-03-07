# Fire in the Lake - Verbalization

```yaml
verbalization:
  labels:
    # ── Factions ──────────────────────────────────────────────────────────
    us: "US"
    arvn: "ARVN"
    nva: "NVA"
    vc: "VC"

    # ── Piece types (kebab-case IDs from piece catalog) ───────────────────
    us-troops: { singular: "US Troop", plural: "US Troops" }
    us-bases: { singular: "US Base", plural: "US Bases" }
    us-irregulars: { singular: "US Irregular", plural: "US Irregulars" }
    arvn-troops: { singular: "ARVN Troop", plural: "ARVN Troops" }
    arvn-police: { singular: "ARVN Police", plural: "ARVN Police" }
    arvn-rangers: { singular: "ARVN Ranger", plural: "ARVN Rangers" }
    arvn-bases: { singular: "ARVN Base", plural: "ARVN Bases" }
    nva-troops: { singular: "NVA Troop", plural: "NVA Troops" }
    nva-guerrillas: { singular: "NVA Guerrilla", plural: "NVA Guerrillas" }
    nva-bases: { singular: "NVA Base", plural: "NVA Bases" }
    vc-guerrillas: { singular: "VC Guerrilla", plural: "VC Guerrillas" }
    vc-bases: { singular: "VC Base", plural: "VC Bases" }

    # ── Cities (zone IDs with :none suffix) ───────────────────────────────
    "saigon:none": "Saigon"
    "hue:none": "Hue"
    "da-nang:none": "Da Nang"
    "kontum:none": "Kontum"
    "qui-nhon:none": "Qui Nhon"
    "cam-ranh:none": "Cam Ranh"
    "an-loc:none": "An Loc"
    "can-tho:none": "Can Tho"

    # ── Provinces (South Vietnam) ─────────────────────────────────────────
    "quang-tri-thua-thien:none": "Quang Tri / Thua Thien"
    "quang-nam:none": "Quang Nam"
    "quang-tin-quang-ngai:none": "Quang Tin / Quang Ngai"
    "binh-dinh:none": "Binh Dinh"
    "pleiku-darlac:none": "Pleiku / Darlac"
    "phu-bon-phu-yen:none": "Phu Bon / Phu Yen"
    "khanh-hoa:none": "Khanh Hoa"
    "phuoc-long:none": "Phuoc Long"
    "quang-duc-long-khanh:none": "Quang Duc / Long Khanh"
    "binh-tuy-binh-thuan:none": "Binh Tuy / Binh Thuan"
    "tay-ninh:none": "Tay Ninh"
    "kien-phong:none": "Kien Phong"
    "kien-hoa-vinh-binh:none": "Kien Hoa / Vinh Binh"
    "ba-xuyen:none": "Ba Xuyen"
    "kien-giang-an-xuyen:none": "Kien Giang / An Xuyen"

    # ── Provinces (Laos / Cambodia / North Vietnam) ───────────────────────
    "central-laos:none": "Central Laos"
    "southern-laos:none": "Southern Laos"
    "northeast-cambodia:none": "Northeast Cambodia"
    "the-fishhook:none": "The Fishhook"
    "the-parrots-beak:none": "The Parrot's Beak"
    "sihanoukville:none": "Sihanoukville"
    "north-vietnam:none": "North Vietnam"

    # ── Lines of Communication ────────────────────────────────────────────
    "loc-hue-khe-sanh:none": "Route Hue–Khe Sanh"
    "loc-hue-da-nang:none": "Route Hue–Da Nang"
    "loc-da-nang-dak-to:none": "Route Da Nang–Dak To"
    "loc-da-nang-qui-nhon:none": "Route Da Nang–Qui Nhon"
    "loc-kontum-dak-to:none": "Route Kontum–Dak To"
    "loc-kontum-qui-nhon:none": "Route Kontum–Qui Nhon"
    "loc-kontum-ban-me-thuot:none": "Route Kontum–Ban Me Thuot"
    "loc-qui-nhon-cam-ranh:none": "Route Qui Nhon–Cam Ranh"
    "loc-cam-ranh-da-lat:none": "Route Cam Ranh–Da Lat"
    "loc-ban-me-thuot-da-lat:none": "Route Ban Me Thuot–Da Lat"
    "loc-saigon-cam-ranh:none": "Route Saigon–Cam Ranh"
    "loc-saigon-da-lat:none": "Route Saigon–Da Lat"
    "loc-saigon-an-loc-ban-me-thuot:none": "Route Saigon–An Loc–Ban Me Thuot"
    "loc-saigon-can-tho:none": "Route Saigon–Can Tho"
    "loc-can-tho-chau-doc:none": "Route Can Tho–Chau Doc"
    "loc-can-tho-bac-lieu:none": "Route Can Tho–Bac Lieu"
    "loc-can-tho-long-phu:none": "Route Can Tho–Long Phu"

    # ── Supply / Available zones ──────────────────────────────────────────
    "available-US:none": "US Available Forces"
    "available-ARVN:none": "ARVN Available Forces"
    "available-NVA:none": "NVA Available Forces"
    "available-VC:none": "VC Available Forces"
    "out-of-play-US:none": "US Out of Play"
    "out-of-play-ARVN:none": "ARVN Out of Play"
    "casualties-US:none": "US Casualties"

    # ── Infrastructure zones ─────────────────────────────────────────────
    "deck:none": "Event Deck"
    "leader:none": "Leader Box"
    "lookahead:none": "Lookahead"
    "played:none": "Played Events"

    # ── Global variables ──────────────────────────────────────────────────
    aid: "Aid"
    totalEcon: "Total Econ"
    patronage: "Patronage"
    trail: "Trail"
    coinResources: "COIN Resources"
    usResources: "US Resources"
    arvnResources: "ARVN Resources"
    nvaResources: "NVA Resources"
    vcResources: "VC Resources"
    airLiftRemaining: "Air Lift Remaining"
    airStrikeRemaining: "Air Strike Remaining"
    terrorSabotageMarkersPlaced: "Terror/Sabotage Markers Placed"
    leaderBoxCardCount: "Leader Box Card Count"
    resources: "Resources"

    # ── Per-space marker lattice ──────────────────────────────────────────
    supportOpposition: "Support/Opposition"
    activeSupport: "Active Support"
    passiveSupport: "Passive Support"
    neutral: "Neutral"
    passiveOpposition: "Passive Opposition"
    activeOpposition: "Active Opposition"

    # ── Global marker lattice states ──────────────────────────────────────
    inactive: "Inactive"
    unshaded: "Unshaded"
    shaded: "Shaded"

    # ── Status dimensions ─────────────────────────────────────────────────
    active: "Active"
    underground: "Underground"
    tunneled: "Tunneled"
    untunneled: "Untunneled"

    # ── Turn phases ───────────────────────────────────────────────────────
    main: "Main"
    coupVictory: "Coup: Victory Check"
    coupResources: "Coup: Resources"
    coupSupport: "Coup: Support"
    coupRedeploy: "Coup: Redeploy"
    coupCommitment: "Coup: Commitment"
    coupReset: "Coup: Reset"

    # ── Action IDs (operations) ───────────────────────────────────────────
    pass: "Pass"
    train: "Train"
    patrol: "Patrol"
    sweep: "Sweep"
    assault: "Assault"
    rally: "Rally"
    march: "March"
    attack: "Attack"
    terror: "Terror"

    # ── Action IDs (special activities) ───────────────────────────────────
    advise: "Advise"
    airLift: "Air Lift"
    airStrike: "Air Strike"
    govern: "Govern"
    transport: "Transport"
    raid: "Raid"
    infiltrate: "Infiltrate"
    bombard: "Bombard"
    ambushNva: "NVA Ambush"
    tax: "Tax"
    subvert: "Subvert"
    ambushVc: "VC Ambush"
    event: "Event"
    pivotalEvent: "Pivotal Event"

    # ── Coup phase action IDs ─────────────────────────────────────────────
    coupVictoryCheck: "Victory Check"
    coupResourcesResolve: "Resolve Resources"
    coupPacifyUS: "US Pacification"
    coupPacifyARVN: "ARVN Pacification"
    coupAgitateVC: "VC Agitation"
    coupArvnRedeployMandatory: "ARVN Mandatory Redeploy"
    coupArvnRedeployOptionalTroops: "ARVN Optional Troop Redeploy"
    coupArvnRedeployPolice: "ARVN Police Redeploy"
    coupNvaRedeployTroops: "NVA Troop Redeploy"
    coupCommitmentResolve: "Resolve Commitment"
    coupPacifyPass: "Pass (Pacify)"
    coupAgitatePass: "Pass (Agitate)"
    coupRedeployPass: "Pass (Redeploy)"
    coupCommitmentPass: "Pass (Commitment)"

    # ── Action profile IDs ────────────────────────────────────────────────
    train-us-profile: "US Train"
    train-arvn-profile: "ARVN Train"
    patrol-us-profile: "US Patrol"
    patrol-arvn-profile: "ARVN Patrol"
    sweep-us-profile: "US Sweep"
    sweep-arvn-profile: "ARVN Sweep"
    assault-us-profile: "US Assault"
    assault-arvn-profile: "ARVN Assault"
    rally-nva-profile: "NVA Rally"
    rally-vc-profile: "VC Rally"
    march-nva-profile: "NVA March"
    march-vc-profile: "VC March"
    attack-nva-profile: "NVA Attack"
    attack-vc-profile: "VC Attack"
    terror-nva-profile: "NVA Terror"
    terror-vc-profile: "VC Terror"
    advise-profile: "Advise"
    air-lift-profile: "Air Lift"
    air-strike-profile: "Air Strike"
    govern-profile: "Govern"
    transport-profile: "Transport"
    raid-profile: "Raid"
    infiltrate-profile: "Infiltrate"
    bombard-profile: "Bombard"
    nva-ambush-profile: "NVA Ambush"
    tax-profile: "Tax"
    subvert-profile: "Subvert"
    vc-ambush-profile: "VC Ambush"

    # ── Leader names ──────────────────────────────────────────────────────
    minh: "Duong Van Minh"
    khanh: "Nguyen Khanh"
    youngTurks: "Young Turks"
    ky: "Nguyen Cao Ky"
    thieu: "Nguyen Van Thieu"

    # ── Named sets ────────────────────────────────────────────────────────
    COIN: "COIN"
    Insurgent: "Insurgent"
    troops: "Troops"
    ranger: "Ranger"
    police: "Police"
    base: "Base"
    guerrilla: "Guerrilla"
    irregular: "Irregular"

    # ── Terrain / space attributes ────────────────────────────────────────
    province: "Province"
    city: "City"
    loc: "Line of Communication"
    jungle: "Jungle"
    coastal: "Coastal"
    southVietnam: "South Vietnam"
    laos: "Laos"
    cambodia: "Cambodia"

    # ── Capability markers ────────────────────────────────────────────────
    cap_topGun: "Top Gun"
    cap_arcLight: "Arc Light"
    cap_abrams: "Abrams"
    cap_cobras: "Cobras"
    cap_m48Patton: "M48 Patton"
    cap_caps: "CAPS"
    cap_cords: "CORDS"
    cap_lgbs: "LGBs"
    cap_searchAndDestroy: "Search and Destroy"
    cap_aaa: "AAA"
    cap_longRangeGuns: "Long Range Guns"
    cap_migs: "MiGs"
    cap_sa2s: "SA-2s"
    cap_pt76: "PT-76"
    cap_armoredCavalry: "Armored Cavalry"
    cap_mandateOfHeaven: "Mandate of Heaven"
    cap_boobyTraps: "Booby Traps"
    cap_mainForceBns: "Main Force Bns"
    cap_cadres: "Cadres"

  # ── Stages ────────────────────────────────────────────────────────────
  stages:
    selectSpaces: "Select target spaces"
    placeForces: "Place forces"
    activateGuerrillas: "Activate guerrillas"
    moveTroops: "Move troops"
    removeForces: "Remove enemy forces"
    shiftSupport: "Shift support/opposition"
    payResources: "Pay resources"
    gainResources: "Gain resources"
    placeBases: "Place bases"
    flipGuerrillas: "Flip guerrillas"
    selectDestinations: "Select destinations"
    resolveCombat: "Resolve combat"
    conductAirStrike: "Conduct air strike"
    executeAirLift: "Execute air lift"
    governSpace: "Govern space"
    collectTax: "Collect tax"
    subvertPieces: "Subvert enemy pieces"
    placeTunnel: "Place tunnel"
    conductBombardment: "Conduct bombardment"
    resolveAmbush: "Resolve ambush"
    conductRaid: "Conduct raid"
    transferResources: "Transfer resources"
    checkVictory: "Check victory conditions"
    resolveResources: "Resolve resources"
    resolveSupport: "Resolve support phase"
    resolveRedeploy: "Resolve redeployment"
    resolveCommitment: "Resolve commitment"
    resetPhase: "Reset phase"

  # ── Macros ────────────────────────────────────────────────────────────
  macros:
    train-us-profile:
      class: operation
      summary: "Place US forces and build support"
    train-arvn-profile:
      class: operation
      summary: "Place ARVN forces and build support"
    patrol-us-profile:
      class: operation
      summary: "Move cubes along LoCs and activate guerrillas"
    patrol-arvn-profile:
      class: operation
      summary: "Move ARVN cubes along LoCs and activate guerrillas"
    sweep-us-profile:
      class: operation
      summary: "Move troops into spaces and activate guerrillas"
    sweep-arvn-profile:
      class: operation
      summary: "Move ARVN troops into spaces and activate guerrillas"
    assault-us-profile:
      class: operation
      summary: "Remove enemy pieces from selected spaces"
    assault-arvn-profile:
      class: operation
      summary: "Remove enemy pieces using ARVN forces"
    rally-nva-profile:
      class: operation
      summary: "Place NVA forces and build bases"
    rally-vc-profile:
      class: operation
      summary: "Place VC guerrillas and build bases"
    march-nva-profile:
      class: operation
      summary: "Move NVA forces into adjacent spaces"
    march-vc-profile:
      class: operation
      summary: "Move VC guerrillas into adjacent spaces"
    attack-nva-profile:
      class: operation
      summary: "Attack COIN forces in selected spaces"
    attack-vc-profile:
      class: operation
      summary: "Attack COIN forces using VC guerrillas"
    terror-nva-profile:
      class: operation
      summary: "Place terror in selected spaces"
    terror-vc-profile:
      class: operation
      summary: "Place terror in selected spaces"
    advise-profile:
      class: specialActivity
      summary: "US advises ARVN operations"
    air-lift-profile:
      class: specialActivity
      summary: "Transport forces by air"
    air-strike-profile:
      class: specialActivity
      summary: "Conduct air strikes against enemy forces"
    govern-profile:
      class: specialActivity
      summary: "Shift support and collect resources"
    transport-profile:
      class: specialActivity
      summary: "Move ARVN forces along LoCs"
    raid-profile:
      class: specialActivity
      summary: "Remove enemy pieces and steal resources"
    infiltrate-profile:
      class: specialActivity
      summary: "Place NVA forces and improve trail"
    bombard-profile:
      class: specialActivity
      summary: "Remove enemy pieces via bombardment"
    nva-ambush-profile:
      class: specialActivity
      summary: "Ambush COIN forces with NVA guerrillas"
    tax-profile:
      class: specialActivity
      summary: "Collect resources from population"
    subvert-profile:
      class: specialActivity
      summary: "Remove ARVN pieces and replace with VC"
    vc-ambush-profile:
      class: specialActivity
      summary: "Ambush COIN forces with VC guerrillas"
    coup-auto-sabotage:
      class: coupPhase
      summary: "Degrade LoC Econ via NVA sabotage"
    coup-trail-degradation:
      class: coupPhase
      summary: "Degrade trail if COIN controls Laos/Cambodia"
    coup-arvn-earnings:
      class: coupPhase
      summary: "ARVN earns resources from Econ and Aid"
    coup-insurgent-earnings:
      class: coupPhase
      summary: "Insurgents earn resources from bases and trail"
    coup-casualties-aid:
      class: coupPhase
      summary: "Reduce Aid for US casualties"
    coup-process-commitment:
      class: coupPhase
      summary: "Process US commitment level"
    coup-reset-markers:
      class: coupPhase
      summary: "Reset terror, trail, and guerrilla status"
    piece-removal-ordering:
      class: utility
      summary: "Priority ordering for piece removal"
    coin-assault-removal-order:
      class: utility
      summary: "COIN assault removal priority"
    insurgent-attack-removal-order:
      class: utility
      summary: "Insurgent attack removal priority"
    shift-support-opposition:
      class: utility
      summary: "Shift support/opposition marker"

  # ── Sentence plans ────────────────────────────────────────────────────
  sentencePlans:
    shiftMarker:
      supportOpposition:
        "+1": "Shift 1 level toward Active Support"
        "-1": "Shift 1 level toward Active Opposition"
        "+2": "Shift 2 levels toward Active Support"
        "-2": "Shift 2 levels toward Active Opposition"
    addVar:
      aid:
        "+1": "Add 1 Aid"
        "-1": "Remove 1 Aid"
        "+3": "Add 3 Aid"
        "-3": "Remove 3 Aid"
        "+6": "Add 6 Aid"
      patronage:
        "+1": "Add 1 Patronage"
        "-1": "Remove 1 Patronage"
        "+3": "Add 3 Patronage"
      trail:
        "+1": "Improve Trail by 1"
        "-1": "Degrade Trail by 1"
        "+2": "Improve Trail by 2"
        "-2": "Degrade Trail by 2"
      resources:
        "+1": "Gain 1 Resource"
        "-1": "Spend 1 Resource"
        "+3": "Gain 3 Resources"
        "-3": "Spend 3 Resources"
      coinResources:
        "+3": "Add 3 COIN Resources"
        "-3": "Spend 3 COIN Resources"
      usResources:
        "+3": "Add 3 US Resources"
        "-3": "Spend 3 US Resources"
      arvnResources:
        "+3": "Add 3 ARVN Resources"
        "-3": "Spend 3 ARVN Resources"
      nvaResources:
        "+1": "Add 1 NVA Resource"
        "-1": "Spend 1 NVA Resource"
      vcResources:
        "+1": "Add 1 VC Resource"
        "-1": "Spend 1 VC Resource"
    setVar:
      trail:
        "1": "Set Trail to 1"
        "3": "Set Trail to 3"

  # ── Suppress patterns ─────────────────────────────────────────────────
  suppressPatterns:
    - "*Count"
    - "*Tracker"
    - "__*"
    - "temp*"
    - "mom_*"
    - "fitl_*"
```
