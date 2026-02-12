# Implementing Fire in the Lake GameSpecDoc

We're very early in app development, and we want to implement the first GameSpecDoc for production: that for the COIN game Fire in the Lake. This is an extremely-complex game, which means that if we manage to codify it and make it run and we implement one or more e2e tests that prove the manual's example few turns are processed by our simulation as expected, then we'll be able to implement a wide range of games in the future.

Note: our app's pipeline is GameSpecDoc -> GameDef -> simulation . All game-specific data goes into the GameSpecDoc, while GameDef and the code are game-agnostic.

We have done a previous pass of analyzing the game's rules to figure out what foundation logic we needed to add to the GameSpecDoc, GameDef and simulations . Search for test/*fitl* to see the available fixtures and tests.

We're very early in development. If throughout trying to implement anything related to this brainstorming document you realize that what you need to implement fits awkwardly into the current architecture, don't "hack it" or "patch it in": propose clean, robust architectural changes that stand the test of time. No backwards compatibility, no legacy paths. The breaking changes will need to be fixed.

## Fire in the Lake Rules

1.0 INTRODUCTION
Fire in the Lake is a 1- to 4-player board game depicting insurgent
and counterinsurgent (COIN) conflict during the main US period
in Vietnam, 1964-1972, up to the “Paris Peace”. Each player takes
the role of a Faction seeking to set the fate of South Vietnam: the
United States (US), North Vietnamese forces (NVA), the Republic
of Vietnam forces (ARVN), or the southern communist Viet Cong
(VC). Using military, political, and economic actions and exploiting various events, players build and maneuver forces to influence
or control the population, extract resources, or otherwise achieve
their Faction’s aims. A deck of cards regulates turn order, events,
victory checks, and other processes. The rules can run non-player
Factions, enabling solitaire, 2-player, or multi-player games.
Fire in the Lake is Volume IV in the COIN Series of games that
use similar rules to cover modern Insurgencies. The Playbook lists
major rules differences from earlier volumes.
Game set up is explained on pages 23-24 of this rule book. An
index on pages 21-22 lists and defines key game terms. Sequences
and options for player and non-player actions are summarized on
several aid sheets. 

1.1 General Course of Play
Fire in the Lake—unlike many card-assisted war games—does not
use hands of cards. Instead, cards are played from the deck one
at time, with one card ahead revealed to all players. Each Event
card shows the order in which the Factions become Eligible to
choose between the card’s Event or one of a menu of Operations
and Special Activities. Executing an Event or Operation carries
the penalty of rendering that Faction Ineligible to do so on the next
card. Coup cards mixed in with the Event cards provide periodic
opportunities for instant wins and for activities such as collecting
resources and influencing popular sympathies.

1.2 Components
A complete set of Fire in the Lake includes:
• A 22”x34” mounted game board (1.3).
• A deck of 130 cards (5.0).
• 229 olive, bright blue, red, yellow, and orange wooden playing
pieces, many embossed (1.4; see “Forces Pool” on the Spaces
List sheet for a complete listing).
• 7 embossed cylinders (1.8, 2.2).
• 6 black and 6 white pawns (3.1.1).
• A sheet of markers.
• 2 Sequence of Play and Spaces List sheets (1.4.1, 2.0, 6.0).
• 4 Faction player aid foldouts (3.0, 4.0, 7.0).
• A Random Spaces and Non-player Events foldout (8.2, 8.4).
• 2 Non-player Operations foldouts (8.5-8.8).
• 3 6-sided dice—1 blue, 1 red, 1 yellow.
• A background play book.
• This rule book.

1.3 The Map
The map shows South Vietnam and nearby areas divided into various
types of spaces.
1.3.1 Map Spaces. Map spaces include rural Provinces, Cities, and
Lines of Communication (LoCs) that are either Highways or the
Mekong river. All spaces—including LoCs—can hold forces. Towns
are not spaces, merely boundaries between adjacent LoCs (1.3.6)
1.3.2 Provinces. Each Province shows a Population value (Pop) of
0, 1, or 2 that affects victory via Support for or Opposition to the
Saigon regime (1.6) or Control (1.7) and some Insurgent actions.
Provinces are further distinguished as Highland, Lowland, or Jungle,
affecting Counterinsurgent Sweeps (3.2.3), Assaults (3.2.4), and
certain Events (5.0).

1.3.3 Cities. Cities similarly show Population value of 1, 2, or 6.
DESIGN NOTE: Each Population value represents about 500,000
citizens of South Vietnam.
1.3.4 LoCs. Each Line of Communication (LoC) space is either
Highway (road) or Mekong (river) or both and shows an Economic
value (Econ) of 0, 1, or 2 affecting ARVN Resource earnings (1.8,
6.2.3) and Viet Cong Taxation (4.5.1). NOTE: LoCs are spaces!
1.3.5 Foreign Countries. The map’s Provinces include parts of
North Vietnam, Laos, and Cambodia. All other spaces are South
Vietnam (“The South”). Only NVA and VC may stack in North
Vietnam (1.4.2). US and ARVN may enter Laos or Cambodia spaces
normally, but at risk of later removal (6.4.1).
1.3.6 Adjacency. Adjacency affects the movement of forces and
implementation of certain Events. Any 2 spaces meeting one of the
following conditions are adjacent:
• Spaces that border on (touch) one another.
• Provinces that would touch but for separation by a LoC.
• LoCs or Provinces separated by Towns.
NOTE: Towns are not spaces; they merely terminate LoCs (1.3.1).

ADJACENCY EXAMPLE: Quang Duc Province and Route 11 are
adjacent via Da Lat, as are Quang Duc and Khanh Hoa across
Route 21.
1.3.7 Coasts. Any spaces adjacent to blue ocean (including across
a LoC) are coastal, affecting the Amphibious Landing, Operation
Starlite, and USS New Jersey Events (5.0).
1.3.8 Overflow. Use “Overflow” boxes for
pieces that exceed the room in a space on the
map; place the lettered marker in that space.
1.4 Forces
The wooden pieces represent the Factions’ various forces: US Troops
(olive cubes), ARVN Troops (yellow cubes) and Police (orange
cubes), NVA Troops (red cubes), NVA and VC Guerrillas, US and
ARVN Special Forces (SF), and all Factions’ Bases.
DESIGN NOTE: ARVN Police represent both urban police and
rural militias such as Regional Forces and Popular Forces. US-led
Irregulars include both CIDG counter-guerrillas and US special
operations forces training them or operating on their own. Bases
represent command, training, and supply facilities as well as political administration.
1.4.1 Availability, Removal, and Out of Play. A “Force Pool” inventory on the Spaces List sheet shows the number of pieces in the
game. Keep forces Available for placement in the Faction’s Available
Forces box (or the US-led Irregulars box). Place NVA and VC Bases
in the highest- and US Bases and Troops in the lowest-numbered empty spaces to show the number of on-map Bases and Available
US Bases and Troops to help track earnings (6.2) and victory (7.0).
US and ARVN may have forces in the Out of Play box—neither
Available nor on the map—and US forces can become Casualties
(3.3.3, 4.4.2, 5.0, 6.5). Otherwise, forces removed from the map
go to Available.
• Unless otherwise instructed (by Event, 5.1.1), forces may only be
placed from or replaced with those in the Available boxes. A piece
to be replaced by a piece that is unavailable is simply removed
(EXCEPTION: Infiltrate, 4.4.1).
•	 Important: Players while executing an Operation, Special Activity, or Event to place their own forces may take them from
elsewhere on the map (including a Tunneled Base, losing the
Tunnel marker, 1.4.4) if and only if the desired force type is not
Available. EXCEPTION: The US player may do so only with
US-led Irregulars and any ARVN forces, not with US Troops nor
with US Bases.
EXAMPLES: NVA without Available Guerrillas could remove its
own during a Rally (3.3.1) to place them Underground. US Train
could take Police from another space if none Available.
1.4.2 Stacking. No more than 2 Bases (of any Factions) may occupy
a single Province or City. Bases may not occupy LoCs. Only NVA
and VC forces may occupy North Vietnam (1.3.5).
• Placing (such as Bases via Train 3.2.1, Rally 3.3.1, Event 5.1.1, or
Commitment 6.5) or moving forces may never violate stacking.
1.4.3 Underground/Active. Guerrillas and Special Forces are
either Underground—symbol end down—or Active—symbol end
up. Actions and Events flip them from one to the other state. Bases,
Troops, and Police are always Active. Always set up and place new Guerrillas and SF Underground (including if replacing a piece).
NOTE: Unless instructions specify “Underground” Guerrilla, it is
sufficient to “Activate” already Active Guerrillas (they stay Active).
Also, “moving” or “relocating” Guerrillas or SF does not affect
Underground status unless specified.

