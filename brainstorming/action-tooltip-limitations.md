# Action Tooltip Limitations

## US Train

Train — Select 1 <value> is city or <value> is province and <value> > 0
Step 1
Select 1 <value> is city or <value> is province and <value> > 0
Select 1-99 <value> is city or <value> is province and <value> > 0
Choose: Place Irregulars, Place At Base
Select up to 2 items
Select up to 1 items
Choose: Pacify, Saigon Transfer (optional)
Select 1 <value> is city or <value> is province and <value> ≤ <value>
Select 1-99 <value> is city or <value> is province and <value> ≤ <value>
Choose: Rangers, ARVN Cubes
Select up to 2 items
Select up to 1 items
Choose: Pacify, Replace Cubes With Base (optional)
Gain 5 Aid
Move forces
Move __macro_place_from_available_or_map_action Pipelines_0__stages_1__effects_0__for Each_effects_1__if_then_0__piece from <expr> to Space
Choose option
Choose: Rangers, ARVN Cubes
Move forces
Move __macro_place_from_available_or_map_action Pipelines_0__stages_1__effects_0__for Each_effects_2__if_then_1__if_then_0__piece from <expr> to Space
Pay resources
Pay 3 ARVN Resources
Select 1-6 items
Move __macro_place_from_available_or_map_action Pipelines_0__stages_1__effects_0__for Each_effects_2__if_then_2__if_then_2__for Each_effects_0__piece from <expr> to Space
Choose option
Choose:
Set Patronage to <expr>
Set ARVN Resources to $transferAmount
Pay resources
Pay 3 ARVN Resources
Move forces
Move __macro_place_from_available_or_map_action Pipelines_1__stages_1__effects_0__for Each_effects_1__if_then_1__piece from <expr> to Space
Pay resources
Pay 3 ARVN Resources
Move forces
Move __macro_place_from_available_or_map_action Pipelines_1__stages_1__effects_0__for Each_effects_2__if_then_1__piece from <expr> to Space
Set values
Set ARVN Resources to <expr>
Set values
Set ARVN Resources to <expr>
Shift 1 level toward Active Support
Choose:
Set ARVN Resources to <expr>
Shift Support/Opposition by $pacLevels
Choose:
Set ARVN Resources to <expr>
Shift Support/Opposition by $pacLevels
Pay resources
Pay 3 ARVN Resources
Remove pieces
Remove Cube from Sub Space to ARVN Available Forces
Move forces
Move __macro_place_from_available_or_map_action Pipelines_1__stages_2__effects_1__for Each_effects_2__if_then_2__piece from <expr> to Sub Space

▾
Modifiers (2 active)
✓<value> is 0: If <value> is 0
Train Choice is Place Irregulars: If Train Choice is Place Irregulars
Train Choice is Place At Base and <value> > 0: If Train Choice is Place At Base and <value> > 0
Base Train Choice is Rangers: If Base Train Choice is Rangers
CAPS is Unshaded: If CAPS is Unshaded
CORDS is Unshaded: If CORDS is Unshaded
Sub Action is Pacify and <value> > 0: If Sub Action is Pacify and <value> > 0
Sub Action is Saigon Transfer and <value> is Saigon: If Sub Action is Saigon Transfer and <value> is Saigon
<value> is 1: If <value> is 1
Train Choice is Rangers: If Train Choice is Rangers
Train Choice is ARVN Cubes and <value> is City or <value> > 0: If Train Choice is ARVN Cubes and <value> is City or <value> > 0
Sub Action is Pacify and <value> > 0 and <value> > 0: If Sub Action is Pacify and <value> > 0 and <value> > 0
<value> > 0: If <value> > 0
CORDS is Shaded: If CORDS is Shaded
<value> is Neutral: If <value> is Neutral
<value> is not Passive Support and <value> is not Active Support and <value> is not Neutral: If <value> is not Passive Support and <value> is not Active Support and <value> is not Neutral
Sub Action is Replace Cubes With Base and <value> ≥ 3 and <value> < 2: If Sub Action is Replace Cubes With Base and <value> ≥ 3 and <value> < 2
✓Active Leader is Duong Van Minh: If Active Leader is Duong Van Minh
Available

## US Patrol

