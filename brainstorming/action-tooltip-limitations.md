# Action Tooltip Limitations

## US Train

Train — Select 1-1 spaces
Step 1
Select 1-1 spaces
Select 1-99 spaces
Choose: Place Irregulars, Place At Base
Select 0-2 items
Select 0-1 items
Choose: Pacify, Saigon Transfer, None
Select 1-1 spaces
Select 1-99 spaces
Choose: Rangers, ARVN Cubes
Select 0-2 items
Select 0-1 items
Choose: Pacify, Replace Cubes With Base, None
Gain 5 Aid
and 14 more...

▾
Modifiers (2 active)
✓<ref> == 0: If <ref> == 0
__actionClass == limitedOperation: If __actionClass == limitedOperation
$trainChoice == place-irregulars: If $trainChoice == place-irregulars
$trainChoice == place-at-base AND <expr> > 0: If $trainChoice == place-at-base AND <expr> > 0
$baseTrainChoice == rangers: If $baseTrainChoice == rangers
$baseTrainChoice == arvn-cubes AND __freeOperation == true OR arvnResources >= <expr>: If $baseTrainChoice == arvn-cubes AND __freeOperation == true OR arvnResources >= <expr>
__freeOperation != true: If __freeOperation != true
cap_caps == unshaded: If cap_caps == unshaded
cap_cords == unshaded: If cap_cords == unshaded
$subAction == pacify AND <expr> > 0: If $subAction == pacify AND <expr> > 0
$subAction == saigon-transfer AND <ref> == saigon:none: If $subAction == saigon-transfer AND <ref> == saigon:none
<ref> == 1: If <ref> == 1
__actionClass == limitedOperation: If __actionClass == limitedOperation
$trainChoice == rangers: If $trainChoice == rangers
__freeOperation != true: If __freeOperation != true
$trainChoice == arvn-cubes AND <ref> == city OR <expr> > 0: If $trainChoice == arvn-cubes AND <ref> == city OR <expr> > 0
__freeOperation != true: If __freeOperation != true
cap_cords == unshaded: If cap_cords == unshaded
$subAction == pacify AND <expr> > 0 AND <expr> > 0: If $subAction == pacify AND <expr> > 0 AND <expr> > 0
<ref> > 0: If <ref> > 0
cap_cords == shaded: If cap_cords == shaded
<ref> == neutral: If <ref> == neutral
<ref> != passiveSupport AND <ref> != activeSupport AND <ref> != neutral: If <ref> != passiveSupport AND <ref> != activeSupport AND <ref> != neutral
$subAction == replace-cubes-with-base AND <expr> >= 3 AND <expr> < 2: If $subAction == replace-cubes-with-base AND <expr> >= 3 AND <expr> < 2
✓activeLeader == minh: If activeLeader == minh
Available


## US Patrol

Patrol — Select 1-1 spaces
Step 1
Select 0-1 items
Select 0-1 items
Sub-step 1
Sub-step 2
Sub-step 3
and 12 more...

▾
Modifiers (3 active)
✓<ref> == 0: If <ref> == 0
__actionClass == limitedOperation: If __actionClass == limitedOperation
cap_m48Patton == shaded: If cap_m48Patton == shaded
cap_m48Patton == shaded: If cap_m48Patton == shaded
✓US == US: If US == US
<ref> == 1: If <ref> == 1
✓mom_bodyCount != true: If mom_bodyCount != true
__actionClass == limitedOperation: If __actionClass == limitedOperation
cap_m48Patton == shaded: If cap_m48Patton == shaded
cap_m48Patton == shaded: If cap_m48Patton == shaded
ARVN == US: If ARVN == US
Available

## US Sweep

Sweep — Select 1-1 spaces
Step 1
Select 1-1 spaces
Select 0-99 zones
Select 0-99 spaces
Select 0-2 items
Select 1-1 spaces
Select 0-99 zones
Select 0-99 spaces
Select 0-2 items
Sub-step 1
Sub-step 2
Sub-step 3
and 12 more...

