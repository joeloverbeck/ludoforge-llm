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
    place_from_available_or_map_action:
      class: utility
      summary: "Place piece from Available (or from map if non-US)"

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

  # ── Stage descriptions (per-profile stage labels) ─────────────────────
  stageDescriptions:
    # ── US Operations ────────────────────────────────────────────────────
    train-us-profile:
      select-spaces:
        label: "Select training spaces"
        description: "Choose Provinces/Cities with US pieces for training"
      resolve-per-space:
        label: "Resolve training"
        description: "Place Irregulars or at-Base Rangers/ARVN cubes per space"
      cap-caps-bonus-police:
        label: "CAPS bonus"
        description: "CAPS unshaded: place free Police in training spaces"
      sub-action:
        label: "Pacification"
        description: "Pacify or transfer Patronage in selected spaces"

    patrol-us-profile:
      select-locs:
        label: "Select patrol routes"
        description: "Choose Lines of Communication for patrol"
      move-cubes:
        label: "Move cubes"
        description: "Move US Troops along selected LoCs"
      activate-guerrillas:
        label: "Activate guerrillas"
        description: "Activate underground guerrillas equal to US cubes present"
      free-assault:
        label: "Free assault"
        description: "Assault in each patrolled LoC at no cost"
      cap-m48-patrol-penalty:
        label: "M48 Patton penalty"
        description: "M48 Patton shaded: pay 3 ARVN Resources for patrolled cubes"

    sweep-us-profile:
      select-spaces:
        label: "Select sweep spaces"
        description: "Choose Provinces/Cities for sweep operations"
      move-troops:
        label: "Move troops"
        description: "Move US Troops into selected spaces via adjacent LoCs"
      activate-guerrillas:
        label: "Activate guerrillas"
        description: "Activate underground guerrillas equal to sweeping cubes"
      cap-cobras-bonus-removal:
        label: "Cobras bonus"
        description: "Cobras unshaded: remove 1 active enemy piece in up to 2 spaces"
      cap-booby-traps-troop-cost:
        label: "Booby Traps cost"
        description: "Booby Traps shaded: risk losing 1 sweeping Troop per space"

    assault-us-profile:
      select-spaces:
        label: "Select assault spaces"
        description: "Choose spaces with US Troops and enemy pieces"
      abrams-select-space:
        label: "Abrams bonus space"
        description: "Abrams unshaded: select 1 extra assault space"
      resolve-per-space:
        label: "Remove enemy pieces"
        description: "Remove enemy pieces up to US Troop count per space"
      cap-m48-patton-bonus-removal:
        label: "M48 Patton bonus"
        description: "M48 Patton unshaded: +2 removals in up to 2 non-Lowland spaces"
      arvn-followup:
        label: "ARVN follow-up"
        description: "ARVN Troops may assault in same spaces at ARVN cost"

    # ── US Special Activities ────────────────────────────────────────────
    advise-profile:
      select-spaces:
        label: "Select advise spaces"
        description: "Choose spaces with ARVN cubes for US advising"
      resolve-per-space:
        label: "Resolve advising"
        description: "Assault or activate-and-remove in each advised space"

    air-lift-profile:
      select-spaces:
        label: "Select spaces"
        description: "Choose up to 4 spaces for air transport"
      move-us-troops:
        label: "Move US Troops"
        description: "Redistribute US Troops among selected spaces"
      move-coin-lift-pieces:
        label: "Move COIN pieces"
        description: "Move up to 4 ARVN Troops/Rangers/Irregulars among selected spaces"
      air-lift-telemetry:
        label: "Air Lift tracking"
        description: "Record Air Lift usage for the turn"

    air-strike-profile:
      select-spaces:
        label: "Select strike spaces"
        description: "Choose spaces with COIN pieces for air strikes"
      remove-active-enemy-pieces:
        label: "Remove enemy pieces"
        description: "Remove up to 6 active enemy pieces across selected spaces"
      optional-trail-degrade:
        label: "Degrade Trail"
        description: "Optionally degrade the Ho Chi Minh Trail by 1"

  # ── Modifier effects (capability shaded/unshaded descriptions) ───────
  modifierEffects:
    cap_topGun:
      - condition: "Top Gun is Unshaded"
        effect: "No US pieces lost to Trail degradation during Air Strike"
      - condition: "Top Gun is Shaded"
        effect: "US loses 2 pieces to Available after Trail degradation"
    cap_arcLight:
      - condition: "Arc Light is Unshaded"
        effect: "Air Strike 1 Province without COIN pieces (no opposition shift)"
      - condition: "Arc Light is Shaded"
        effect: "Air Strike shifts 2 levels toward opposition if >1 piece removed"
    cap_abrams:
      - condition: "Abrams is Unshaded"
        effect: "+1 Assault space selection"
      - condition: "Abrams is Shaded"
        effect: "Assault spaces must have US base or 3+ US Troops"
    cap_cobras:
      - condition: "Cobras is Unshaded"
        effect: "Sweep: remove 1 active enemy in up to 2 spaces"
      - condition: "Cobras is Shaded"
        effect: "Assault: risk losing 1 US Troop to Casualties per space (roll 1-3)"
    cap_m48Patton:
      - condition: "M48 Patton is Unshaded"
        effect: "Assault: +2 removals in up to 2 non-Lowland spaces"
      - condition: "M48 Patton is Shaded"
        effect: "Patrol: pay 3 ARVN Resources for each cube that moved"
    cap_caps:
      - condition: "CAPS is Unshaded"
        effect: "Train: place free Police in training spaces with US base"
      - condition: "CAPS is Shaded"
        effect: "Train/Sweep: limited to spaces without NVA control"
    cap_cords:
      - condition: "CORDS is Unshaded"
        effect: "Train: pacify in up to 2 selected spaces instead of 1"
      - condition: "CORDS is Shaded"
        effect: "Train: pacification shifts only to Passive Support"
    cap_lgbs:
      - condition: "LGBs is Unshaded"
        effect: "Air Strike: no opposition shift if only 1 piece removed"
      - condition: "LGBs is Shaded"
        effect: "Air Strike: maximum 2 removals total"
    cap_searchAndDestroy:
      - condition: "Search and Destroy is Unshaded"
        effect: "Assault: remove 1 underground guerrilla if no active enemy removed"
      - condition: "Search and Destroy is Shaded"
        effect: "Assault: shift 1 level toward opposition in Provinces with population"
    cap_aaa:
      - condition: "AAA is Unshaded"
        effect: "NVA Rally: place guerrillas equal to population +1 in spaces with base"
      - condition: "AAA is Shaded"
        effect: "Air Strike: lose 1 removal from budget"
    cap_longRangeGuns:
      - condition: "Long Range Guns is Unshaded"
        effect: "Bombard: remove 2 enemy pieces per selected space"
      - condition: "Long Range Guns is Shaded"
        effect: "Bombard: remove only 1 enemy piece per space"
    cap_migs:
      - condition: "MiGs is Unshaded"
        effect: "No effect on operations"
      - condition: "MiGs is Shaded"
        effect: "Air Strike Trail degradation: US loses 2 pieces to Available"
    cap_sa2s:
      - condition: "SA-2s is Unshaded"
        effect: "Whenever Air Strike degrades Trail, remove 1 NVA troop, guerrilla, or untunneled base outside the South"
      - condition: "SA-2s is Shaded"
        effect: "NVA Rally Trail improvement increases by 2 boxes instead of 1"
    cap_pt76:
      - condition: "PT-76 is Unshaded"
        effect: "NVA Attack: each Attack space removes 1 NVA Troop first when possible; otherwise pay normal Resource cost"
      - condition: "PT-76 is Shaded"
        effect: "NVA Attack: 1 chosen Attack space removes 1 enemy per NVA Troop there"
    cap_armoredCavalry:
      - condition: "Armored Cavalry is Unshaded"
        effect: "Transport: move ARVN pieces from Cities (not just LoCs)"
      - condition: "Armored Cavalry is Shaded"
        effect: "No additional effect"
    cap_mandateOfHeaven:
      - condition: "Mandate of Heaven is Unshaded"
        effect: "Govern: shift 2 levels toward Active Support per Pacify step"
      - condition: "Mandate of Heaven is Shaded"
        effect: "Govern: costs +3 ARVN Resources per space"
    cap_boobyTraps:
      - condition: "Booby Traps is Unshaded"
        effect: "Sweep/Assault: VC remove 1 sweeping/assaulting Troop per space (roll 1-3)"
      - condition: "Booby Traps is Shaded"
        effect: "No additional effect"
    cap_mainForceBns:
      - condition: "Main Force Bns is Unshaded"
        effect: "NVA Attack: flip 1 NVA guerrilla to underground after combat"
      - condition: "Main Force Bns is Shaded"
        effect: "Attack: untunneled enemy bases treated as exposed (removable)"
    cap_cadres:
      - condition: "Cadres is Unshaded"
        effect: "No additional effect"
      - condition: "Cadres is Shaded"
        effect: "VC Rally: free agitate in 1 Rally space"

  # ── Modifier classification ──────────────────────────────────────────
  modifierClassification:
    choiceFlowPatterns:
      - "*Choice"
      - "*Mode"
      - "*Action"
      - "*Aid"
      - "Sub Action*"
      - "subAction*"
    leaderPatterns:
      - "Active Leader*"

  # ── Suppress patterns ─────────────────────────────────────────────────
  suppressPatterns:
    - "*Count"
    - "*Tracker"
    - "__*"
    - "temp*"
    - "mom_*"
    - "fitl_*"
    - "$__macro_*"
```