Patrol — Select 1 <value> is line of communication
Step 1
Select up to 1 items
Select up to 1 items
Select spaces
Select 1 <value> is line of communication
Select spaces
Select 1-99 <value> is line of communication
Select spaces
Select 0 Faction eq us and type in <expr>
Move forces
Move Cube from <expr> to Loc
Set Cube.m48patrol Moved to true
Select spaces
Select up to 2 Faction eq us and type in <expr> and m48patrol Moved eq true
Remove pieces
Remove __macro_cap_patrol_m48_shaded_moved_cube_penalty_action Pipelines_2__stages_4__effects_0__m48cube from <expr> to US Casualties
Remove __macro_cap_patrol_m48_shaded_moved_cube_penalty_action Pipelines_2__stages_4__effects_0__m48cube from <expr> to ARVN Available Forces
Set values
Set __macro_cap_patrol_m48_shaded_moved_cube_penalty_action Pipelines_2__stages_4__effects_0__m48moved Cube.m48patrol Moved to false
Pay resources
Pay 3 ARVN Resources
Select spaces
Select 1 <value> is line of communication
Select spaces
Select 1-99 <value> is line of communication
Select spaces
Select up to 99 Faction eq arvn and type in <expr>
Move forces
Move Cube from <expr> to Loc
Set Cube.m48patrol Moved to true
Select spaces
Select up to 2 Faction eq arvn and type in <expr> and m48patrol Moved eq true
Remove pieces
Remove __macro_cap_patrol_m48_shaded_moved_cube_penalty_action Pipelines_3__stages_4__effects_0__m48cube from <expr> to US Casualties
Remove __macro_cap_patrol_m48_shaded_moved_cube_penalty_action Pipelines_3__stages_4__effects_0__m48cube from <expr> to ARVN Available Forces
Set values
Set __macro_cap_patrol_m48_shaded_moved_cube_penalty_action Pipelines_3__stages_4__effects_0__m48moved Cube.m48patrol Moved to false

▾
Modifiers (2 active)
✓<value> is 0: If <value> is 0
M48 Patton is Shaded: If M48 Patton is Shaded
✓US is US: If US is US
<value> is 1: If <value> is 1
ARVN is US: If ARVN is US
Available

## US Sweep

Sweep — Select 1 <value> is province or <value> is city and <value> is not north vietnam
Step 1
Select 1 <value> is province or <value> is city and <value> is not north vietnam
Select up to 99 Faction eq us and type eq troops
Select up to 99 spaces
Select up to 2 items
Select 1 <value> is province or <value> is city and <value> is not north vietnam
Select up to 99 Faction eq arvn and type eq troops
Select up to 99 spaces
Select up to 2 items
Select spaces
Select 1-2 <value> is province or <value> is city and <value> is not north vietnam
Select spaces
Select 1-99 <value> is province or <value> is city and <value> is not north vietnam
Move forces
Move Troop from <expr> to Space
Select spaces
Select up to 99 Faction eq us and type eq troops
Move __macro_sweep_loc_hop_action Pipelines_4__stages_1__effects_0__for Each_effects_2__hop Troop from <expr> to Space
Remove pieces
Remove __macro_cap_sweep_cobras_unshaded_removal_action Pipelines_4__stages_3__effects_0__target from <priority> to <expr> (up to 1)
Remove __macro_cap_sweep_cobras_unshaded_removal_action Pipelines_4__stages_3__effects_0__target from <priority> to <expr> (up to 1)
Remove __macro_cap_sweep_cobras_unshaded_removal_action Pipelines_4__stages_3__effects_0__target from <priority> to <expr> (up to 1)
Roll dice
Roll 1-6
Move forces
Move __macro_cap_sweep_booby_traps_shaded_cost_action Pipelines_4__stages_4__effects_0__loss Troop from __macro_cap_sweep_booby_traps_shaded_cost_action Pipelines_4__stages_4__effects_0__space to <expr>
Move __macro_cap_sweep_booby_traps_shaded_cost_action Pipelines_4__stages_4__effects_0__loss Troop from __macro_cap_sweep_booby_traps_shaded_cost_action Pipelines_4__stages_4__effects_0__space to <expr>
Select spaces
Select 1-0 <value> is province or <value> is city and <value> is not north vietnam
Select spaces
Select 1-0 <value> is province or <value> is city and <value> is not north vietnam
Pay resources
Pay 3 ARVN Resources
Move forces
Move Troop from <expr> to Space
Select spaces
Select up to 99 Faction eq arvn and type eq troops
Move __macro_sweep_loc_hop_action Pipelines_5__stages_1__effects_0__for Each_effects_3__hop Troop from <expr> to Space
Remove pieces
Remove __macro_cap_sweep_cobras_unshaded_removal_action Pipelines_5__stages_2__effects_0__target from <priority> to <expr> (up to 1)
Remove __macro_cap_sweep_cobras_unshaded_removal_action Pipelines_5__stages_2__effects_0__target from <priority> to <expr> (up to 1)
Remove __macro_cap_sweep_cobras_unshaded_removal_action Pipelines_5__stages_2__effects_0__target from <priority> to <expr> (up to 1)
Roll dice
Roll 1-6
Move forces
Move __macro_cap_sweep_booby_traps_shaded_cost_action Pipelines_5__stages_3__effects_0__loss Troop from __macro_cap_sweep_booby_traps_shaded_cost_action Pipelines_5__stages_3__effects_0__space to <expr>
Move __macro_cap_sweep_booby_traps_shaded_cost_action Pipelines_5__stages_3__effects_0__loss Troop from __macro_cap_sweep_booby_traps_shaded_cost_action Pipelines_5__stages_3__effects_0__space to <expr>

