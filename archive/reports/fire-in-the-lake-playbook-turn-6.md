# Fire in the Lake - Playbook Turn 6

**Status**: ✅ COMPLETED

## Turn 6 - Henry Cabot Lodge

By previously Passing and now being 1st Eligible, the ARVN are
able to select any option on the Sequence of Play. They decide to
conduct an Op & Special Activity. Place their yellow Eligibility token
in the appropriate box on the Sequence of Play chart.
This time the ARVN will first perform their Special Activity,
namely a Raid (4.3.3). A faction executing Op & Special Activity
may perform the Special Activity at any one time before, during,
or immediately after the Operations (4.1). Raids are allowed in up
to 2 spaces, but because the ARVN only have 1 Ranger currently in
play they place a black pawn in Quang Tri and forgo a second space.
The ARVN Ranger in Quang Nam moves into the adjacent destination Province of Quang Tri. The Ranger Activates (flips) to remove
2 NVA Guerrillas back to their NVA Available box. For a Raid, it
doesn’t matter if the enemy Guerrillas are Active or Underground (as
it does for an Assault, 3.2.4, for example); they are simply removed.
Checking for a Control change, we see that the NVA now have 5
pieces (Guerrillas) in Quang Tri while all other factions have 7 (4
VC, 2 US, and 1 ARVN) combined. The NVA thus lose Control of
the Province so remove their Control marker and lower the NVA
victory marker on the Track from 10 to 8 (2 spaces to match Quang
Tri’s 2 population). No one Controls Quang Tri at the present time.
Note that the Ranger unit from Quang Nam might instead have
Raided into Central Laos to eliminate the NVA Guerrilla and
vulnerable NVA Base there. Such a Raid would have established
COIN Control of that Laotian Province, which would threaten to
reduce the efficiency level of the Ho Chi Minh Trail if held until the
next Coup Round (6.2.2, 6.7). However, any ARVN or US pieces
caught in neutral Laos or Cambodia in the Coup Round are removed
(6.4.1), so the ARVN player opts for the more cautious Raid into
Quang Tri instead.
For their Operation, the ARVN will Sweep (3.2.3), which is an accompanying Op to a Raid. White pawns are placed into the Highland
Provinces of Binh Dinh and Pleiku. At a cost of 3 Resources each, lower the ARVN resources marker on the Track from 27 to 21.
During their Sweep, the ARVN are only allowed to move their own
Troop cubes and not Police or Rangers, even though any Rangers
or Police already present in a selected space being swept could help
in Activating (exposing) Underground enemy Guerrillas (3.2.3).
Sweeping Troops may first move onto a LoC (Highway or Mekong)
that has no VC or NVA on it before entering a destination Province
or City. The 2 ARVN Troops in Qui Nhon do not need to move onto
a LoC, however, because they are Sweeping directly into an adjacent
space, namely Binh Dinh Province. Upon doing so, the Troop cubes
Activate (flip) the 2 VC Guerrillas there on a 1‑for-1 basis.
Of the 8 ARVN Troop cubes in Saigon, 6 will take a LoC out of
the City and 2 will remain behind. The ARVN Troops from Saigon
move to the 1‑Economic value LoC which connects not only to the
City of An Loc, but also all the way up to the town (large black dot)
of Ban Me Thuot. Towns exist solely to provide adjacency (they are
not spaces themselves but rather serve as terminals for LoCs, 1.3.6),
so these 6 cubes will be able to Sweep into Pleiku (which is adjacent
to the town of Ban Me Thuot). There are more than enough ARVN
cubes to Activate all 4 Underground VC Guerrillas in Pleiku on a
1-for-1 basis, so flip those 4 VC pieces over.
Because Pleiku now contains 9 COIN pieces (6 ARVN and 3 US) to
5 Insurgent pieces (5 VC), COIN Control is attained. Place a COIN
Control marker in Pleiku and bump the ARVN victory marker 1 space
on the Track from 37 to 38 for Pleiku’s 1 population. (No Control
changes occur in Binh Dinh Province as a result of the Sweep.)
The ARVN player-turn is over, so remove all of their pawns from
the map.
The NVA, as 2nd Eligible, can now execute the Event, perform a
Limited Op, or Pass. Being low on resources, the NVA opt to Pass
again and collect a resource, moving their marker from 2 to 3 on the
Track. Place the red Eligibility token in the Pass box on the map.
The US is now 2nd Eligible, so they will perform a Limited Op.
Place the green Eligibility token in the “2nd Faction Lim Op or
Event” box on the Sequence track. The US places a white pawn into
Pleiku, where an Assault (3.2.4) is declared. This costs 0 resources
for the US to conduct.
Normally in a Highland Province, the US removes 1 Active enemy piece per 2 US Troop cubes when Assaulting. Since the US has only
1 Troop cube in Pleiku (the US Special Forces cylinder there cannot
participate in an Assault), the US Op may appear to be wasted at first
glance. However, the US has a Base present which allows them to
remove 2 Active enemy pieces per US Troop cube, regardless of the
terrain (representing the effect of numerous US artillery fire bases).
So take 2 of the Active VC Guerrillas from Pleiku and return them
to their Available box.
A Special Activity cannot be performed with a Limited Op (2.3.5),
but the US isn’t quite done yet. Part of a US Assault Op is the option
to add an ARVN Assault in 1 same selected space. Since there are 6
ARVN cubes in Pleiku, the US will spend 3 Resources (lowering the
ARVN marker on the Track from 21 to 18) to Assault with the ARVN.
The ARVN aren’t as efficient as the US in Assaults, and a US Base
being present doesn’t help the ARVN in any way either. So they can
only remove 1 Active enemy piece for every 3 ARVN Troop cubes
because the ARVN Assault is taking place in a Highland Province. 
After removing the 2 Active VC Guerrillas (for the 6 ARVN cubes),
the only Insurgent piece left in the space is a VC Base. Control in
Pleiku doesn’t change as a result of the COIN Assault.
The turn is over, so reset Eligibility tokens and remove the pawn from
the map. Henry Cabot Lodge is covered by Booby Traps which then
becomes the current card. Reveal the next card from the deck as the
next preview card – it is a Coup! (Nguyen Khan, an RVN leader).

## Outcome

- **Completion date**: 2026-02-27
- **What changed**: Enriched `fitl-playbook-golden.test.ts` Turn 6 with ~116 individual assertions covering all 3 moves and the end-of-turn state. Added expectedState to Move 2 (NVA pass) which previously had none. Expanded expectedEndState from 9 zone checks to 34 across 16 zones, added available-box counts, marker/globalMarker/zoneVar persistence, and all 4 victory markers.
- **Deviations**: NVA available guerrilla count was 6 (not 4 as initially estimated in the plan) because Turn 4's Infiltrate already changed the available count from 2→4 before Turn 6's raid added +2.
- **Verification**: All 44 E2E tests pass (0 failures, 1 skipped). All 10 playbook turns pass including the enriched Turn 6.