▾
Modifiers (2 active)
✓<ref> == 0: If <ref> == 0
__actionClass == limitedOperation: If __actionClass == limitedOperation
cap_caps == shaded: If cap_caps == shaded
<ref> == loc AND <expr> == 0: If <ref> == loc AND <expr> == 0
cap_cobras == unshaded: If cap_cobras == unshaded
cap_boobyTraps == shaded: If cap_boobyTraps == shaded
$__macro_cap_sweep_booby_traps_shaded_cost_actionPipelines_4__stages_4__effects_0__boobyDie <= 3: If $__macro_cap_sweep_booby_traps_shaded_cost_actionPipelines_4__stages_4__effects_0__boobyDie <= 3
✓US == US: If US == US
<ref> == 1: If <ref> == 1
__actionClass == limitedOperation: If __actionClass == limitedOperation
cap_caps == shaded: If cap_caps == shaded
__freeOperation != true: If __freeOperation != true
<ref> == loc AND <expr> == 0: If <ref> == loc AND <expr> == 0
cap_cobras == unshaded: If cap_cobras == unshaded
cap_boobyTraps == shaded: If cap_boobyTraps == shaded
$__macro_cap_sweep_booby_traps_shaded_cost_actionPipelines_5__stages_3__effects_0__boobyDie <= 3: If $__macro_cap_sweep_booby_traps_shaded_cost_actionPipelines_5__stages_3__effects_0__boobyDie <= 3
ARVN == US: If ARVN == US
Available

## US Assault

Assault — Select 1-1 spaces
Step 1
Select 0-0 items
Sub-step 1
Sub-step 2
Sub-step 3
and 6 more...

▾
Modifiers (2 active)
✓<ref> == 0: If <ref> == 0
__actionClass == limitedOperation: If __actionClass == limitedOperation
cap_abrams == shaded: If cap_abrams == shaded
cap_cobras == shaded: If cap_cobras == shaded
$__macro_cap_assault_cobras_shaded_cost_actionPipelines_6__stages_2__effects_0__forEach_effects_0__cobrasDie <= 3: If $__macro_cap_assault_cobras_shaded_cost_actionPipelines_6__stages_2__effects_0__forEach_effects_0__cobrasDie <= 3
cap_m48Patton == unshaded: If cap_m48Patton == unshaded
__freeOperation == true OR mom_bodyCount == true OR arvnResources >= <expr>: If __freeOperation == true OR mom_bodyCount == true OR arvnResources >= <expr>
✓mom_bodyCount != true: If mom_bodyCount != true
__freeOperation != true: If __freeOperation != true
<ref> == 1: If <ref> == 1
__actionClass == limitedOperation: If __actionClass == limitedOperation
__freeOperation != true AND mom_bodyCount != true: If __freeOperation != true AND mom_bodyCount != true
Available

## US Advise

Advise — Select 1-1 spaces
Step 1
Choose: Yes, No
Sub-step 1
Sub-step 2
Sub-step 3
and 2 more...

▾
Modifiers (1 active)
✓<ref> == 0: If <ref> == 0
mom_typhoonKate == true: If mom_typhoonKate == true
<expr> > 0: If <expr> > 0
$adviseMode@{$space} == sweep: If $adviseMode@{$space} == sweep
$adviseMode@{$space} == assault: If $adviseMode@{$space} == assault
$adviseMode@{$space} == activate-remove: If $adviseMode@{$space} == activate-remove
false == true: If false == true
$adviseAid == yes: If $adviseAid == yes
Available

## US Air Lift

Air Lift — Select 1-4 spaces
Step 1
Select 1-4 spaces
Select 0-99 zones
Select 0-4 items
Sub-step 1
Sub-step 2
Sub-step 3
and 1 more...

▾
Modifiers (1 active)
✓<ref> == 0: If <ref> == 0
<ref> != $usLiftDestination@{$usTroop}: If <ref> != $usLiftDestination@{$usTroop}
<ref> != $coinLiftDestination@{$coinLiftPiece}: If <ref> != $coinLiftDestination@{$coinLiftPiece}
Available

## US Air Strike

Air Strike — Select 0-0 spaces
Step 1
Select 0-0 spaces
Select 0-0 spaces
Set Air Strike Remaining to <expr>
Choose: Yes, No
Sub-step 1

▾
Modifiers (1 active)
✓<ref> == 0: If <ref> == 0
$degradeTrail == yes AND trail > 0 AND mom_oriskany != true AND fitl_acesAirStrikeWindow != true AND mom_wildWeasels != true OR <expr> == 0: If $degradeTrail == yes AND trail > 0 AND mom_oriskany != true AND fitl_acesAirStrikeWindow != true AND mom_wildWeasels != true OR <expr> == 0
cap_topGun == shaded: If cap_topGun == shaded
$topGunDie >= 4: If $topGunDie >= 4
cap_migs == shaded AND cap_topGun != unshaded: If cap_migs == shaded AND cap_topGun != unshaded
cap_sa2s == unshaded: If cap_sa2s == unshaded
cap_migs == shaded AND cap_topGun != unshaded: If cap_migs == shaded AND cap_topGun != unshaded
cap_sa2s == unshaded: If cap_sa2s == unshaded
Available

