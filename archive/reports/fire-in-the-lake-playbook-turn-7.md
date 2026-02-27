**Status**: COMPLETED

# Fire in the Lake - Playbook Turn 7

## GAME TURN 7, Booby Traps
An Event card just prior to a Coup! is always a Monsoon Season
(2.3.9), so place the provided Monsoon marker atop the Booby
Traps card as a reminder. Interestingly enough, only the Insurgent
factions happen to be Eligible on this card as both COIN factions
are Ineligible.
Booby Traps is highlighted as a VC Capability; unlike a chosen
Momentum (5.4) card which lasts only until the Reset Phase (6.5)
of the next Coup Round, a Capability (5.3) is an Event that remains
in effect the entire game when executed.
The VC want to execute the shaded bottom Event, so they bring
Booby Traps into play by placing its associated reminder marker
on the darker (shaded) side into the Capabilities box located on the
game board. For the rest of the game, the VC have a 50/50 chance
(die roll of 1‑3) to remove a Sweeping COIN cube in each and every
space that is being swept. However, there is no immediate benefit:
the Capability is a long-term investment. The VC player-turn is over.
The NVA intend to perform an Op & Special Activity, but they
will be restricted by the Monsoon (i.e., no Insurgent March, 2.3.9).
They place a white pawn in Quang Tri to indicate their intention
to Attack (3.3.3) there only, and thus reduce their resources from 3
to 2 on the Track.
The NVA have a choice for what type of Attack they will conduct.
For a normal Attack, they must Activate all five of their Guerrillas
in the space for a 5/6 chance (die roll 1-5) of removing any 2 of the
3 COIN pieces present. If successful, they could select any 2 of the
enemy cubes and Special Forces cylinders present, but they would
also lose 1 of their Guerrillas to attrition to match the US Troop
cube if the US Troops are removed (no Attacking Insurgent pieces
are removed to account for Special Forces or ARVN pieces, 3.3.3).
Or the NVA can Ambush (4.4.3) in lieu of normal Attack to ensure
(no die roll is made in an Ambush) the removal of a COIN piece
without an attrition loss of one their own. Since the lone US Troop
cube is the NVA’s primary target for this Attack, they will Ambush.
Flip 1 of the NVA Guerrillas to Active and send the US Troop cube
to the US Casualties box.
Control in Quang Tri doesn’t change because of the NVA Attack,
and their player-turn is now over.
The game turn (and the Monsoon Season) are over, so remove any
pawns from the map, and set the Booby Traps card in front of the
VC as a handy reference for its lasting effect. A Coup Round (6.0)
will now interrupt the normal Sequence of Play. Before doing so,
reveal the following Event card, Sihanouk.

## Outcome

- **Completion date**: 2026-02-27
- **Changes**: Enriched FITL playbook golden test Turn 7 assertions in `packages/engine/test/e2e/fitl-playbook-golden.test.ts`. Added comprehensive assertions for Move 1 (VC shaded Booby Traps event), Move 2 (NVA Attack + Ambush in Quang Tri), and end state — including global var persistence (infiltrateCount, terrorSabotageMarkersPlaced), zone token counts (Quang Tri pieces, US irregular, VC base, casualties), all 4 support/opposition markers, activeLeader global marker, Hue zone vars, all 4 victory computed values, available box counts, pending free-operation grants, and full board persistence from Turn 6 across 13+ zones.
- **Deviations**: None
- **Verification**: All 44 e2e tests pass (0 failures)