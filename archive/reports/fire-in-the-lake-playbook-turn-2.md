# Fire in the Lake - Playbook Turn 2

**Status**: COMPLETED

This turn #2 starts from when turn #1 ended.

GAME TURN 2, Trucks
Since they Passed last turn and are the first faction listed on this card,
the NVA is potentially 1st Eligible. Having just witnessed the prior
ARVN actions, the North Vietnamese Army is now ready to respond.
Looking at the shaded bottom Event text, the NVA believes that it
would not be all that helpful to them at the moment. However, the
top unshaded Event text on the card would lower the Trail value to 0.
This would impact NVA March Op throughout Laos and Cambodia
(The Trail, 3.3.2), affect NVA Rally (3.3.1), and also lower NVA
resource earnings during a Coup Round (6.2.4). Plus, as required on
the card, the NVA would have to remove 4 of their pieces from each
of those two named foreign countries, for a grand total of 8 pieces.
That’s not good from an Insurgent point of view, so while the NVA
do not want to execute an Event, they also do not want to give the
next Eligible COIN faction—the US—the chance to do so either.
The NVA block the Event by selecting Op only.
The NVA thus decide to perform an Operation only, without any
Special Activity, and so moves their red Eligibility token to the
Execute Op only box on the Sequence of Play chart. This means
that the 2nd Eligible faction will only be able to conduct a Limited
Operation (2.3.5) or Pass. The Event option is therefore effectively
blocked and will not be able to be conducted on this card.
Wishing to get more strength onto the map, the NVA declares
Rally (3.3.1) as their Operation. They take 4 white pawns, placing
one each in North Vietnam and The Parrot’s Beak, along with the
Mekong Provinces of Kien Phong and Kien Giang. At a resource
cost of 1 per space, the NVA marker on the track will reduce from
11 resources to 7.
North Vietnam and The Parrot’s Beak have no Support (which would
prohibit NVA Rally), and the NVA do have a Base in each space.
The Bases allow them to place 2 Guerrillas face-down (Guerrillas
always place face-down Underground, 1.4.3) into each of these two
spaces, 1 for their Base + 1 for the current Trail value.
Kien Giang and Kien Phong have Active Opposition (no Support),
but there is no NVA Base present so only 1 Guerrilla can place in
each of those two Provinces.
In Kien Giang and Kien Phong there are no COIN pieces present,
so just 2 Insurgent pieces (1 VC and 1 NVA) occupy each space.
However, the NVA does not gain Control of either Province because
they must have more pieces then all the other factions combined,
including VC (1.7).
The NVA begin a build-up to threaten the Delta.
As part of their Rally Op, the NVA player may then expend 2
Resources to improve the Trail by one box (3.3.1). They choose to
do so now, moving the Trail token from its 1 box to the 2 box, and
lowering NVA resources from 7 to 5. The NVA will not execute a
Special Activity, so their player-turn is now over and their white
pawns are removed.
Normally the VC would be up next on the Trucks card, but since
they are Ineligible they are skipped and the US faction is due next
to be 2nd Eligible. Confronted with performing a Limited Op or
Passing, the US feels compelled to do something, so they will choose
a Limited Op (limited to 1 space with no Special Activity, 2.3.5).
Move the green US Eligibility token to the Limited Op box on the
map’s Sequence of Play chart.
The US will perform a Sweep Operation (3.2.3) in Quang Tri, so
place a white pawn in the selected Province. The Sweep costs 0
resources to perform; the US does not record its own resources and
instead uses ARVN resources for Joint Operations when necessary
(1.8.1), but this is not such an Operation. 
No Troop movement is desired in this case since the US player
already has enough units (1 Special Forces Irregular + 1 Troop) to
Activate the 2 Underground VC Guerrillas in Quang Tri, a Highland
Province. Turn over the two VC Guerrillas to their Active (embossed)
side via the Sweep.
US forces Sweep Quang Tri Province: Irregulars and Troops locate
(Activate) 2 VC Guerrilla units.
Without any Underground units to protect it (Troops first, Bases
last, 3.2.4), the VC Base in Quang Tri is now dangerously exposed.
Remove the white pawn from the map, and the US’s player-turn is
complete.
Two Eligible factions have acted, so the game turn is over. Move
the VC and ARVN tokens to Eligible, and shift both the NVA and
US Eligibility tokens to Ineligible. Green Berets will be the current
card after being placed atop Trucks. Reveal the next card from the
deck, Gulf of Tonkin, as our preview card.

---

## Outcome

- **Completion date**: 2026-02-26
- **What was done**: Added comprehensive intermediate and end-state assertions to Turn 2 of the FITL playbook golden test (`packages/engine/test/e2e/fitl-playbook-golden.test.ts`).
  - Move 1 (NVA Rally): `expectedState` with 6 global vars, 21 zone token count checks (including underground props verification, NVA bases, VC base presence, US pieces, Saigon garrison, available NVA guerrillas), markers, and 4 computed victory values (US=41, NVA=4, VC=27, ARVN=35).
  - Turn 2 end state (after US Sweep): Enhanced `expectedEndState` with underground props for NVA guerrillas, NVA bases, VC base presence in Quang Tri (Sweep does NOT remove bases), VC guerrilla activation states (active=2, underground=0), US pieces, Saigon garrison, available NVA (2) and VC (14) guerrillas, `globalMarkers` (activeLeader='minh'), and 4 computed victory values.
- **Key verification**: VC Base in Quang Tri confirmed present (count=1) after Sweep — Sweep activates guerrillas but does not remove pieces.
- **Test results**: All 45 e2e tests pass (44 pass, 1 skipped, 0 failures).
- **No production code bugs found**: All assertion values matched expected game state.