1.4.4 Types of forces
Cubes: Green US Troops, Yellow ARVN Troops, Orange ARVN Police, Red NVA Troops
NVA and VC Guerrillas: Red and Blue Underground (when flipped, they're considered Active)
ARVN Rangers (Special Forces): Yellow Underground (when flipped, they're considered Active)
US-led Irregulars (Special Forces): Green Underground (when flipped, they're considered Active)
Bases: Green US, Yellow ARVN, RED NVA, Blue VC

1.4.4 Tunnels. Scenario Setup (2.1) and
Events (5.0) designate certain VC or NVA
Bases as Tunneled. Place an appropriate
Tunnel marker on such a Base, never
more than 1 Tunnel marker at a time per Base. Tunneled Bases are
harder to remove by Operations or Events (3.2.4, 4.2.1, 4.2.3, 4.3.3,
5.1.1). When a Tunneled Base is removed, so is the Tunnel marker.
NVA can Infiltrate a VC Tunneled Base to make it NVA (4.4.1).

1.5 Players & Factions
The game may have up to 4 players, each as 1 or more Factions:
the US (olive), the NVA (red), the ARVN (yellow and orange), or
the VC (blue). In a 1-player game, the player plays US and ARVN
together, or NVA and VC, or any 1 Faction (8.9). Leftover Factions
are controlled either by rules section 8 as “Non-Players” or, if preferred with 2 or 3 players, as below.
No Non-Player Option: With 2 or 3 players, the players
(rather than the Non-Player rules, 8.0) may control any leftover
Factions:
• With 2 players, 1 player controls NVA and VC, the other US
and ARVN.
• With 3 players, a single player controls NVA and VC or, if
preferred, US and ARVN.
POLITBURO: A combined NVA/VC player uses the higher
victory margin of the 2 Factions during Coup Rounds (winning
if either meets its condition, 6.1, 7.2), but uses the lower of the
2 after Final Coup (7.3). A combined NVA/VC player may not
transfer Resources (1.5.2).
SOVEREIGNTY: A US/ARVN player uses the lower victory
margin of the 2 Factions (7.3) and only causes play to end on
a victory check (6.1, 7.2) if both are meeting their conditions.
DESIGN NOTE: NVA, VC, and ARVN pieces draw their colors as
much as possible from their respective flags, US from the olive GI
uniform.
1.5.1 Friends and Enemies. US and ARVN are Counterinsurgent
(COIN) Factions and friendly to each other; NVA and VC are Insurgents and friendly to each other. Counterinsurgents are enemy
to Insurgents.
1.5.2 Negotiation. Players may make any mutual arrangements
within the rules. All negotiations are open. The rules do not bind
players to agreements.
• The NVA and VC if separate players may voluntarily transfer
Resources (1.8) to each other at any time that one of them is
executing an Operation, Special Activity, or Event. 

1.6 Support and Opposition
Support and Opposition affect victory and some operations and
activities.
1.6.1 Cities and Provinces with at least 1 Population (1.3.2-3) always
show 1 of 5 levels of its populace’s Support for or Opposition to the
Saigon regime that can shift during play:
• Active Support.
• Passive Support.
• Neutral.
• Passive Opposition.
• Active Opposition.
1.6.2 Active Support or Opposition counts double Population for
Total Support or Opposition—affecting US or VC victory (7.2-.3).
Show Support or Opposition with markers placed in each City or
Province. Show Neutral spaces by the absence of such markers. 

Tokens:
Active Support x2
Passive Support x1
Neutral
Passive Oppose x1
Active Oppose x2

Total Support =
2 x Pop in Active Support + 1 x Pop in Passive Support
Total Opposition =
2 x Pop in Active Opposition + 1 x Pop in Passive Oppostion
NOTE: LoCs (1.3.4) and Pop 0 Provinces are always Neutral, never
at Support or Opposition. 

1.7 Control
Tokens:
- COIN control
- NVA control

The 2 Counterinsurgent Factions together
(US and ARVN) Control a Province or City
if their pieces there combined exceed those
of the other 2 Factions (NVA and VC) combined. The NVA alone Control a Province or City if NVA pieces
exceed all other pieces (including VC). Control affects certain activities and victory. Adjust COIN Control and NVA Control markers
as Control changes due to placement, removal, or movement of
pieces. 

1.8 Resources, Aid, and Patronage
At any moment, each Faction except the US has between 0 and 75
Resources that it uses to pay for Operations (3.0). During Coup
Rounds (6.2.3), a level of Aid (between 0 and 75) is added to ARVN
Resources. A level of Patronage (0 to 75) contributes to ARVN
victory (7.0). Mark Resources, Aid, and Patronage on the edge
track—for Resources, with a cylinder of that Faction’s color (1.5).
DESIGN NOTE: Patronage represents the wherewithal of the Saigon
regime to reward its friends at the expense of the population, such
as by diverting foreign aid—a means of governance that the US
could view as corrupt.
1.8.1 Joint Operations. The US does not track its own
Resources. Some US Operations (3.1) and US Pacification (3.2.1, 6.3.1) spend ARVN Resources. The US
may only spend those ARVN Resources that exceed
the marked Total Econ level (1.3.4, 6.2.3). Only the ARVN Faction
may spend ARVN Resources at or below Econ.

1.9 Victory Markers
Similarly track with markers on the edge track the following totals
that affect victory (7.0).
• Total Support (1.6.2) plus the number of US Troops and Bases
Available (1.4.1).
• Total Population Controlled by the NVA plus the number of NVA
Bases on the map (1.7).
• Total Population Controlled by the COIN Factions (1.7) plus
Patronage (1.8).
• Total Opposition (1.6.2) plus the number of VC Bases on the map.
NOTE: A marker on “The Trail” track records the efficiency level of
the NVA’s North-to-South supply network (6.7). Twelve “Deception”
markers are for victory-related optional rules (7.3). 

2.0 SEQUENCE OF PLAY
2.1 Set Up
Follow the instructions on the last 2 pages of this rule book to choose
a scenario and various play options, assign Factions to players,
prepare the draw deck, and set up markers and forces.
2.2 Start
Begin play by revealing the top card of the draw deck and placing
it onto a played cards pile. Then reveal the next card on top of the
draw deck. The card on the played card stack is played first; the card
on top of the draw deck will be played next. NOTE: Players will see
1 card ahead into the deck (2.3.7). All played cards and the number
of cards in the draw deck are open to inspection.
RECORD STEPS: As the steps of each Event card play are completed, place a cylinder of the Faction’s color (1.5) into the Sequence
of Play track’s appropriate box (or, for Coup Rounds [6.0], advance
the Coup Card marker).
2.3 Event Card
When playing an Event card, up to 2 Factions will execute Operations or the Event.
• Factions whose cylinder is in the “Eligible” box receive these
options in the left-to-right order of Faction symbols shown at top
of the card.
• Factions with cylinders in the “Ineligible” box do nothing.
2.3.1 Eligibility. Factions that did not execute an Operation or Event
on the previous card are Eligible (their cylinders will start the card
in the “Eligible” box per 2.3.6). Factions that did are Ineligible. (All
Factions start the game Eligible.) See also Free Operations, 3.1.2.
2.3.2 Faction Order. The Eligible Faction with the leftmost symbol
in its color (skipping any Ineligible Factions) is the 1st Eligible to
execute an Operation or Event or to Pass. The next leftmost is the
2nd Eligible. NOTE: Light halos around some Faction symbols
relate only to Non player instructions (8.4.1).
2.3.3 Passing. If a 1st or 2nd Eligible Faction (only!) opts to Pass,
it remains Eligible for the next card and receives +1 Resource if
an Insurgent Faction or adds +3 ARVN Resources if either COIN Faction. The next leftmost Eligible Faction then replaces the Passing
Faction as the new 1st or 2nd Eligible Faction and receives the same
options to execute or Pass. If the last (rightmost) Eligible Faction
Passes, adjust cylinders (2.3.7) and play the next card.
2.3.4 Options for Eligible Factions.
FIRST ELIGIBLE: If the 1st Eligible Faction does not Pass (2.3.3),
it may execute either:
• An Operation (3.0)—with or without a Special Activity (4.0)—or
• The Event shown on the card.
OPTIONS FOR 2ND ELIGIBLE: If the 2nd Eligible Faction does
not Pass (2.3.3), it also may execute an Operation or possibly the
Event, but its options depend on what the 1st Eligible Faction
executed:
• Op Only: If the 1st Eligible Faction executed an Operation, the
2nd Eligible Faction may execute a Limited Operation (2.3.5).
• Op & Special Activity: If the 1st Eligible Faction executed an
Operation with a Special Activity, the 2nd Eligible Faction may
execute a Limited Operation or instead execute the Event.
• Event: If the 1st Eligible Faction executed the Event, the 2nd Eligible Faction may execute an Operation, with a Special Activity
if desired.
NOTE: The game board and Sequence of Play aid sheet also show
these options.
2.3.5 Limited Operation. A Limited Operation is an Operation in
just 1 space, with no Special Activity. If the Limited Operation is a
Patrol (3.2.2), Sweep (3.2.3), or March (3.3.2), it can involve pieces
from multiple spaces but only 1 destination space. A Limited Operation counts as an Operation. (See also Non-player Operations, 8.1).
2.3.6 Adjust Eligibility. After the 1st and 2nd Eligible Factions
complete all execution of Operations, Special Activities, and Events
(or after all Eligible Factions instead have Passed), adjust cylinders
on the Sequence of Play track as follows:
• Any Faction that did not execute an Operation or Event (and was
not rendered Ineligible by an Event) to the “Eligible” box.
• Any Faction that executed an Operation (including a Limited
Operation) or Event to the “Ineligible” box (unless otherwise
specified by the Event; see also Free Operations, 3.1.2).
PLAY NOTE: Some Events (5.0) will enable the executing Faction
to remain Eligible or render other Factions Ineligible through the
next card. As a reminder, mark a Faction thus remaining Eligible by
placing its cylinder at the left edge of its Sequence of Play “Event”
box. Mark a Faction thus rendered Ineligible by placing its cylinder
with (under) the executing Faction’s, to show that it will be Ineligible
for the next card.
2.3.7 Next Card. After adjusting Eligibility, move the draw deck’s
top card onto the played card pile face-up and reveal the draw deck’s
next card (even if the played card is Coup!, 2.4). Play the played
card, proceeding with the appropriate sequence.
2.3.8 Pivotal Events. Each Faction begins the Medium and Full
scenarios (only, 2.1) with a Pivotal Event card unique to it. Pivotal
Events are a type of Event (5.0). A Faction may play its Pivotal
Event to cancel a currently played Event card (including Eligibility
order, 2.3) if:
• That Faction is Eligible, AND
• The red pre-condition on the card is met, AND • The 1st Eligible Faction has not yet done anything, AND
• No Coup is showing as the next card (2.3.9).
PROCEDURE: The Faction interrupts the usual Sequence of Play
by placing its Pivotal Event card on the played Event card and executing the Pivotal Event. The new Eligibility sequence follows, and
the Pivotal Event stays in the played card pile, as normal.
TRUMPING PIVOTAL EVENTS: The VC may play its Pivotal
Event on top of another Faction’s Pivotal Event, canceling it;
ARVN may do so to US or NVA; NVA may do so to US; US may
not do so. A canceled Pivotal Event card is returned to its owner
for possible later use.
PLAY NOTES: The 1st Eligible Faction need not declare what it
would execute before a Faction must decide whether to play its
Pivotal Event. Place “Playable Pivotal Event” reminder markers
on unplayed Pivotal Event cards for which preconditions are met.
2.3.9 Monsoon Season. On the last Event card before each Coup
Card (2.4), Operations may not include Sweep (3.2.3, even via
Advise, 4.2.1) nor March (3.3.2), US Air Strikes and Air Lifts are
limited to 2 spaces (4.2.2-.3), and no Pivotal Events allowed (2.3.8).
(But see 5.1.1 regarding Event text.)
NOTE: Keep the “Monsoon” marker near the deck and place it on
the played Event card as a reminder while a Coup is showing as
the next card.

2.4 Coup Card
If playing a Coup Card, first carry out any immediate instructions on
the card. Then place the card in the box marked “RVN Leader” (see
below). Finally, conduct a Coup Round (6.0), marking each phase
on the Sequence of Play with the “Coup Card” marker.
2.4.1 RVN Leader. The top (most recently played) Coup card (or
the “RVN Leader” box, if empty) shows the current Republic of
Vietnam (RVN) Leader. Any lingering effects noted for that Leader
are in effect, as if it is the text of a lingering executed Event (5.1,
5.3, 5.4). If the most recently played card is “Failed Attempt”, place
it underneath any previous Coup cards. NOTE: “Failed Attempts”
cancel only “Duong Van Minh”. Minh is an RVN Leader but not
a card. Minh thus does not count as a card in the RVN Leader box
(such as for Pivotal Event pre-conditions, 2.3.8). “Nguyen Cao Ky”
will affect Pacification beginning with that Coup Round (6.3.1).
2.4.2 Final Coup. If the last Coup card’s Round is completed without
a victory (6.1), the game ends: determine victory by 7.3.
NOTE: Each series of Event cards up to a Coup is a “Campaign”,
representing 1-2 years of war.

3.0 OPERATIONS
3.1 Operations in General
A Faction executing an Operation (Op) chooses 1 of the 4 Operations listed on its Faction sheet and selects the map spaces (typically
several) to be involved. Select a given space only once for a given
Operation.
Operations usually cost Resources (not Aid or Patronage,1.8), often per
space selected; the paying Faction must have enough Resources to pay
for the Operation, including in each selected space. The US does not
spend Resources of its own; it sometimes spends ARVN Resources,
but may not do so below the marked Total Econ (1.8.1, 6.2.3). The executing Faction chooses the order of the spaces in which
the Operation is resolved, the enemy Factions (1.5) or pieces to be
affected (targeted), and the friendly pieces to be placed, replaced,
or moved. An Operation may target both enemies or just one and
ignore the other. NOTE: Allied forces nevertheless protect the Bases
of the other friendly Faction from Assault/Attack (3.2.4, 3.3.3). Once
targeted, a Faction’s pieces are affected to the maximum extent possible. Actions affecting another Faction’s pieces, friendly or enemy,
do not require that Faction’s permission.
3.1.1 Pawns. If desired, mark spaces selected for Operations (3.0),
Special Activities (4.0), or other actions with white and black pawns.
The pawns are for convenience, not a limit on play.
3.1.2 Free Operations. Certain Events (5.5) grant free Operations
or Special Activities: they cost no Resources and, if executed by a
Faction other than the one playing an Event, do not affect its Eligibility (2.3.6). EXCEPTIONS: Pacification, Agitation, and Trail
Improvement still cost Resources even if part of a free Operation
(3.2.1, 3.3.1). Other requirements and procedures still apply unless
modified by Event text (5.1.1, 5.5.).
3.2 COIN Operations
The US and ARVN choose from Train, Patrol, Sweep,
and Assault Operations. NOTE: These Factions never
place or move pieces into North Vietnam (1.4.2).
3.2.1 Train. Training adds ARVN forces and can build Support (1.6)
or drop Patronage (1.8). NOTE: The US gets its Troops and Bases
in and out of Vietnam via the Commitment Phase (6.5) and Events
(5.0), not Operations.
• ARVN may select any Provinces or Cities without NVA Control.
• The US may select any Provinces or Cities that have US pieces.
• Either Faction spends 3 ARVN Resources only if it places any
ARVN pieces (including replacing cubes with a Base).
PROCEDURE: First, in those selected spaces desired, if US, place
1-2 Irregulars or, at US Bases, 1-2 Rangers or up to 6 ARVN cubes
(any combination of Troops and Police); if ARVN, place 1-2 Rangers or up to 6 ARVN cubes at Cities or at US or ARVN Bases. If
none of the desired ARVN pieces are Available (1.4.1), they may
be taken from the map. Then, in 1 selected space (even if a Limited
Operation, 2.3.5), if desired either:
• Pacify to remove any Terror marker and then to shift the space
up to 2 levels toward Active Support. The space must have COIN
Control and, if ARVN Training, both ARVN Troops and Police.
(Unlike Pacification during the Support Phase, 6.3.1, the US does
not need Troops and Police, only a US piece and COIN Control.)
The Pacification costs 3 ARVN Resources per Terror marker
removed and level shifted, even if the Training Operation was
free (3.1.2, 5.5). OR
• If ARVN, replace any 3 ARVN cubes with 1 ARVN Base (within
stacking,1.4.2). NOTE: Replacing cubes with a Base costs 3 ARVN
Resources even if no cubes were placed. OR
• If US and the space is Saigon, transfer up to 3 Patronage to ARVN
Resources.
3.2.2 Patrol. Patrolling protects LoCs by moving Troops or Police
onto them and finding and removing Insurgents there. If ARVN,
pay 3 Resources total (not per space); if US, the cost is 0. If a
Limited Operation (2.3.5), all moving cubes must end on a single PROCEDURE: Move any number of your Faction’s cubes from
any spaces. Each cube may move into any adjacent LoC or City
and may keep entering adjacent LoCs or Cities until the player
chooses to stop moving it or it enters a space with any NVA or VC
piece. Then, in each LoC (whether or not a cube just moved there),
Activate 1 enemy Guerrilla for each of your Faction’s cubes there.
Then, if desired, Assault (3.2.4) in 1 LoC at no added cost. US may
not add ARVN. If a Limited Operation (2.3.5), the Assault must be
in the destination LoC.
3.2.3 Sweep. Sweeps may move Troops and can locate enemy Guerrillas. Select Provinces or Cities as destinations (not North Vietnam,
1.4.2). If ARVN, pay 3 Resources per space selected; if US, 0. Sweep
is not allowed in Monsoon (a Coup card showing as next, 2.3.9).
PROCEDURE: First, move any of your Faction’s adjacent Troops
desired into selected spaces. In addition, each group of Troops may
first move onto an adjacent LoC (1.3.3) that is free of NVA/VC
and then into an adjacent space. (Any Troops that move must reach
spaces paid for as destinations.)
• Then, in each selected space, Activate (1.4.3) 1 enemy Guerrilla
for each of your cubes (moved or already there) or Special Forces
(Irregulars for US, Rangers for ARVN).
• In Jungle spaces, Activate only 1 enemy Guerrilla for every 2 of
your cubes or Special Forces (round odd totals down).
SWEEP EXAMPLE: ARVN selects Quang Duc for a Sweep. No LoCs
have Guerrillas. Two Troops move from Cam Ranh onto Route 11
and from there via Da Lat into Quang Duc Province. ARVN Troops
in Binh Tuy – Binh Thuan also could enter Quang Duc.
3.2.4 Assault. Assaults remove enemy pieces. Select any spaces with
the executing Faction’s cubes and Insurgents (NVA or VC). ARVN
pay 3 Resources per space. US Assault costs 3 ARVN Resources only
if the US player opts to add an ARVN Assault in 1 US Assault space.
PROCEDURE: In each selected space, remove enemy pieces per
the number of cubes there, as follows.
• If an ARVN Assault, count only ARVN cubes. Remove 1 enemy
piece for every 2 cubes there or every 3 in Highland (round down).
In Cities or on LoCs, count Police as well as Troops; in Provinces,
Troops only. For each Base removed (including via follow up to
US Assault, below, or Advise, 4.2.1), add +6 Aid.
• If a US Assault, count US Troops. Remove 2 enemies per US
Troops cube if the space has a US Base, or only 1 enemy for
every 2 US Troops (round down) if Highland with no US Base,
or otherwise 1 enemy piece for each US Troop. If desired, pay
3 ARVN Resources to follow up with an ARVN Assault per the
above bullet in 1 space where US Assault just occurred (no effect
on ARVN Eligibility, 2.3.1).
TROOPS FIRST, BASES LAST: Remove any NVA Troops in an
Assault space first, then any Active NVA or VC Guerrillas (Assaulting Faction chooses which first), then any Insurgent Bases only
once no NVA nor VC Guerrillas remain. Remove no Underground
Guerrillas (1.4.3).
NOTE: Underground Guerrillas in a space prevent further removal
via Assault of Bases until the Guerrillas are Activated. Also, nonBase pieces protect the Bases of the other friendly Faction from
Assault/Attack (3.3.3).
DESIGN NOTE: Guerrillas are less hard hitting than Troops but
enjoy an information advantage in that counterinsurgents must
Activate (locate) them before Assaulting them. 

TUNNELS: If the next piece to be removed would be a Base with a
Tunnel marker (1.4.4), stop removing pieces from that space. Instead,
roll a die: on a 1-3, do nothing further; on a 4-6, remove that Tunnel
marker only (leave the Base in place). EXAMPLE: Three US Troops
Assault 2 Tunneled Bases alone in Jungle. No pieces are removed.
On a roll of 4-6, a Tunnel marker is removed from one Base.

3.3 Insurgent Operations
The NVA and VC choose from Rally, March, Attack, or
Terror Operations.
3.3.1 Rally. Rally Operations augment friendly forces, recover VC,
and build the Trail. Select any Provinces or Cities without Support
(1.6). Pay 1 Resource per space selected.
PROCEDURE: In each selected space, the executing Faction places
1 of its Available Guerrillas or replaces 2 of its Guerrillas with 1 of
its Bases (within stacking 1.4.2). If the space already has at least 1
of that Faction’s Bases, the Faction may instead:
• If NVA, place a number of its Guerrillas up to the sum of Trail
value (6.7) plus the number of NVA Bases there.
• If VC, place its Guerrillas up to the sum of the space’s Population
value (1.3.2-.3) plus the number of VC Bases there OR flip all its
Guerrillas there Underground (1.4.3). NOTE: VC may Agitate as
well if it has the shaded “Cadres” Capability (5.3); that Agitation
costs Resources even if the Rally was free (3.1.2, 5.5).
Then, NVA with its Rally may spend another 2 Resources to Improve
the Trail by 1 box (6.7, even if the Rally was a Limited Operation,
2.3.5, or selected 0 spaces). Rally to Improve the Trail costs 2 even
if the Rally was free (3.1.2, 5.5).
3.3.2 March. March Operations move Insurgent Guerrillas and
Troops. Moving pieces may begin in any spaces. Pay 1 Resource
per Province or City that Guerrillas or Troops move into (0 Resources to move onto LoCs). A Limited Operation (2.3.5) March
may select only a single destination space. March is not allowed in
Monsoon (2.3.9).
PROCEDURE: The executing Faction moves any of its Guerrillas
or Troops desired into adjacent spaces (1.3.6). Pieces moving from 1
space to another move as a single group. Set Guerrillas of a moving
group to Active (1.4.3) if:
• The destination is a LoC or has any Support (1.6) AND
• The moving group’s number of pieces plus the number of US and
ARVN cubes, Irregulars, and Rangers at the destination exceeds 3.
EXAMPLE: Two Underground VC Guerrillas March from The
Parrot’s Beak into Kien Phong, where there are 2 Police cubes and
Support. The total of 4 relevant pieces at the destination exceeds 3,
so the VC Guerrillas flip to Active.
THE TRAIL: Marching NVA Guerrillas and Troops (not VC) may
continue moving into additional spaces (paying once only for each
added destination) if the previous destination space was in Laos or
Cambodia (1.3.5), the Trail value is above 0 (6.7), and the March is
not a LimOp (2.3.5). Also, if the Trail value is 4, NVA March into
or out of individual Laos or Cambodia spaces costs 0 Resources.
NOTE: COIN Control does not stop such moves (1.7).
3.3.3 Attack. Attack Operations seek to eliminate enemy forces.
Select any spaces where the executing Faction and an enemy have
pieces; pay 1 Resource per space.

PROCEDURE: In each selected space, Activate (1.4.3) all the
executing Faction’s Guerrillas and then roll a die: if the roll is less
than or equal to the number of the executing Faction’s Guerrillas
there (whether or not they began Active), remove up to 2 enemy
pieces (executing Faction’s choice). The NVA may instead remove
1 enemy piece per 2 NVA Troops there (round down, Activate no
Guerrillas). Removed pieces may belong to different Factions and
may be Underground Special Forces.
• Do not remove US or ARVN Bases before any other pieces of
either Faction in the space.
CASUALTIES: Place any US pieces removed by Attack into the
Casualties box.
ATTRITION: For each US Troop cube or US Base removed, the
Attacking Faction must remove 1 of its Attacking pieces (Troops
or Guerrillas, whichever used) from the space.
3.3.4 Terror. Terror Operations in Cities or Provinces affect Support and Opposition (1.6) and
place Terror markers that hinder future efforts to
influence it. On LoCs, they place Sabotage markers that block ARVN
Resource earnings (6.2.1). Select any spaces where the executing
Faction has at least 1 Underground Guerrilla or, for NVA Terror, NVA
Troop cube; pay 1 Resource per Province or City (0 for LoCs).
PROCEDURE: Activate 1 friendly Underground Guerrilla in each
selected space (if any there).
• If the space is a Province or City without a Terror marker, place
a Terror marker. If VC, shift 1 level toward Active Opposition
(1.6). If NVA, shift any Support 1 level toward Neutral.
• If the space is a LoC without a Sabotage marker, place a Sabotage
marker.
• Do not place a Terror/Sabotage marker if all are already on the
map. (There are 15.)
NOTE: Terror Ops will not add Terror or Sabotage markers to
spaces that already have them. (Certain events can do so, 5.1.1).

4.0 SPECIAL ACTIVITIES
4.1 Special Activities in General
When a Faction per the Event Card sequence of play (2.3) executes
an Operation (3.0), it may also execute 1 type of its Special Activities (EXCEPTION: Limited Operations, 2.3.5). There is no added
Resource cost for the Special Activity. As with Operations, the
executing Faction selects spaces, Factions, or pieces affected and
the order of actions. Select a given space only once as a location
for a given Special Activity. (But see removal of adjacent pieces
via Ambush from Road/River locations, 4.4.3). Events may grant
free Special Activities (not further affecting Eligibility, 3.1.2, 5.5).
•	 Important: A Faction may execute its Special Activity at any one
time immediately before, during, or immediately after its Operation.
EXAMPLE: The VC Rally until at 0 Resources, then pause to Tax
and gain Resources, then continue to Rally in added spaces.
PLAY NOTE: If the 1st Eligible Faction uses a Special Activity, the
2nd Eligible receives the option of executing the card’s Event, and
vice versa (2.3.4).
4.1.1. Accompanying Operations. Some Special Activities specify
that they may only accompany certain types of Operations (3.0). 

Certain Special Activities either must occur or may not occur where
their Accompanying Operations occurred. If not otherwise specified,
Special Activities may accompany any Operations and take place
in any otherwise valid spaces.
4.2 US Special Activities
The US may choose from Advise, Air Lift, or Air Strike
Special Activities.
4.2.1 Advise. Advise strikes with indigenous allied forces and can
add to Aid (1.8). It may only accompany Training or Patrol (3.2.1-
.2) and take place in 1 or 2 spaces NOT selected for Training (never
North Vietnam, 1.4.2).
PROCEDURE: In each selected space, either:
• Sweep within the space with ARVN forces as if an ARVN Sweep
there without movement (3.2.3, not in Monsoon, 2.3.9), OR
• Assault there as if ARVN Assault (3.2.4), OR
• Activate 1 Underground Irregular or Ranger there to remove 2
enemy pieces. Bases may only be removed once no other enemy
pieces are there. Tunneled Bases (1.4.4) may not be removed
(Underground Guerrillas may).
Then, if desired, add +6 Aid total (to max of 75).
4.2.2 Air Lift. Air Lift moves Troops, especially to mass them
quickly for an Operation.
PROCEDURE: Move any US Troops and up to 4 ARVN Troops,
Rangers, or Irregulars among any 4 spaces (2 spaces during Monsoon, 2.3.9; not North Vietnam, 1.4.2).
4.2.3 Air Strike. Air Strike destroys exposed Insurgent units. It may
take place in up to 6 spaces (2 spaces during Monsoon, 2.3.9), each
with any US or ARVN piece in it.
PROCEDURE: Remove a total of up to 6 Active enemy pieces
(6 pieces even during Monsoon) from among the selected spaces.
Remove Bases only from spaces where no other Insurgent pieces
remain. Remove no Underground Guerrillas nor Tunneled Bases.
Shift each space selected 1 level toward Active Opposition (if a
Province or City with at least 1 Population, 1.6.1). Then, if desired,
Degrade the Trail by 1 box (6.7), even if 0 pieces removed.
4.3 ARVN Special Activities
The ARVN chooses from Govern, Transport, or Raid Special
Activities.
4.3.1 Govern. Governing adds Aid or extracts Patronage from Aid
and Support. It may only accompany Training or Patrol (3.2.1-.2)
and take place in 1 or 2 COIN-Controlled Provinces or Cities (1.7)
with any level of Support (1.6) NOT Saigon NOR selected for
Training. NOTE: ARVN may Train and Govern but not in the same
space during the same Op.
PROCEDURE: In each space, either:
• Add 3 times the space’s Population to Aid (to a maximum of 75),
OR
• Transfer its Population value (times 1) from Aid to Patronage
(max 75) and shift the space 1 level toward Neutral. There must
be more ARVN cubes (Troops and Police total) than US cubes
(Troops) in the space.
DESIGN NOTE: South Vietnamese officials may Govern benignly
to attract more foreign aid, or less benignly to divert more aid to 
associates.

4.3.2 Transport. Transport moves Troops and Rangers, to take
control of countryside, for example, and prepares Rangers for Raids.
PROCEDURE: Select 1 space and move up to 6 ARVN Troops and/
or Rangers from there onto 1 or more adjacent LoCs, if desired.
They may continue to move along adjacent LoCs or through Cities
and then, if desired, into any adjacent destinations (not North Vietnam, 1.4.2). They must stop at any NVA or VC pieces. Then flip all
Rangers anywhere on the map to Underground.
4.3.3 Raid. Raiding repositions and strikes with the ARVN’s special
forces—Rangers. It may only accompany Patrol, Sweep, or Assault
(3.2.2-.4) and take place in 1 or 2 spaces.
PROCEDURE: Each selected space, move in any adjacent Rangers desired (keeping them either Underground or Active). Then, if
desired, Activate an Underground Ranger in each space to remove
2 enemy pieces. Bases may only be removed once no other enemy
pieces are there. Tunneled Bases (1.4.4) may not be removed (Underground Guerrillas may).
4.4 NVA Special Activities
The NVA choose from Infiltrate, Bombard, or Ambush Special Activities.
4.4.1 Infiltrate. Infiltration enables the NVA to build up its conventional forces or to take over VC forces. It also erodes Opposition.
It may only accompany Rally or March (3.3.1-.2). Infiltrate 1 or 2
spaces that have either an NVA Base or more NVA pieces than VC
pieces.
PROCEDURE: In each space, either—
• If NVA Base(s), place NVA Troops up to the Trail value (6.7) plus
the number of NVA Bases there, then replace any NVA Guerrillas
desired 1 for 1 with added NVA Troops, OR
• If NVA outnumber VC, shift any Opposition there by 1 level toward Neutral. Then replace any 1 VC piece desired with its NVA
counterpart. If replacing a VC Tunneled Base, flip the Tunnel
marker from VC to NVA. In order to remove VC, NVA must have
or make Available the NVA counterpart (1.4.1) and place it in the
VC’s place.
DESIGN NOTE: Infiltration of Northerners could dampen local
revolutionary zeal, as Hanoi’s interference replaced Saigon’s.

4.4.2 Bombard. Bombardment imposes losses on concentrated
enemy troops. It may occur in 1 or 2 spaces with any combination
of at least 3 ARVN and/or US Troops (Police and Special Forces
do not count) or with any US or ARVN Base. Each space also must
have in it or be adjacent to a space with at least 3 NVA Troops.
PROCEDURE: Remove 1 US or ARVN Troop cube from each
selected location, if US, to the Casualties box.
4.4.3 Ambush. Ambush enables the NVA to Attack on the move,
ensure the success of Attacks, and avoid attrition and exposure of
their Guerrillas. It may take place in 1 or 2 spaces selected and paid
for as March destinations (0 cost for LoCs, 3.3.2) or for Attack by
NVA Guerrillas (3.3.3, not yet resolved). At least 1 NVA Guerrilla
that Marched into or will Attack in each space must be Underground
(1.4.3). A free Ambush per an Event (5.5) occurs as if an Attack in
the space.
NOTE: Ambush accompanying Attack modifies that Attack in that
space rather than adding a second Attack there.
PROCEDURE: The NVA Attack in each selected location (at no added cost in Resources). Instead of the usual Attack procedure (3.3.3),
the Attacks in those spaces each remove only 1 enemy piece (Bases
last) but Activate 1 Underground Guerrilla only and automatically
succeed (do not roll; remove the enemy piece normally). Also, do
not remove any NVA pieces even if US Troops removed.
ROAD/RIVER: If a selected Ambush space is a LoC (1.3.4), NVA
may remove the enemy piece from any adjacent space instead (Bases
last), even where another target was just removed.
EXAMPLE: An NVA Guerrilla Ambushing on the 2-Econ Mekong
could remove 1 enemy from either the Mekong, Kien Phong, Kien
Hoa, Can Tho, or Saigon. Selecting Kien Phong would not prevent
a 2nd NVA Guerrilla Ambushing there from also removing an enemy piece.
4.5 VC Special Activities
The VC may choose from Tax, Subvert, or Ambush Special
Activities.
4.5.1 Tax. Taxation enables the VC to gain Resources from areas
they inhabit. They may Tax up to 4 spaces that have Underground
VC Guerrillas and no COIN Control (1.7).
NOTE: There is no COIN Control of LoCs, so VC can Tax there
even if outnumbered. VC can Tax Sabotaged LoCs.
PROCEDURE: For each space, Activate 1 Underground VC Guerrilla there (1.4.3). Add the space’s Econ value or twice its Population
(1.3.2-.4) to VC Resources (1.8). If a Province or City, shift it 1 level
toward Active Support.
4.5.2 Subvert. Subversion replaces ARVN pieces with VC Guerrillas
and saps Patronage. It may only accompany Rally, March, or Terror
(3.3.1, -.2, -.4). It may occur in any 1 or 2 spaces with at least 1
Underground VC Guerrilla and any ARVN cubes.
PROCEDURE: In each space, remove any 2 ARVN cubes or replace
1 there with a VC Guerrilla. Then drop Patronage, -1 for every 2
ARVN pieces removed (or replaced) total (rounded down).
4.5.3 Ambush. VC Ambushes the same as NVA (4.4.3) but using
VC Guerrillas instead.

5.0 EVENTS
Each Event bears a title, Period Event year (2.1), italicized flavor
text, and Event text. Flavor text provides historical interest and has
no effect on play.
5.1 Executing Events
When a Faction executes an Event, it carries out the Event text
literally and in order (sometimes involving actions or decisions by
other Factions). Unless otherwise specified, the executing Faction
makes all selections involved in implementing the text, such as which
pieces are affected or which Faction will execute a free Operation
(5.5). If another Faction is specified or selected to take an action, that
Faction decides the details of the action. Some Events with lasting
effects have markers as aids to play. NOTE: RVN Leaders (2.4.1)
have text that follows the same general rules below as Event text.
5.1.1 Where Event text contradicts rules, the Event takes precedence.
EXAMPLE: NVA executing “Plei Mei” could March as directed
even during Monsoon (2.3.9). However:
• Events may not violate stacking (and so never place Bases where
already 2, nor US or ARVN forces into North Vietnam, 1.4.2).
• Events place only available pieces (1.4.1) and markers unless
specifying from out of play or Casualties; they remove rather than
replace if the replacement is not Available or if stacking (1.4.2)
would be violated.
• Events do not force removal of Tunneled Bases unless removal
of Tunneled Bases is explicitly stated (1.4.4). A Faction may opt
to remove its own Tunneled Base to fulfill Event text.
• Events may not raise Resources, Aid, or Patronage beyond 75 (1.8).
5.1.2 If two Events contradict, the currently played Event takes
precedence. EXAMPLE: US could Air Lift with “MACV” even
with “Typhoon Kate” in effect because MACV directs that “US ...
executes any 1 free Special Activity”.
5.1.3 An executed Event’s text that can be implemented must be.
If not all of its text can be carried out, implement that which can.
5.1.4 Pivotal Events are Events that have preconditions for play and
preempt other Event cards, including Faction order. The executing
Faction must select the Event to play the Pivotal Event card. (See
2.3.8.)

Card features:
- Period Event (Set Up Option) e.g. '1968'
- Faction Order (shows the four factions)
- Card number
- Image
- Title
- Italized flavor text
- Event text
- Lasting effects if any (5.3)
- Shaded text (see Dual Use 5.2)

5.2 Dual Use
Many Events have both unshaded and shaded Event text. The executing Faction may select either the unshaded or shaded text to carry
out (not both). While the unshaded text often favors the Counterinsurgents, a player may select either text option regardless of Faction.
DESIGN NOTE: Dual-use events represent opposed effects of the
same cause, forks in the historical road, or instances subject to
alternative historical interpretation.
5.3 Capabilities
Dual-use Events marked “US CAPABILITIES”, “VC CAPABILITIES”, and so on
have lasting effects mainly relating to that
Faction. When executing such an Event,
place the corresponding marker on the appropriate side (unshaded
or shaded) in the Capabilities box. The Event’s effects last for the
rest of the game.
PLAY NOTE: Set out executed Capabilities Event cards near the
affected player(s) as added reminders.
5.4 Momentum
Event text (unshaded, shaded, or both) marked “MOMENTUM”
also includes lasting effects. When executing such text, place the
card in view near the draw pile. It has effects specified to last until
the next Coup round’s Reset phase (6.5), when the card is discarded.
NOTE: Any number of Momentum Events can be in play.
MARKERS: Place the “Medevac” marker on its
appropriate side onto the Event card while in
effect to record which use applies. Place the
“Peace Talks” marker on the “Linebacker II” Pivotal Event card if
unshaded Peace Talks executed and Linebacker II not.
5.5 Free Operations
Some Events allow the Executing or another Faction an immediate
Operation or Special Activity that interrupts the usual sequence of
play and typically is free: it bears no Resource cost and does not affect Eligibility (3.1.2, 2.3.1), though other procedures and restrictions
remain unless modified by Event text (5.1.1). NOTE: Pacification,
Trail Improvement, and Agitation cost Resources even if part of free
Operations (3.2.1, 3.3.1). A free Ambush Special Activity occurs as
if an Attack is occuring in the space (4.4.3).
EXAMPLE: NVA free March (3.3.2) would cost 0 Resources and not
affect NVA Eligibility. Free Raid (4.3.3) would have to Activate an
Underground Ranger to remove enemies.
6.0 COUP ROUNDS
Conduct a Coup Round in the sequence of phases below
as each Coup Card is played, first following any immediate Coup effect (2.4) and adjusting Control (1.7). The
Sequence of Play sheet and board also list this sequence.
EXCEPTION: Never conduct more than 1 Coup Round in a row
(without at least 1 Event card in between)—instead, additional
Coup cards are played (including any new RVN Leader and any
immediate effect) without a Coup Round. If final (2.4.2), end the
game, determine victory (7.3). 

6.1 Victory Phase
If any Faction has met its Victory condition, the game ends (exceptions: Non-player option [1.5]; 1-player [8.9]). See Victory (7.0)
to determine winner and rank order. Otherwise, continue with the
Coup Round. After conducting the final Coup card’s Round (2.4.2),
determine victory per 7.3.
6.2 Resources Phase
Follow these steps to add to Factions’ Resources to a maximum of
75 (1.8).
6.2.1 Sabotage. Sabotage (3.3.4) each unSabotaged LoC where
Insurgent Guerrillas outnumber COIN pieces or adjacent to a City
without COIN Control (until no Sabotage markers remain, VC
chooses which spaces first).
6.2.2 Degrade Trail. If any Laos or Cambodia space is COIN-Controlled, Degrade the Trail by 1 box (6.7).
6.2.3 ARVN Earnings. Add the Aid value to ARVN
Resources. Then add as well the Economic value (1.3.4)
of all LoCs that have no Sabotage (Total Econ, 15
minus the Econ value of any Sabotaged LoCs) and
adjust the “Econ” marker to show that unSabotaged Econ (affecting
US spending of ARVN Resources during the coming Campaign,
1.8.1).
6.2.4 Insurgent Earnings. Add to Resources:
• VC—The number of VC Bases on the map.
• NVA—The number of NVA Bases in Laos and Cambodia, plus
2 times the Trail value (6.7).
6.2.5 Casualties and Aid. Finally, subtract from Aid 3 times the
number of pieces in the Casualties box (3.3.3).
6.3 Support Phase
US, ARVN, and VC may spend Resources to affect popular Support
and Opposition (1.6).
6.3.1 Pacification. The US and then ARVN may spend ARVN Resources to build Support in a combined total of up to 4 Provinces
and/or Cities. EXAMPLE: If the US Pacifies in 3 spaces, ARVN may
do so in only 1; if US in 4, ARVN in none; etc. Each space must have
COIN Control, Police, and the Pacifying Faction’s Troops. Every 3
ARVN Resources spent removes a Terror marker or—once no Terror
is in a space—shifts the space 1 level toward Active Support, to a
maximum of 2 levels per space total during each Support Phase (not
per Faction). The US may not spend Resources below marked Total
Econ (1.8.1, 6.2.3). (See also Training, 3.2.1)
DESIGN NOTE: Troops and Police or local militias together provide
the security needed to gain popular support.
6.3.2 Agitation. VC may spend Resources to encourage Opposition
in up to 4 spaces with VC pieces and no COIN Control (1.7). Every
1 VC Resource they spend removes a Terror marker or—once no
Terror is in a space—shifts the space 1 level toward Active Opposition, to a maximum of 2 levels per space.
6.4 Redeploy Phase
Redeploy forces as follows without adjusting COIN or NVA Control
until afterwards.
6.4.1 Laos and Cambodia. Remove all US and ARVN pieces from
Laos and Cambodia—US Troops to the out of play box, all other pieces to Available boxes.
DESIGN NOTE: The removal from Laos and Cambodia represents
the political cost of too lengthy an operation inside a neutral country.
6.4.2 ARVN Redeploy. The ARVN must move its Troops from
LoCs and Provinces without COIN Bases—and may move any
other ARVN Troops—to any Cities without NVA Control, any US
or ARVN Bases, or Saigon. ARVN then may move any Police to
any LoCs or to any COIN Controlled spaces within South Vietnam.
NOTE: US forces do not Redeploy.
6.4.3 NVA Redeploy. The NVA then may move NVA Troops (only)
from any map spaces to any NVA Bases (even COIN Controlled).
6.4.4 Control. Now adjust COIN and NVA
Control (1.7) to reflect the above moves.
6.4.5 Game End? If and only if this is the final Round (2.4.2), end
and determine victory (7.3).
6.5 Commitment Phase
If not the final Round, take 1 in 3 (round down) US Troop and all
Base Casualty pieces out of play. Put all other US Casualties into
Available boxes. The US then may move up to 10 US Troops and
2 US Bases among the US Available box, any COIN-Control spaces, LoCs, and Saigon. Adjust any changes in Control and Victory
markers (1.9) at the end of the Phase.
NOTE: Commitment is the main time that the US “commits” forces
from Available to South Vietnam or “withdraws” them the other way.
6.6 Reset Phase
Then prepare for the next card as follows:
• If the Trail (6.7) is at 0, Improve it to 1; if it is at 4, Degrade it to 3.
• Remove all Terror and Sabotage markers (3.3.4).
• Flip all Guerrillas and SF Underground (1.4.3).
• Place any Momentum cards that were in effect onto the played
cards—their Events’ effects no longer apply (5.4).
• Mark all Factions Eligible (2.3.1).
• Play the next card from the draw deck and reveal the draw deck’s
new top card (2.3.9).
6.7 The Trail
The (“Ho Chi Minh”) Trail track shows the efficiency
of land and water resupply from North to South Vietnam
as a value from 0 to 4—affecting NVA Rally (3.3.1),
March (3.3.2), Infiltration (4.4.1), and Earnings (6.2.4).
Improving the Trail raises the value; Degrading it decreases the value
(slide the Trail marker along the boxes). Rally (3.3.1), Air Strike
(4.2.3), US/ARVN incursions into Laos or Cambodia (6.2.2), Coup
Round Reset (6.6), and Events (5.0) all can affect the Trail value.
DESIGN NOTE: Trail Degradation represents not only strikes on the
Ho Chi Minh Trail itself but also on sea transport and North Vietnam.

7.0 VICTORY
Each Faction has unique victory conditions, covered below and on
the Faction aid sheets.
7.1 Ranking Wins and Breaking Ties
If any Non-player Faction (8.0) passes a victory check (7.2), all
players lose equally. Otherwise, whenever any player does so or
if none does by game end, the Faction that reached the highest
victory margin (7.3) comes in 1st place, 2nd highest comes in 2nd
place, and so on. Ties go to Non-players (8.0), then the VC, then
the ARVN, then the NVA.
7.2 During Coup Rounds
Check victory at the start of each Coup Round (6.1), comparing
the positions of the various victory markers (1.9) to the thresholds
marked on the edge track. Victory conditions are:
• US: Total Support (1.6.2) plus the number of Troops and Bases
in the US Available Forces box exceeds 50.
• NVA: Total NVA-Controlled Population plus the number of NVA
Bases on the map exceeds 18.
• ARVN: Total COIN-Controlled Population plus Patronage
exceeds 50.
• VC: Total Opposition (1.6.2) plus number of VC Bases on the
map exceeds 35.
7.3 After Final Coup
If the final Coup Round (2.4.2) is completed without a victory
check win (7.2), the Faction with the highest victory margin wins.
The victory margin is the amount a Faction is beyond or short of its
condition set forth in 7.2.
NOTE: The victory margin will be positive if the Faction has reached
its goal, negative or zero if it has not.
• US: Total Support + Available US – 50.
• NVA: NVA-Controlled Population + NVA Bases – 18.
• ARVN: COIN-Controlled Population + Patronage – 50.
• VC: Total Opposition + VC Bases – 35.
Victory Deception Option: For less knowledge of how close
Factions in 3- or 4-player games are to winning, each player
at start blindly draws 2 Deception markers. Set aside the rest;
they may not be inspected. Players may reveal their Deception
markers only as they use them:
Empty Threat: No effect (reveal at game end).
Hidden Agenda: Permanently add +1 to the holding player’s
victory margin (7.3).
Hidden Asset: Convert any 1 LimOp option (2.3.5) into a full
Op & Special Activity option.
Handicap Option: If players possess a mix of experience levels, use the above option, but allow the inexperienced players
to secretly select any 2 markers each, least experienced first;
the experienced players then blindly draw 2 markers each from
those remaining.
STOP!
You have read all rules needed for 4 players or
the No Non-Player option with 2 or 3 players
(1.5, recommended for first-time play).

Key Terms Index:

Accompanying—Operation required for Special
Activity. (4.1.1)
Activate—Flip or leave Guerrilla Active. (1.4.3)
Active—Status of Guerrilla with symbol end up and
of all Bases and cubes (1.4.3).
Adjacent—Spaces next to each other for actions
or Events. (1.3.6)
Advise—US Special Activity to use indigenous
forces, add Aid. (4.2.1)
Agitation—VC spending to increase Opposition.
(6.3.2)
Aid—Foreign assistance that adds to ARVN Resources during Coup Rounds. (1.8, 3.2.4, 4.2.1,
4.3.1, 6.2.3, 6.2.5)
Air Lift—US Special Activity that moves Troops
or Special Forces. (4.2.2)
Air Strike—US Special Activity that removes
enemy pieces and Degrades the Trail. (4.2.3)
Ambush—VC Special Activity ensuring Attack
success. (4.3.1, 4.4.1)
ARVN—Nickname for Republic of Vietnam Faction (“Army of the Republic of Vietnam”). (1.0, 1.5)
Attack—Insurgent Operation that removes enemy
pieces. (3.3.3)
Assault—COIN Operation that removes enemy
pieces. (3.2.4)
Available—Forces in holding boxes, waiting to be
placed. (1.4.1)
Base—Mostly-immobile force pieces that affect Rally,
Resources, and Victory, among other functions. (1.4)
Bases Last—Frequent requirement that no protecting
cubes or Guerrillas be in a space before removing a
Base. (3.2.4, 3.3.3, 4.2.3, 4.4.2)
Cambodia—The 4 foreign country spaces Sihanoukville, The Parrot’s Beak, The Fishhook, Northeast
Cambodia. (1.3.5)
Campaign—Event card series leading up to a Coup
Round. (2.4.2)
Capabilities—Lasting Events that help or hurt a
certain Faction’s actions. (5.3)
Casualties—US pieces removed by Attack, Ambush,
Bombard, and certain Events. (3.3.3, 4.3.2, 4.3.3, 6.5)
City—Type of space: urban area. (1.3.3)
COIN (Counterinsurgency)—US or ARVN. (1.0,
1.5, 1.7, 3.2)
COIN Control + Patronage—Total Population under
COIN Control plus Patronage: the measure of ARVN
victory. (1.9, 7.2-.3)
Commit—Send US forces from Available to the
map. (6.5, 8.8.1)
Commitment—Phase in which US Forces enter or
leave the map. (6.5)
Control—More COIN or NVA pieces in a Province
or City than other Factions. (1.7)
Cost—Resources spent on an Operation, Pacification,
or Agitation. (3.1, 4.1, 6.4)
Coup—Cards triggering Rounds that include
victory checks, Resource acquisition, and several
other periodic functions. (2.4, 6.0)
Cube—Troop or Police piece. (1.4)
Cylinder—Token to mark a Faction’s Resources
or Eligibility (1.8, 2.2)
Deception—Optional victory markers. (7.3)
Degrade—Shift Trail toward “0”. (4.2.3, 6.7)
Dual Use—Event with 2 alternative effects. (5.2)
Earnings—Resources that Factions receive each
Coup Round. (6.2.3-.4).
Economic Value (Econ)—Resources that an
unSabotaged LoC will provide via VC Tax and
to ARVN in the Resources Phase. (1.3.4, 1.8.1,
4.5.1, 6.2.1)
Eligible—Faction able to execute Event or Operation: per Faction order, 1st and 2nd Eligible. (2.3)
Enemy—Relationship between an Insurgent and
a Counterinsurgent. (1.5)
Event—Card with Faction order and text a Faction
may execute. (2.3, 5.0)
Execute—Implement Event or conduct Operation
or Special Activity. (2.3)
Faction—Player or Non-Player role: US, ARVN,
VC, NVA. (1.5)
Faction Order—Card symbols determining Eligibility. (2.3.2)
Final—Last Event or Coup card. (2.4.2, 7.3)
Flip—Switch Guerrilla between Underground
and Active (1.4.3) or Tunnel between VC and
NVA (4.4.1).
Forces—Troops, Police, Guerrillas, or Bases
(pieces; not markers like Tunnels). (1.4)
Free—Operation or Special Activity via Event
that does not cost Resources or affect Eligibility.
(3.1.2, 5.5)
Friendly—A Faction to itself, or US to ARVN,
or NVA to VC. (1.5)
Govern—ARVN Special Activity to gain Aid or
Patronage. (4.3.1)
Guerrilla—NVA and VC forces piece difficult to
strike when Underground. (1.4)
Halo—Card Faction symbol showing Non-player
has an Event instruction. (8.4.1)
Handicap—A Victory option to assist less experienced players. (7.3).
Highland—Province type that hinders Assault.
(1.3.2, 3.2.4)
Highway—Road, a LoC. (1.3.1, 1.3.4)
Improve—Shift Trail toward “4”. (3.3.1, 6.7)
Ineffective Events—Non-player avoidance of
dud Events. (8.1).
Ineligible—Faction skipped in Faction order.
(2.3.1-.2)
Infiltrate—NVA Special Activity that adds NVA
Troops or replaces VC. (4.4.2)
Insurgent—NVA or VC. (1.0, 1.5)
Irregular—US Special Forces piece (1.4).
Joint Operations—Ban on US spending ARVN
Resources below Total Econ (1.8.1, 3.1, 6.2.3,
6.3.1).
Laos—The 2 foreign country spaces Central Laos
and Southern Laos. (1.3.5)
Level—Support/Opposition status of a space.
(1.6.1)
Limited Operation (LimOp)—Operation in 1
space with no Special Activity. (2.3.5)
LoC—Line of Communication: Highway or
Mekong. (1.3.4)
Lowland—Province type that generally does not
hinder Assault. (1.3.2, 3.2.4)
Map—Board spaces: Provinces, Cities, and LoCs
(1.3, 1.3.1).
March—Insurgent Operation to move Guerrillas
and Troops. (3.3.2)
Mekong—River, a LoC. (1.3.1, 1.3.4)
Momentum—Events whose effects remain
through next Coup Round. (5.4)
Monsoon—Restrictions on Operations and
Special Activities on the Event card before each
Coup card. (2.3.9)
Non-Player—Game-run Faction. (1.5, 8.0)
Neutral—Space not in Support nor Opposition.
(1.6.1)
North Vietnam—An Insurgent Faction (NVA.)
(1.0, 1.5) Also, a Province where only NVA and
VC may stack. (1.3.5, 1.3.8, 1.4.2)
NVA—Nickname for North Vietnam Faction
(“North Vietnamese Army”). (1.0, 1.5)
Operation (Op)—Core action Faction takes with
its forces. (3.0)
Opposition—A space’s population against the
Saigon regime. (1.6)
Opposition + Bases—Total Opposition plus number
of VC Bases on the map: the measure of VC victory.
(1.9, 7.2-.3)
Out of Play—Box for pieces that are neither Available nor on the map.
Overflow—Boxes and markers to help manage cases
of overcrowding. (1.3.8)
Pacification—COIN activity to increase Support.
(3.2.1, 6.3.1)
Pass—Decline to execute an Event or Op when
Eligible. (2.3.3)
Patrol—COIN Op to protect LoCs. (3.2.2)
Patronage—A measure of the Saigon regime’s
success in diverting wealth to its friends to solidify
its rule. (1.8, 1.9, 3.2.1, 4.3.1-.3, 4.4.2, 4.5.2-.3,
6.2, 7.2-.3)
Pawn—Token to designate spaces selected for Operation or Special Activity. (3.1.1)
Phase—Part of a Coup Round. (6.0)
Piece—Force unit: Base, Troop, Police, SF or Guerrilla (not marker like Tunnel). (1.4)
Place—Move a piece from Available to map. (1.4.1)
Period Events—Option to select from Events most
historically suitable to a Scenario. (2.1)
Pivotal Event—Faction cards that trump other
Events and Faction order (2.3.8).
Police—ARVN forces that maintain control and help
pacify locals. (1.4)
Politburo—No Non-player rule allowing combined
NVA/VC player to use the higher of the two scores.
(1.5)
Population (Pop)—The inhabitants of a Province
or City, about 500,000 South Vietnamese per point.
(1.3.2-.3)
Priorities—Rules guiding Non-player Factions. (8.0)
Province—Rural space. (1.3.2)
Rally—Insurgent Operation to place or regroup
pieces. (3.3.1)
Ranger—ARVN Special Forces piece (1.4).
Redeploy—Coup phase in which Factions move
pieces. (6.5)
Remove—Take from map (forces to Available,
Casualties, or out of play as specified). (1.4.1, 3.3.3,
6.4.1 for example)
Replace—Remove pieces to place others in their
stead. (1.4.1, 3.2.1, 3.3.1, 4.4.1, 4.5.2, 5.1.1)
Republic of Vietnam (ARVN)—A Counterinsurgent
Faction. (1.0, 1.5)
Reset—Coup phase to ready for the next card. (6.5)
Resources—Factions’ wherewithal for Operations.
(1.8)
RVN Leader—Box for played Coup cards, showing
which is currently in effect. (2.4.1)
Sabotage—Place a Sabotage marker on a LoC that
does not have one, damaging it to block addition of
ARVN Resources. (3.3.4, 6.2.3, 6.6)
Select—Choose an action’s locations or targets. (3.1,
3.1.1, 4.1, 5.1)
Set—Change a space’s Support/Opposition to a
prescribed level. (1.6.1)
Shaded—2nd choice of Dual-Use Event, often
anti-US. (5.2)
Shift—Change Support/Opposition or the Trail.
(1.6.1, 6.7)
South Vietnam (The South)—Spaces not a foreign country, including all LoCs. (1.3.5)
Sovereignty—No Non-player rule forcing combined US/ARVN player to use the lower of the
two scores. (1.5)
Space—Area holding pieces on the map: Province, City, LoC. (1.3.1)
Special Activities—Actions accompanying Operations, unique to a Faction. (4.0)
Special Forces—US-led Irregular or ARVN
Ranger forces piece. (1.4)
Stacking—Limits on pieces that can occupy a
space. (1.4.2)
Subvert—VC Special Activity to remove or
replace ARVN pieces. (4.5.2)
Support—A space’s population favoring the
Saigon regime. (1.6)
Support + Available—Total Population Support
plus Available US pieces: measure of US victory.
(1.9, 7.2-.3)
Sweep—COIN Operation to move Troops and flip
Guerrillas Active. (3.2.3)
Target—Enemy Faction or piece that is the object
of an action. (3.1, 4.1)
Tax—VC Special Activity that adds Resources.
(4.5.1)
Terror—Insurgent Operation that places marker
of same name in a Province or City or Sabotage
on a LoC. (3.3.4)
Total Econ—Marked value of unSabotaged LoCs
as of prior Coup Round (1.8.1, 6.2.3)
Total Support/Oppostion—Calculation of
popular views of the Saigon regime for victory
purposes. (1.6.2, 7.2-.3)
Town—Map feature that bounds LoCs (not a
space). (1.3.6)
Trail—Track for strength of North-South logistics
net. (6.7, 3.3.1, 3.3.2, 4.3.2, 4.4.1, 6.2.2, 6.2.4, 6.6)
Train—COIN Operation to place pieces, Pacify,
or reduce Patronage. (3.2.1)
Transfer—Move Resources among Factions
or value among Resources, Aid, and Patronage.
(1.5.2, 1.6, 4.2.2, 4.3.1)
Transport—ARVN Special Activity that moves
Troops. (4.3.2)
Troops—Mobile COIN forces specializing in
Sweep and rural Assault and NVA counterparts.
(1.4)
Tunnel—Marker making a Base piece underneath
difficult to destroy (1.4.4).
Uncontrolled—Space with neither COIN nor
NVA Control. (1.7)
Underground—Guerrilla or SF, symbol end
down: not subject to Assault or Air Strike and
capable of Terror, Tax, Subvert, Ambush, Raid,
or Advise. (1.4.3, 3.3.4, 4.2.1, 4.3.3, 4.4.3, 4.5.1,
4.5.2, 4.5.3)
United States (US)—A Counterinsurgent Faction.
(1.0, 1.5)
Unshaded—1st choice of Dual-Use Event, often
pro-US. (5.2)
Victory Margin—Calculation of a Faction’s
closeness to its victory condition. (7.3)
Viet Cong (VC)—An Insurgent Faction (“Vietnamese Communist”) (1.0, 1.5)
Withdraw—Bring US forces off the map into the
US Available box. (6.5, 8.8.1)

SET UP (2.1)

General
Choose a scenario from the next two
pages and any No Non-Player (1.5),
Deception/Handicap (7.3), 1-Player
difficulty (8.9), or Period Events (right)
options desired. Prepare the deck per the
instructions below. Give each player a
Faction foldout and assign Factions
to players (1.5). If Non-players (8.0)
are being used, keep the Non-player
Operations flowcharts and the Random
Spaces foldout nearby.
Deck Preparation
Separate out the 6 Coup cards and 4
Pivotal Events and shuffle the other 120
Event cards. Place or remove Coup or
Pivotal Event cards as instructed.
• Shuffle and randomly deal a number
of Event cards (by Period, if desired)
into equal piles as specified in the
scenario. Shuffle 1 Coup card into
each pile and stack 1 pile onto the
other to form a face-down draw deck
in easy view of all players.
• Set aside the remaining Event cards.
They will not be used and may not be
inspected.
Period Events Option
If desired for events more akin
to the historical periods covered,
select Event cards by scenario as
follows.
Short: 1965-1967
Westy’s War. Set out the “AAA”
card and marker—the shaded
Capability (5.3) is in effect. Then
deal event cards into 8-card piles
only from those marked “1965”.
Medium: 1968-1972
A Better War. Set out the Capability
cards and markers as directed. Deal
event cards into 12-card piles from
those marked “1968”.
Full: 1964-1972
Nam. Form the top pile from 12
random “1964” cards, the 2nd and
3rd topmost piles from 12 “1965”
cards each, and the bottom 3 piles
from 12 “1968” cards each.
NOTE: There are 24 “1964”, 48
“1965”, and 48 “1968” cards.

SCENARIOS (2.1)

Short: 1965-1967
Westy’s War—Escalating battle for the South
Deck: Place Young Turks as RVN Leader
and Khanh beneath Young Turks; remove 1
Failed Coup and all Pivotal Events. Shuffle
24 (Period, if desired) Event cards and stack
3 piles of 8 Events and 1 Coup. Remove all
other cards.
• Aid: 15
• Total Econ: 15
• Patronage: 18
• Resources: VC 10, NVA 15, ARVN 30
• Support+Available: 38
• COIN+Patronage: 41
• Opposition+Bases: 23
• NVA+Bases: 10
• The Trail: 2
• Eligible: All Factions
Out of Play:
US—6 Troops
ARVN—10 Troops, 3 Rangers
Capabilities: (if using period Events)
Shaded—AAA
US Policy: LBJ (if US Non-player)
Da Nang, Kontum:
COIN Control, Active Support
US—3 Troops
ARVN—1 Police
Saigon, Can Tho:
COIN Control, Active Support
US—1 Base, 3 Troops
ARVN—4 Troops, 2 Police, 1 Ranger
Quang Tri:
NVA Control, Active Opposition
ARVN—1 Base, 2 Troops
NVA—1 Base, 4 Guerrillas
Quang Nam:
COIN Control
ARVN—1 Ranger, 1 Police
Quang Tin:
COIN Control
US—2 Troops
ARVN—1 Police
Binh Dinh:
COIN Control, Passive Support
US—1 Base, 1 Irregular, 4 Troops
ARVN—2 Troops, 1 Police
VC—1 Base, 2 Guerrillas
Pleiku:
US—1 Base, 1 Irregular, 1 Troop
VC—1 Base, 2 Guerrillas
Khanh Hoa:
COIN Control
US—1 Irregular, 1 Troop
Hue, Kien Hoa, Ba Xuyen:
COIN Control
ARVN—2 Police
An Loc, Qui Nhon, Cam Ranh:
COIN Control, Passive Support
ARVN—1 Police
Binh Tuy:
Passive Support
US—2 Troops
ARVN—1 Police
VC—1 Base, 2 Guerrillas
Quang Duc:
Active Opposition
VC—1 Base, 2 Guerrillas
NVA—1 Guerrilla
Tay Ninh:
Active Opposition
VC—1 Tunneled Base, 2 Guerrillas
NVA—1 Guerrilla
Kien Phong, Kien Giang:
Active Opposition
VC—2 Guerrillas.
North Vietnam, Southern Laos:
NVA Control
NVA—2 Bases, 1 Guerrilla, 6 Troops
Central Laos, The Fishhook, The Parrot’s
Beak:
NVA Control
NVA—1 Base, 2 Guerrillas
Medium: 1968-1972
A Better War—Looking for light at the end
of the tunnel
Deck: Place Ky as RVN Leader and Khanh
and Young Turks beneath Ky. Distribute
Pivotal Events. Shuffle 36 (Period, if desired)
Events and stack 3 piles of 12 Events and 1
Coup. Remove the rest.
• Aid: 30
• Total Econ: 15
• Patronage: 15
• Resources: VC 15, NVA 20, ARVN 30
• Support+Available: 37
• COIN+Patronage: 44
• Opposition+Bases: 23
• NVA+Bases: 8
• The Trail: 3
• Eligible: All Factions
Out of Play:
US—5 Troops
ARVN—10 Troops, 3 Rangers
Capabilities: (if using period Events)
Shaded—AAA, Main Force Bns, SA-2s,
Search and Destroy; Unshaded—Arc
Light, M-48 Patton
US Policy: LBJ (if US Non-player)

North Vietnam, Central Laos:
NVA Control
NVA—1 Base, 1 Guerrilla, 9 Troops
Quang Tri:
COIN Control, Passive Support
US—1 Base, 4 Troops, 1 Irregular
ARVN—3 Troops
NVA—1 Base, 3 Guerrillas
Quang Nam:
Active Opposition
VC—1 Base, 2 Guerrillas
Hue, Da Nang, Qui Nhon, Cam Ranh:
COIN Control, Passive Support
US—1 Troop
ARVN—2 Police
Quang Tin:
COIN Control, Passive Support
US—1 Base, 2 Troops
ARVN—2 Troops, 1 Police
Kontum:
COIN Control, Passive Support
US—1 Base, 1 Troop, 1 Irregular
Binh Dinh, Pleiku, Khanh Hoa:
COIN Control, Active Support
US—2 Troops, 1 Irregular
ARVN—1 Police
VC—1 Base, 2 Guerrillas
Phu Bon:
COIN Control, Passive Support
US—3 Troops
ARVN—2 Troops, 2 Police
VC—2 Guerrillas
Binh Tuy:
COIN Control
US—1 Base, 2 Troops
ARVN—3 Troops, 1 Police
VC—1 Base, 2 Guerrillas
Saigon:
COIN Control, Active Support
US—1 Base, 2 Troops
ARVN—1 Troop, 1 Ranger, 4 Police
VC—1 Base, 1 Guerrilla
Quang Duc:
COIN Control
ARVN—2 Troops, 1 Police
VC—1 Guerrilla
Phuoc Long:
VC—1 Base, 2 Guerrillas
NVA—1 Guerrilla
Tay Ninh:
COIN Control, Active Opposition
US—1 Base, 3 Troops
ARVN—2 Troops, 1 Ranger
VC—1 Tunneled Base, 3 Guerrillas
NVA—2 Guerrillas
An Loc:
COIN Control
ARVN—1 Troop, 2 Police
Can Tho:
COIN Control, Passive Support
US—3 Troops, 1 Irregular
ARVN—2 Troops, 1 Police
Kien Phong, Kien Hoa, Ba Xuyen:
Passive Opposition
ARVN—1 Police
VC—1 Guerrilla
Kien Giang:
COIN Control, Active Opposition
ARVN—1 Base, 2 Troops, 1 Ranger
VC—1 Guerrilla
Southern Laos, NE Cambodia, The Fish
Hook, The Parrot’s Beak, Sihanoukville:
NVA Control
NVA—1 Base, 2 Guerrillas
Full: 1964-1972
Nam—Cockpit of the Cold War
Deck: Distribute Pivotal Events. Shuffle and
stack 6 piles of 12 Events (Period, if desired)
and 1 Coup each. Remove the remaining
48 Events.
• Aid: 15
• Total Econ: 15
• Patronage: 15
• Resources: VC 5, NVA 10, ARVN 30
• Support+Available: 38
• COIN+Patronage: 35
• Opposition+Bases: 27
• NVA+Bases: 4
• The Trail: 1
• Eligible: All Factions
Out of Play:
US—2 Bases, 10 Troops
ARVN—2 Bases, 10 Troops, 3 Rangers

US Policy: JFK (if US Non-player)
Saigon:
COIN Control, Passive Support
US—1 Base, 2 Troops
ARVN—2 Troops, 3 Police
Hue:
COIN Control
ARVN—2 Troops, 2 Police
Qui Nhon, Cam Ranh, An Loc, Can Tho:
COIN Control, Passive Support
ARVN—2 Troops, 2 Police
Da Nang, Kontum:
COIN Control
US—2 Troops
ARVN—1 Police
Quang Tri, Binh Dinh:
US—1 Irregular, 1 Troop
VC—1 Base, 2 Guerrillas
Quang Nam:
COIN Control
ARVN—1 Ranger, 1 Police
Pleiku:
US—1 Base, 1 Irregular, 1 Troop
VC—1 Base, 2 Guerrillas
Quang Tin, Quang Duc, Binh Tuy:
Active Opposition
VC—1 Base, 2 Guerrillas
Tay Ninh:
Active Opposition
VC—1 Tunneled Base, 2 Guerrillas.
Phu Bon, Khanh Hoa, Kien Hoa, Ba Xuyen:
COIN Control, Passive Support
ARVN—1 Police
Kien Phong, Kien Giang:
Active Opposition
VC—1 Guerrilla
North Vietnam, Central Laos, Southern
Laos, The Parrot’s Beak:
NVA Control
NVA—1 Base, 3 Guerrillas

## Map provinces, cities, and adjacencies

### Cities

- Hue
- Da Nang
- Kontum
- Qui Nhon
- Cam Ranh
- An Loc
- Saigon
- Can Tho

### Provinces

- Central Laos
- Southern Laos
- Northeast Cambodia
- The Fishhook
- The Parrot's Beak
- Sihanoukville
- North Vietnam
- Quang Tri-Thua Thien
- Quang Nam
- Quang Tin-Quang Ngai
- Binh Dinh
- Pleiku-Darlac
- Phu Bon-Phu Yen
- Khanh Hoa
- Phuoc Long
- Quang Duc-Long Khanh
- Binh Tuy-Binh Thuan
- Thay Ninh
- Kien Phong
- Kien Hoa-Vinh Binh
- Ba Xuyen
- Kien Giang-An Xuyen

### LoCs

- LOC Hue -- Khe Sanh
- LOC Hue -- Da Nang
- LOC Da Nang -- Dak To
- LOC Da Nang -- Qui Nhon
- LOC Kontum -- Dak To
- LOC Kontum -- Qui Nhon
- LOC Kontum -- Ban Me Thuot
- LOC Qui Nhon -- Cam Ranh
- LOC Cam Ranh -- Da Lat
- LOC Ban Me Thuot -- Da Lat
- LOC Saigon -- Cam Ranh
- LOC Saigon -- Da Lat
- LOC Saigon -- An Loc -- Ban Me Thuot
- LOC Saigon -- Can Tho
- LOC Can Tho -- Chau Doc
- LOC Can Tho -- Bac Lieu
- LOC Can Tho -- Long Phu

### Outside South

- NorthVietnam, CentralLaos, SouthernLaos, NortheastCambodia, TheFishhook, TheParrotsBeak, Sihanoukville

### Laos

- Central Laos, Southern Laos

### Cambodia

- Northeast Cambodia, The Fishhook, The Parrot's Beak, Sihanoukville

### Mekong LoCs

- LOC Saigon -- Can Tho
- LOC Can Tho -- Chau Doc
- LOC Can Tho -- Long Phu

### Adjacency Map

    // Cities
    Hue                         -> Set(QuangTri_ThuaThien, LOC_Hue_KheSanh, LOC_Hue_DaNang),
    DaNang                      -> Set(QuangNam, QuangTin_QuangNgai, LOC_Hue_DaNang, LOC_DaNang_QuiNhon,
                                       LOC_DaNang_DakTo),
    Kontum                      -> Set(BinhDinh, Pleiku_Darlac, PhuBon_PhuYen, LOC_Kontum_DakTo,
                                       LOC_Kontum_BanMeThuot, LOC_Kontum_QuiNhon),
    QuiNhon                     -> Set(BinhDinh, PhuBon_PhuYen, LOC_DaNang_QuiNhon, LOC_Kontum_QuiNhon,
                                       LOC_QuiNhon_CamRanh),
    CamRahn                     -> Set(KhanhHoa, BinhTuy_BinhThuan, LOC_QuiNhon_CamRanh, LOC_Saigon_CamRanh,
                                       LOC_CamRanh_DaLat),
    AnLoc                       -> Set(PhuocLong, TayNinh, TheFishhook, LOC_Saigon_AnLoc_BanMeThuot),
    Saigon                      -> Set(BinhTuy_BinhThuan, QuangDuc_LongKhanh, TayNinh, KienPhong,
                                       KienHoa_VinhBinh, LOC_Saigon_CamRanh, LOC_Saigon_DaLat,
                                       LOC_Saigon_AnLoc_BanMeThuot,
                                       LOC_Saigon_CanTho),
    CanTho                      -> Set(KienPhong, KienHoa_VinhBinh, BaXuyen, KienGiang_AnXuyen,
                                       LOC_Saigon_CanTho, LOC_CanTho_ChauDoc, LOC_CanTho_BacLieu,
                                       LOC_CanTho_LongPhu),

    // Provinces
    CentralLaos                 -> Set(NorthVietnam, QuangTri_ThuaThien, QuangNam, SouthernLaos,
                                       LOC_Hue_KheSanh),
    SouthernLaos                -> Set(CentralLaos, QuangNam, QuangTin_QuangNgai, BinhDinh, Pleiku_Darlac, NortheastCambodia,
                                       LOC_DaNang_DakTo, LOC_Kontum_DakTo),
    NortheastCambodia           -> Set(SouthernLaos, TheFishhook, Pleiku_Darlac),
    TheFishhook                 -> Set(NortheastCambodia, TheParrotsBeak, AnLoc, Pleiku_Darlac,
                                       QuangDuc_LongKhanh, PhuocLong, TayNinh, LOC_Saigon_AnLoc_BanMeThuot),
    TheParrotsBeak              -> Set(TheFishhook, Sihanoukville, TayNinh, KienPhong, KienGiang_AnXuyen,
                                       LOC_CanTho_ChauDoc),
    Sihanoukville               -> Set(TheParrotsBeak, KienGiang_AnXuyen),
    NorthVietnam                -> Set(CentralLaos, QuangTri_ThuaThien, LOC_Hue_KheSanh),
    QuangTri_ThuaThien          -> Set(NorthVietnam, Hue, CentralLaos, QuangNam, LOC_Hue_KheSanh,
                                       LOC_Hue_DaNang),
    QuangNam                    -> Set(CentralLaos, SouthernLaos, QuangTri_ThuaThien, DaNang,
                                       QuangTin_QuangNgai, LOC_Hue_DaNang, LOC_DaNang_DakTo),
    QuangTin_QuangNgai          -> Set(SouthernLaos, DaNang, QuangNam, BinhDinh, LOC_DaNang_DakTo,
                                       LOC_DaNang_QuiNhon),
    BinhDinh                    -> Set(SouthernLaos, QuangTin_QuangNgai, QuiNhon, PhuBon_PhuYen, Kontum,
                                       Pleiku_Darlac, LOC_DaNang_DakTo, LOC_DaNang_QuiNhon, LOC_Kontum_DakTo,
                                       LOC_Kontum_QuiNhon),
    Pleiku_Darlac               -> Set(SouthernLaos, NortheastCambodia, TheFishhook, BinhDinh, Kontum,
                                       PhuBon_PhuYen, KhanhHoa, QuangDuc_LongKhanh, LOC_Kontum_DakTo,
                                       LOC_Kontum_BanMeThuot, LOC_DaNang_DakTo, LOC_BanMeThuot_DaLat,
                                       LOC_Saigon_AnLoc_BanMeThuot),
    PhuBon_PhuYen               -> Set(Kontum, BinhDinh, QuiNhon, KhanhHoa, Pleiku_Darlac,
                                       LOC_Kontum_QuiNhon, LOC_QuiNhon_CamRanh, LOC_Kontum_BanMeThuot),
    KhanhHoa                    -> Set(PhuBon_PhuYen, CamRahn, BinhTuy_BinhThuan, QuangDuc_LongKhanh,
                                       Pleiku_Darlac, LOC_QuiNhon_CamRanh, LOC_CamRanh_DaLat,
                                       LOC_BanMeThuot_DaLat, LOC_Kontum_BanMeThuot, LOC_Saigon_DaLat),
    PhuocLong                   -> Set(TheFishhook, AnLoc, QuangDuc_LongKhanh, TayNinh,
                                       LOC_Saigon_AnLoc_BanMeThuot),
    QuangDuc_LongKhanh          -> Set(TheFishhook, Pleiku_Darlac, KhanhHoa, BinhTuy_BinhThuan, Saigon,
                                       TayNinh, PhuocLong, LOC_Kontum_BanMeThuot,
                                       LOC_Saigon_AnLoc_BanMeThuot, LOC_BanMeThuot_DaLat, LOC_Saigon_DaLat),
    BinhTuy_BinhThuan           -> Set(Saigon, QuangDuc_LongKhanh, KhanhHoa, CamRahn, LOC_BanMeThuot_DaLat,
                                       LOC_CamRanh_DaLat, LOC_Saigon_DaLat, LOC_Saigon_CamRanh),
    TayNinh                     -> Set(TheParrotsBeak, TheFishhook, AnLoc, PhuocLong, QuangDuc_LongKhanh,
                                       Saigon, KienPhong, LOC_Saigon_AnLoc_BanMeThuot),
    KienPhong                   -> Set(TheParrotsBeak, TayNinh, Saigon, KienHoa_VinhBinh, CanTho,
                                       KienGiang_AnXuyen, LOC_CanTho_ChauDoc, LOC_Saigon_CanTho),
    KienHoa_VinhBinh            -> Set(Saigon, KienPhong, CanTho, BaXuyen, LOC_Saigon_CanTho,
                                       LOC_CanTho_LongPhu),
    BaXuyen                     -> Set(KienGiang_AnXuyen, CanTho, KienHoa_VinhBinh, LOC_CanTho_BacLieu,
                                       LOC_CanTho_LongPhu),
    KienGiang_AnXuyen           -> Set(Sihanoukville, TheParrotsBeak, KienPhong, CanTho, BaXuyen,
                                       LOC_CanTho_ChauDoc, LOC_CanTho_BacLieu),
    // LOCs
    LOC_Hue_KheSanh             -> Set(CentralLaos, NorthVietnam, Hue, QuangTri_ThuaThien),
    LOC_Hue_DaNang              -> Set(Hue, QuangTri_ThuaThien, QuangNam, DaNang),
    LOC_DaNang_DakTo            -> Set(DaNang, QuangNam, QuangTin_QuangNgai, SouthernLaos, BinhDinh,
                                       Pleiku_Darlac, LOC_Kontum_DakTo),
    LOC_DaNang_QuiNhon          -> Set(DaNang, QuangTin_QuangNgai, BinhDinh, QuiNhon),
    LOC_Kontum_DakTo            -> Set(Kontum, Pleiku_Darlac, SouthernLaos, BinhDinh),
    LOC_Kontum_QuiNhon          -> Set(Kontum, BinhDinh, QuiNhon, PhuBon_PhuYen),
    LOC_Kontum_BanMeThuot       -> Set(Kontum, Pleiku_Darlac, PhuBon_PhuYen, KhanhHoa, QuangDuc_LongKhanh,
                                       LOC_Saigon_AnLoc_BanMeThuot, LOC_BanMeThuot_DaLat),
    LOC_QuiNhon_CamRanh         -> Set(QuiNhon, PhuBon_PhuYen, KhanhHoa, CamRahn),
    LOC_CamRanh_DaLat           -> Set(CamRahn, KhanhHoa, BinhTuy_BinhThuan, QuangDuc_LongKhanh,
                                       LOC_Saigon_DaLat, LOC_BanMeThuot_DaLat),
    LOC_BanMeThuot_DaLat        -> Set(Pleiku_Darlac, KhanhHoa, BinhTuy_BinhThuan, QuangDuc_LongKhanh,
                                       LOC_Kontum_BanMeThuot, LOC_Saigon_AnLoc_BanMeThuot, LOC_Saigon_DaLat,
                                       LOC_CamRanh_DaLat),
    LOC_Saigon_CamRanh          -> Set(Saigon, CamRahn, BinhTuy_BinhThuan),
    LOC_Saigon_DaLat            -> Set(Saigon, BinhTuy_BinhThuan, QuangDuc_LongKhanh, KhanhHoa,
                                       LOC_BanMeThuot_DaLat, LOC_CamRanh_DaLat),
    LOC_Saigon_AnLoc_BanMeThuot -> Set(Saigon, TayNinh, QuangDuc_LongKhanh, PhuocLong, AnLoc, TheFishhook,
                                       Pleiku_Darlac, KhanhHoa, LOC_Kontum_BanMeThuot, LOC_BanMeThuot_DaLat),
    LOC_Saigon_CanTho           -> Set(Saigon, CanTho, KienPhong, KienHoa_VinhBinh),
    LOC_CanTho_ChauDoc          -> Set(CanTho, KienPhong, KienGiang_AnXuyen, TheParrotsBeak),
    LOC_CanTho_BacLieu          -> Set(CanTho, KienGiang_AnXuyen, BaXuyen),
    LOC_CanTho_LongPhu          -> Set(CanTho, BaXuyen, KienHoa_VinhBinh)
  )

  ### Default Space Definitions

    val Default_Hue     = Space(Hue,    City, 2, coastal = true)
  val Default_DaNang  = Space(DaNang, City, 1, coastal = true)
  val Default_Kontum  = Space(Kontum, City, 1)
  val Default_QuiNhon = Space(QuiNhon, City, 1, coastal = true)
  val Default_CamRahn = Space(CamRahn, City, 1, coastal = true)
  val Default_AnLoc   = Space(AnLoc , City, 1)
  val Default_Saigon  = Space(Saigon, City, 6, coastal = true)
  val Default_CanTho  = Space(CanTho, City, 1)

  val Default_CentralLaos        = Space(CentralLaos,        JungleProvince,   0)
  val Default_SouthernLaos       = Space(SouthernLaos,       JungleProvince,   0)
  val Default_NortheastCambodia  = Space(NortheastCambodia,  JungleProvince,   0)
  val Default_TheFishhook        = Space(TheFishhook,        JungleProvince,   0)
  val Default_TheParrotsBeak     = Space(TheParrotsBeak,     JungleProvince,   0)
  val Default_Sihanoukville      = Space(Sihanoukville,      JungleProvince,   0, coastal = true)
  val Default_NorthVietnam       = Space(NorthVietnam,       HighlandProvince, 0, coastal = true)
  val Default_QuangTri_ThuaThien = Space(QuangTri_ThuaThien, HighlandProvince, 2, coastal = true)
  val Default_QuangNam           = Space(QuangNam,           HighlandProvince, 1, coastal = true)
  val Default_QuangTin_QuangNgai = Space(QuangTin_QuangNgai, LowlandProvince,  2, coastal = true)
  val Default_BinhDinh           = Space(BinhDinh,           HighlandProvince, 2, coastal = true)
  val Default_Pleiku_Darlac      = Space(Pleiku_Darlac,      HighlandProvince, 1)
  val Default_PhuBon_PhuYen      = Space(PhuBon_PhuYen,      LowlandProvince,  1, coastal = true)
  val Default_KhanhHoa           = Space(KhanhHoa,           HighlandProvince, 1, coastal = true)
  val Default_PhuocLong          = Space(PhuocLong,          JungleProvince,   0)
  val Default_QuangDuc_LongKhanh = Space(QuangDuc_LongKhanh, JungleProvince,   1)
  val Default_BinhTuy_BinhThuan  = Space(BinhTuy_BinhThuan,  JungleProvince,   1, coastal = true)
  val Default_TayNinh            = Space(TayNinh,            JungleProvince,   2)
  val Default_KienPhong          = Space(KienPhong,          LowlandProvince,  2)
  val Default_KienHoa_VinhBinh   = Space(KienHoa_VinhBinh,   LowlandProvince,  2, coastal = true)
  val Default_BaXuyen            = Space(BaXuyen,            LowlandProvince,  1, coastal = true)
  val Default_KienGiang_AnXuyen  = Space(KienGiang_AnXuyen,  LowlandProvince,  2, coastal = true)

  val Default_LOC_Hue_KheSanh             = Space(LOC_Hue_KheSanh,             LoC, 1, coastal = true)
  val Default_LOC_Hue_DaNang              = Space(LOC_Hue_DaNang,              LoC, 1, coastal = true)
  val Default_LOC_DaNang_DakTo            = Space(LOC_DaNang_DakTo,            LoC, 0)
  val Default_LOC_DaNang_QuiNhon          = Space(LOC_DaNang_QuiNhon,          LoC, 1, coastal = true)
  val Default_LOC_Kontum_DakTo            = Space(LOC_Kontum_DakTo,            LoC, 1)
  val Default_LOC_Kontum_QuiNhon          = Space(LOC_Kontum_QuiNhon,          LoC, 1)
  val Default_LOC_Kontum_BanMeThuot       = Space(LOC_Kontum_BanMeThuot,       LoC, 1)
  val Default_LOC_QuiNhon_CamRanh         = Space(LOC_QuiNhon_CamRanh,         LoC, 1, coastal = true)
  val Default_LOC_CamRanh_DaLat           = Space(LOC_CamRanh_DaLat,           LoC, 1)
  val Default_LOC_BanMeThuot_DaLat        = Space(LOC_BanMeThuot_DaLat,        LoC, 0)
  val Default_LOC_Saigon_CamRanh          = Space(LOC_Saigon_CamRanh,          LoC, 1, coastal = true)
  val Default_LOC_Saigon_DaLat            = Space(LOC_Saigon_DaLat,            LoC, 1)
  val Default_LOC_Saigon_AnLoc_BanMeThuot = Space(LOC_Saigon_AnLoc_BanMeThuot, LoC, 1)
  val Default_LOC_Saigon_CanTho           = Space(LOC_Saigon_CanTho,           LoC, 2)
  val Default_LOC_CanTho_ChauDoc          = Space(LOC_CanTho_ChauDoc,          LoC, 1)
  val Default_LOC_CanTho_BacLieu          = Space(LOC_CanTho_BacLieu,          LoC, 0, coastal = true)
  val Default_LOC_CanTho_LongPhu          = Space(LOC_CanTho_LongPhu,          LoC, 1, coastal = true)

  ### Capabilities

    val Cap_TopGun             = "#4 Top Gun"                  // affects air strike
  val Cap_ArcLight           = "#8 Arc Light"                // affects air strike
  val Cap_Abrams             = "#11 Abrams"                  // affects assault
  val Cap_Cobras             = "#13 Cobras"                  // affects sweep / assault
  val Cap_M48Patton          = "#14 M-48 Patton"             // affects assault / patrol
  val Cap_CombActionPlatoons = "#18 Combined Acton Platoons" // affects training / sweep
  val Cap_CORDS              = "#19 CORDS"                   // affects training
  val Cap_LaserGuidedBombs   = "#20 Laser Guided Bombs"      // affects air strike
  val Cap_SearchAndDestroy   = "#28 Search And Destroy"      // affects assault
  val Cap_AAA                = "#31 AAA"                     // affects rally / air strike
  val Cap_LongRangeGuns      = "#32 Long Range Guns"         // affects bombard
  val Cap_MiGs               = "#33 MiGs"                    // affects NVA resoures during reset / air strike
  val Cap_SA2s               = "#34 SA-2s"                   // affects air strike degrading trail / NVA rally improving trail
  val Cap_PT76               = "#45 PT-76"                   // affects NVA attack
  val Cap_ArmoredCavalry     = "#61 Armored Cavalry"         // affects ARVN transport
  val Cap_MandateOfHeaven    = "#86 Mandate of Heaven"       // affects ARVN govern
  val Cap_BoobyTraps         = "#101 Booby Traps"            // affects ambush / sweep
  val Cap_MainForceBns       = "#104 Main Force Bns"         // affects insurgent march / VC ambush
  val Cap_Cadres             = "#116 Cadres"                 // affects VC terror and agitate / VC rally agitate


### Momentum Markers

  val Mo_WildWeasels       = "#5 Wild Weasels"              // Shaded   (affects Air Strike)
  val Mo_ADSID             = "#7 ADSID"                     // Unshaded (-6 NVA resources at any trail change)
  val Mo_RollingThunder    = "#10 Rolling Thunder"          // Shaded   (prohibits air strike)
  val Mo_Medevac_Unshaded  = s"$Medevac_prefix (unshaded)"  // (affects commitment phase during coup round)
  val Mo_Medevac_Shaded    = s"$Medevac_prefix (shaded)"    // (prohibits air lift)
  val Mo_BlowtorchKomer    = "#16 Blowtorch Komer"          // Unshaded (Pacify costs 1 resource per step/terror, during Support phase)
  val Mo_Claymores         = "#17 Claymores"                // Unshaded (prohibits ambush, affect guerrilla march)
  val Mo_DaNang            = "#22 Da Nang"                  // Shaded (prohibits air strike)
  val Mo_McNamaraLine      = "#38 McNamara Line"            // Single event (prohibits infiltrate, prohibits trail improvement by rally)
  val Mo_Oriskany          = "#39 Oriskany"                 // Shaded (prohibits degrade of trail) (includes air strike, coup round, NOT evnts!)
  val Mo_BombingPause      = "#41 Bombing Pause"            // Single event (prohibits air strike)
  val Mo_559TransportGrp   = "#46 559th Transport Grp"      // Unshaded (Infiltrate is max 1 space)
  val Mo_BodyCount         = "#72 Body Count"               // Unshaded (affects asasult and patrol)
  val Mo_GeneralLansdale   = "#78 General Lansdale"         // Shaded (prohibits assault)
  val Mo_TyphoonKate       = "#115 Typhoon Kate"            // Single event (prohibits air lift, transport, and bombard, all other special activities are max 1 space)

## Fire in the Lake Tutorial

### First-time players should start here!
Welcome to the Tutorial for FIRE IN THE LAKE. Its intent is to
walk you through the game step-by-step, demonstrating important
core system mechanics while also providing familiarity with some
of the various options available to each faction. As such, teaching
the game proper is the primary goal of this example-of-play rather
than depicting optimal strategy.
Since this Tutorial is crafted around a hypothetical 4-player session,
the rules for the non-player factions will not be utilized. This should
make it easier for you to learn the game’s basics by ignoring rules
section 8 in its entirety.
Let’s start by sorting the cards into their three corresponding historical periods as listed in their upper left hand corner: 1964, 1965,
and 1968. We’ll be using only a portion of the 1964 deck, so set
aside all the 1965 and 1968 cards as they won’t be needed for this
demonstration.

Normally the play deck is prepared more randomly, with or without
historical cards (2.1), but for this Tutorial we will sequence the following 12 Event cards, along with Coup! card #125, placing them
face-down in the order listed below to form a 13 card mini-deck.
From bottom to top:
13. (bottom card) Colonel Chau, #112
12. Economic Aid, #43
11. 301st Supply Bn, #51
10. Claymores, #17
09. Sihanouk, #75
08. Coup! card #125, Nguyen Khanh
07. Booby Traps, #101
06. Henry Cabot Lodge, #79
05. Brinks Hotel, #97
04. Gulf of Tonkin, #1
03. Green Berets, #68
02. Trucks, #55
01. (top card) Burning Bonze, #107
The other twelve 1964 cards will not be used in this session, so they
can be returned to the box.
Next, refer to rules section 2.1 and carefully setup the Full Game
(1964-1972) as indicated (back pages of the rulebook). There is
no need to build the complete card deck unless you’re planning to
continue the game upon the Tutorial’s completion.
First a few comments on setup. While the NVA Control North
Vietnam and three Jungle (1.3.2) spaces in Laos/Cambodia (1.3.4),
these do not contribute towards the NVA victory level (NVA Control
+ Bases, 1.9) because their Population level is 0. The NVA do get
credit for their 4 Bases however, as indicated by their victory marker
starting in the 4 space on the Track to begin play.
Note that each faction receives their own Pivotal Event (2.3.8). Such
cards serve as a face-up “home” card separate from the main deck,
available for use (to preempt an Event card 5.1.4 or to possibly trump
another faction’s Pivotal Event) only when the Faction is Eligible
and the card’s prerequisite condition(s) are met. (This example will
not go far enough into the scenario for these conditions to be met.)
Also, the default RVN leader (2.4.1, printed on the map) to begin
the Full Game is Duong Van Minh. His bonus of +5 Aid when the
ARVN perform a Training Operation is active at the start of play.
Minh’s lingering effect will remain valid until a new RVN leader
replaces him or he is cancelled via a Failed Attempt on the next
Coup! card (2.4).
Further, take note of the two overflow boxes (1.3.8). Overflow boxes
are used when too many pieces occupy a space and are therefore
helpful in reducing map clutter.
Now turn over the top card, Burning Bonze, as the first card of the
game. Also reveal the next card, Trucks, which becomes the preview
card for the subsequent turn.
Finally, have one of the four faction foldouts (that say “United
States”, “North Vietnam”, and so on) nearby for referral throughout
this Tutorial.

### GAME TURN 1, Burning Bonze
Looking across the top of the Burning Bonze card, the faction order
(2.3.2) for the turn (from left to right, 2.3) is: VC (blue), NVA (red),
ARVN (yellow), and US (green). At the start of any scenario all
the factions begin Eligible (2.3.1), so the Viet Cong will have first
consideration on this card.
The VC examine the top unshaded portion (pro-COIN) Event of the
card, and also the bottom shaded portion (pro-Insurgent) Event. On
dual Event cards such as these (5.2), either the top or bottom Event
is allowed to be performed on a turn, never both.
The VC initiate play by deciding to execute the shaded Event (5.1),
“Shift Saigon 1 level toward Active Opposition. Aid –12”. Move
the blue VC token from the Eligible box to the 1st Eligible Event
portion of the Sequence of Play (SOP) chart located on the map.
The effect of this Event is dramatic to begin the game – Saigon’s
Passive Support marker is shifted one level towards Active Opposition, making the space Neutral (1.6.1). This results in the marker’s
removal because the absence of any such marker in a space indicates
that it has no Support or Opposition, and is therefore Neutral (1.6.2).
This causes the US’s victory marker (Support + Available, 1.9) to
drop 6 spaces on the track (6 is the population value of Saigon,
1.3.3) from 38 to 32.
The ARVN faction is also impacted by this Event because Aid (1.8)
is lowered by 12. Move the Aid marker on the track from 15 to 3.
There is no immediate effect on ARVN resources (which remain at
30), however resources granted to the ARVN via Aid will dwindle
accordingly during the next Coup Round (6.2.3).
Events don’t cost resources to enact, so the VC player-turn is done.
The NVA is the next listed faction, potentially being 2nd Eligible
(2.3.4). Checking the Sequence of Play chart, we see that since
the 1st Eligible faction (VC) performed the card’s Event, the 2nd
Eligible faction may perform Operations (Op) & an accompanying
Special Activity.
The NVA see that they will be first up on the next card (Trucks), so
the decision whether to go now or to Pass (2.3.3) is at hand. The
NVA decide to Pass. Shift their red token from the Eligible box to
the Pass box, and then increase NVA resources by +1 to 11, moving

the NVA token up one box on the Track. When an Insurgent faction
(VC or NVA) Passes, they receive +1 Resource; when a COIN faction (US or ARVN) Passes, the ARVN receive +3 resources (2.3.3).
With the NVA Passing, the ARVN are next in line to be 2nd Eligible.
They indicate their intention to act by moving their yellow Eligibility
token to the Execute Op & Special Activity box on the Sequence of
Play chart. Factions conducting Op & a Special Activity have the
option of performing a chosen Operation first or performing an accompanying Special Activity first, or even interrupting an Op at one
point to conduct an allowed Special Activity (4.1). In this example,
the ARVN will perform an Operation (3.1) first.

VC Event, NVA Pass, ARVN Op & Special Activity.
With Saigon now at Neutral (no Support), the ARVN don’t want
any insurgent Guerrillas to Rally in and thus infest their capital.
The ARVN will therefore Train (3.2.1) in Saigon, placing a white
pawn in the City. This Operation will cost the ARVN 3 resources,
so lower their marker on the track from 30 to 27.
The ARVN could have chosen other Cities or Provinces without
NVA Control to Train in by similarly placing a white pawn in them
and expending 3 resources per, but for now the ARVN are content
on focusing just on Saigon and saving their resources for later.
Being a City, the ARVN can place 1-2 Rangers or 1-6 of their cubes,
so a choice needs to be made: Rangers or cubes. The ARVN takes 6
of their yellow Troop cubes from Available and places them directly
into Saigon. Police are also cubes and could have been selected
in lieu of some (or all) of the Troop cubes, but the ARVN want to
increase their military presence in the City as much as possible.

Since Saigon contains ARVN Troops and Police and is under COIN
Control, the ARVN also opts to now conduct a Pacify (6.3.1) action in 1 Train space, as specifically allowed for by this Operation. Since
Saigon was the only space selected to Train this turn, Pacify will
be done there. Even though permitted by a Training Op, Pacify still
needs to be paid for separately (it is not “free”, 3.1.2, 5.5).
The ARVN spend 3 Resources by moving the Track token down from
27 to 24 to Pacify one level, and they place a Passive Support marker
in Saigon. This returns the US Support + Available (1.9) marker
on the track to 38 (+6 spaces, matching the population of Saigon).
The ARVN could have raised Support one more level to Active
Support by paying 3 additional resources, further protecting their
capital but also bringing the US another 6 points closer to the US
victory threshold (of 50). They decide against doing so for now.
For their Special Activity (refer to the Faction foldout), the ARVN
have the choice to either Govern (4.3.1) or Transport (4.3.2). As
specified, Raid (4.3.3) is not permitted to accompany (4.1.1) a Train
Op so it’s not an option. Govern is thus chosen because the ARVN
want to restore their Aid, which the VC’s just-executed Event has
reduced.
Taking two black pawns (the maximum number of spaces allowed
for this Special Activity), one is placed in An Loc and one in Can
Tho, both population 1 Cities that are also COIN-Controlled. Saigon
can never be a locale for Govern per rule (4.3.1), and besides it was
just selected to Train in so that would disqualify the space anyway.
Hue (a 2 population City) cannot yet be chosen for Govern because
it has no Support (currently at Neutral).
This increases Aid by +6, +3 for each City (3 x 1 population) Governed. Adjust the Aid marker on the track from 3 to 9.
ARVN having just Trained, Aid also receives a +5 bonus because
of the current RVN leader (Minh), so shift the marker up again
from 9 to 14.
Special Activities do not cost resources (4.1), so the ARVN remain
at 24. Remove the one white and two black pawns from the map as
the ARVN has now completed their player-turn.
Since two Eligible factions (the VC 1st and the ARVN 2nd) have
now acted, the turn is over (2.3.6). The US can do nothing (not even
Pass), so their Eligibility token remains in place. Shift the VC and
ARVN Eligibility tokens to the Ineligible box; they won’t be able
to do anything next turn (2.3). The NVA (who Passed) Eligibility
token returns to the Eligible box, joining the US token.
Make Trucks the current card for game turn 2 by placing it atop
Burning Bonze. Reveal the next card (2.3.7) in the deck (Green
Berets), which then becomes the preview card for the turn to follow.

## Game Cards mentioned in tutorial

Period Event: 1964
Faction Order: VC, NVA, ARVN, US
Card Number: 107
Title: Burning Bonze
Italized Flavor Text: "Gruesome protests close elite ranks."
Event Text: "Patronage +3 or, if Saigon at Active Support, +6"
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Anti-regime self-immolation: Shift Saigon 1 level forward toward Active Opposition. Aid -12."

Period Event: 1964
Faction Order: NVA, VC, US, ARVN
Card Number: 55
Title: Trucks
Italized Flavor Text: "Bottlenecks."
Event Text: "Degrade Trail 2 boxes. NVA selects and removes 4 of its pieces each from Laos and Cambodia."
Lasting Effects Indicator (5.3): None
Shaded Text (see Dual Use 5.2): "Convoys: Add twice Trail value to each NVA and VC Resources. NVA moves its unTunneled Bases anywhere within Laos/Cambodia."

Period Event: 1964
Faction Order: ARVN, US, VC, NVA
Card Number: 68
Title: Green Berets
Italized Flavor Text: "Elite trainers."
Event Text: "Place 3 Irregulars or 3 Rangers in a Province without NVA Control. Set it to Active Support."
Lasting Effects Indicator (5.3): None.
Shaded Text (see Dual Use 5.2): "Reluctant trainees: Remove any 3 Irregulars to Available and set 1 of their Provinces to Active Opposition."

## Your goal

1) We want to create the full GameSpecDoc for the game Fire in the Lake, with all the game specifications that will be perfectly codified to the corresponding GameDef, and that will run in the simulation as expected.
2) Create one or more e2e tests (test/e2e/ ) that prove that the Fire in the Lake Tutorial plays out in our simulation exactly as indicated in the playthrough (which would prove our GameSpecDoc -> GameDef -> simulation works well). Of course, a single turn as we have provided in the text of the tutorial isn't enough for fill verification, and we're only providing three cards even though there are a couple hundred, but this is the first "slice" of the app we intend to prove for validity.