▾
Modifiers (2 active)
✓<value> is 0: If <value> is 0
CAPS is Shaded: If CAPS is Shaded
<value> is Line of Communication and <value> is 0: If <value> is Line of Communication and <value> is 0
Cobras is Unshaded: If Cobras is Unshaded
Booby Traps is Shaded: If Booby Traps is Shaded
✓US is US: If US is US
<value> is 1: If <value> is 1
ARVN is US: If ARVN is US
Available

## US Assault

Assault — Select 1 <value> > 0 and <value> > 0
Step 1
Select 0 items
Select spaces
Select 1 <value> > 0 and <value> > 0
Select spaces
Select 1-2 <value> > 0 and <value> > 0
Select 1-99 <value> > 0 and <value> > 0
Roll dice
Roll 1-6
Move __macro_cap_assault_cobras_shaded_cost_action Pipelines_6__stages_2__effects_0__for Each_effects_0__cobras Loss Troop from Space to <expr>
Select spaces
Select up to 2 <value> in target spaces and not terrain tags includes lowland
Select spaces
Select up to 1 items
Pay resources
Pay 3 ARVN Resources
Select spaces
Select 1 <value> > 0 and <value> > 0
Select spaces
Select 1-0 <value> > 0 and <value> > 0
Pay resources
Pay 3 ARVN Resources

▾
Modifiers (1 active)
✓<value> is 0: If <value> is 0
Abrams is Shaded: If Abrams is Shaded
Cobras is Shaded: If Cobras is Shaded
M48 Patton is Unshaded: If M48 Patton is Unshaded
<value> is 1: If <value> is 1
Available

## US Advise

Advise — Select 1 <value> is province or <value> is city and <value> is not north vietnam
Step 1
Choose: Yes, No
Select spaces
Select 1 <value> is province or <value> is city and <value> is not north vietnam
Select spaces
Select 1-2 <value> is province or <value> is city and <value> is not north vietnam
Choose option
Choose: Assault, Activate Remove
Choose: Sweep, Assault, Activate Remove
Activate pieces
Activate Friendly Sf in
Remove __macro_us_sa_remove_insurgents_action Pipelines_16__stages_1__effects_0__for Each_effects_3__if_then_1__target from <priority> to <expr> (up to 2)
Remove __macro_us_sa_remove_insurgents_action Pipelines_16__stages_1__effects_0__for Each_effects_3__if_then_1__target from <priority> to <expr> (up to 2)
Remove __macro_us_sa_remove_insurgents_action Pipelines_16__stages_1__effects_0__for Each_effects_3__if_then_1__target from <priority> to <expr> (up to 2)
Gain resources
Gain 6 Aid

▾
Modifiers (1 active)
✓<value> is 0: If <value> is 0
<value> > 0: If <value> > 0
Advise Mode@{$space} is Sweep: If Advise Mode@{$space} is Sweep
Advise Mode@{$space} is Assault: If Advise Mode@{$space} is Assault
Advise Mode@{$space} is Activate Remove: If Advise Mode@{$space} is Activate Remove
false is true: If false is true
Advise Aid is Yes: If Advise Aid is Yes
Available

## US Air Lift

Air Lift — Select 1-4 <value> is not north vietnam
Step 1
Select 1-4 <value> is not north vietnam
Select up to 99 Faction eq us and type eq troops
Select up to 4 items
Choose option
Choose:
Move forces
Move US Troop from <expr> to <expr>
Choose option
Choose:
Move forces
Move COIN Lift Piece from <expr> to <expr>

▾
Modifiers (1 active)
✓<value> is 0: If <value> is 0
<value> is not US Lift Destination@{$us Troop}: If <value> is not US Lift Destination@{$us Troop}
<value> is not COIN Lift Destination@{$coin Lift Piece}: If <value> is not COIN Lift Destination@{$coin Lift Piece}
Available

## US Air Strike

Air Strike — Select 0 spaces
Step 1
Select 0 spaces
Select 0 spaces
Set Air Strike Remaining to <expr>
Choose: Yes, No

▾
Modifiers (1 active)
✓<value> is 0: If <value> is 0
Available