# Fire in the Lake AI Policy Requirements: Competent Faction Personalities

## Scope

This report describes competent, general-purpose policy personalities for the four base-game factions in Fire in the Lake:

- US
- ARVN
- NVA
- VC

The goal is not to reproduce the printed non-player bots. The goal is to describe what a competent human-like policy should *generally* try to do, so that an AI-agent DSL can be evaluated against these requirements.

The policy should not simply map each faction to a preferred operation. Fire in the Lake is too positional and too temporal for that. A good policy must evaluate:

- current victory margins;
- upcoming Coup/Monsoon timing;
- eligibility and next-card opportunity;
- legality and resource cost;
- action + special-activity combinations;
- target-space value;
- whether an apparent ally is becoming a rival;
- whether a move improves the faction’s own margin or only helps a nominal partner.

## Core shared model

Every faction should evaluate a candidate turn as a composed object:

    candidate_turn =
      operation
      + optional_special_activity
      + timing_order_of_special_activity
      + selected_spaces
      + selected_pieces
      + expected_posture_after_coup

The policy should not score an Operation and Special Activity independently. Many strong turns are strong only because of sequencing:

- Sweep then removal.
- March then Ambush.
- March then Infiltrate.
- Train then Govern.
- Assault, then mobility special, then continued Assault.
- Tax during a Terror turn.
- Air Lift before Training to make a Pacification target legal.

### Universal priority stack

All factions should use a decision stack roughly like this:

1. **Immediate own win**
   - If a legal move can cross the faction’s victory threshold before the next check, choose it unless another faction would still win first or the move is illegal after Coup effects.

2. **Block immediate enemy win**
   - If an enemy is about to exceed its victory condition at the next Coup check, block the largest/most certain margin.
   - Blocking means different things by enemy:
     - Block US by reducing Support or Available US count, preventing Pacification, killing US Troops/Bases, or raising VC Opposition.
     - Block ARVN by reducing COIN Control, reducing Patronage, threatening Aid/Econ, or removing ARVN cubes.
     - Block NVA by removing NVA Control or Bases.
     - Block VC by reducing Opposition, removing VC Bases, adding COIN Control, or preventing Agitation.

3. **Near-Coup concrete scoring**
   - When a Coup is imminent, prefer actions that immediately affect victory margins, resources, Support/Opposition, Control, LoC sabotage, Trail, Redeploy, or Agitation/Pacification eligibility.
   - Do not choose speculative setup if a concrete Coup swing exists.

4. **Resource/logistics maintenance**
   - US and ARVN must protect Aid/Econ/LoCs enough that COIN actions remain affordable.
   - NVA must maintain the Trail and Laos/Cambodia infrastructure.
   - VC must maintain enough Resources and Bases to Agitate, Terror, and recover.

5. **Positional development**
   - Build or defend bases.
   - Establish Troop/Police pairs for COIN Pacification.
   - Spread hidden guerrillas for insurgent flexibility.
   - Preserve mobility networks: LoCs for COIN, Trail/Laos/Cambodia for NVA, LoCs and non-Control spaces for VC.

6. **Efficiency and risk management**
   - Prefer actions that change Control, Support/Opposition, Bases, Resources, or future legality.
   - Avoid low-yield removals.
   - Avoid exposing underground guerrillas unless the exposure is worth it.
   - Avoid moving pieces out of origin spaces if doing so loses important Control or exposes a Base.

### Universal candidate-turn scoring sketch

A useful generic scoring model:

    score(candidate_turn) =
        own_victory_margin_delta
      + enemy_victory_margin_reduction
      + coup_readiness_delta
      + resource_and_logistics_delta
      + future_action_legality_delta
      + piece_efficiency_delta
      + board_safety_delta
      - ally_rival_risk
      - opportunity_cost
      - exposure_or_redeploy_risk

Where:

- `own_victory_margin_delta` is faction-specific.
- `enemy_victory_margin_reduction` should be heavily weighted if the enemy is close to winning.
- `ally_rival_risk` is crucial: US/ARVN and NVA/VC are friendly by rules, but not by victory condition.
- `future_action_legality_delta` captures things like:
  - placing Police and Troops for Pacification;
  - creating non-Support spaces for Rally;
  - preserving Underground guerrillas for Terror/Tax/Subvert;
  - creating NVA numerical superiority for Infiltrate;
  - creating COIN Control for Govern/Pacification.
- `exposure_or_redeploy_risk` captures:
  - active guerrillas becoming Assault/Air Strike targets;
  - ARVN Troops being forced to redeploy from Provinces without COIN Bases;
  - US Troops left in Laos/Cambodia;
  - large COIN stacks becoming Bombard targets;
  - bases being left without sufficient protection.

### Monsoon awareness

When the next card is a Coup card, the current Event card is Monsoon.

A competent policy must know that Monsoon changes the action landscape:

- Sweep is unavailable.
- March is unavailable.
- US Air Lift and Air Strike are restricted to fewer spaces.
- Pivotal Events are unavailable.
- Any plan requiring Sweep or March must have been executed earlier.

This changes faction personalities:

- US and ARVN shift from Sweep setup toward Assault, Patrol, Train, Govern, Advise, Air Strike, Raid, Transport, or Events.
- NVA shifts from March expansion toward Rally, Infiltrate, Bombard, Attack, Terror, or Events.
- VC shifts from March spread toward Rally, Terror, Tax, Subvert, Ambush, Attack, or Events.

### Coup awareness

The agent should treat Coup timing as a separate strategic horizon.

Before a Coup:

- US wants Support already high and US Troops/Bases Available enough to score.
- ARVN wants COIN-Controlled Population and Patronage already high.
- NVA wants NVA-Controlled Population and NVA Bases already high.
- VC wants Opposition and VC Bases already high.
- COIN wants LoCs protected from Sabotage and Pacification spaces prepared.
- VC wants non-COIN-Controlled spaces with VC pieces and Resources for Agitation.
- NVA wants Trail/Earnings protected and Laos/Cambodia not COIN-Controlled.
- ARVN must remember that many Troops in Provinces without COIN Bases will redeploy away during the Coup.

After a Coup:

- all Terror/Sabotage markers are reset;
- guerrillas and special forces return Underground;
- ARVN Troops and Police redeploy under Coup rules;
- NVA Troops may redeploy to NVA Bases;
- US Commitment can move Troops/Bases between Available and map.

A policy that ignores Coup timing will look tactically plausible but strategically stupid.

---

# 1. US personality

## Strategic identity

The US is an expeditionary stabilizer, not a conquering army.

It has overwhelming tactical power, but its victory condition punishes overcommitment. The US wants South Vietnamese popular Support while also keeping US Troops and Bases Available. Therefore, the US personality is:

> Build Support, preserve Aid, use force surgically, and withdraw or avoid committing more than necessary.

A competent US agent should not chase every insurgent piece. It should ask:

- Does this action increase Total Support?
- Does it preserve or increase Available US pieces?
- Does it prevent VC Opposition growth?
- Does it prevent NVA Control of populated spaces?
- Does it protect Pacification opportunities?
- Does it keep ARVN functional without handing ARVN the win?
- Does it avoid creating extra Opposition through careless Air Strikes?

## Victory logic

US victory score:

    Total Support + Available US Troops/Bases

Competent US play is about balancing two opposed needs:

- US Troops on the map are needed to fight, secure COIN Control, and enable Pacification.
- US Troops in Available count toward victory.

So the US should prefer:

- high-impact temporary deployments;
- concentrated decisive operations;
- Pacification setup;
- Irregulars and ARVN pieces where they can substitute for US presence;
- withdrawing once Support is secure.

The US should avoid:

- permanent large troop commitments without Support gain;
- overbuilding US Bases;
- bombing populated spaces casually;
- letting ARVN Govern away hard-won Support;
- letting VC keep high-pop Opposition zones;
- letting NVA seize high-pop Control.

## Core US priority stack

1. **Win or block a win**
   - If Support + Available US can be pushed over threshold, do so.
   - If VC is near victory, reduce Opposition or remove VC Bases.
   - If NVA is near victory, remove NVA Control or NVA Bases.
   - If ARVN is near victory, reduce ARVN ability to convert Support into Patronage or shift attention away from ARVN’s scoring spaces.

2. **Create and defend Support**
   - Pacify high-pop COIN-Controlled spaces.
   - Remove Terror markers from valuable spaces.
   - Maintain Troop/Police conditions for Coup Pacification.
   - Prevent VC Terror and Agitation in high-pop spaces.

3. **Preserve US availability**
   - Avoid committing more US pieces than needed.
   - Withdraw when Control/Support can be maintained by ARVN/Police/Irregulars.
   - Avoid unnecessary US casualties.

4. **Kill high-value insurgent infrastructure**
   - VC Bases, especially in high-pop or hard-to-clear areas.
   - NVA Bases that drive NVA victory and logistics.
   - NVA Troops creating Control.
   - Active guerrillas that are enabling Terror, Tax, Ambush, or Base defense.

5. **Protect Aid/Econ**
   - Aid lets ARVN resources remain high.
   - ARVN resources fund Pacification and COIN operations.
   - LoC sabotage indirectly restricts the US by strangling the ARVN resource system.

## US action policy

| Action | Use when | Preferred targets | Avoid / caution |
|---|---|---|---|
| **Train** | Use when Pacification is possible or can be made possible; when Irregulars are available; when ARVN cubes at US Bases are needed; when Saigon Patronage-to-Resources transfer is strategically useful. | COIN-Controlled high-pop spaces with a US piece; spaces with Terror markers; Passive/Neutral high-pop spaces; US Bases where ARVN Police/Troops are needed; Saigon if ARVN Patronage must be reduced or ARVN Resources replenished. | Do not waste Training in low-pop spaces unless it creates a key legality condition. Do not spend scarce ARVN Resources on marginal Support shifts. |
| **Patrol** | Use when LoCs are threatened, Econ is vulnerable, US Troops need city/LoC redistribution, or a free LoC Assault is useful. | Highest-Econ LoCs; LoCs connecting Saigon to Cities; LoCs with guerrillas; Cities needing COIN Control; routes that enable future movement. | Patrol is free but can still misposition Troops. Do not abandon high-pop Control or Support spaces carelessly. |
| **Sweep** | Use when Underground guerrillas in valuable spaces must be exposed; when Troops need to move into a Province/City; when setting up Assault or Air Strike. | High-pop Support/Opposition spaces; spaces with insurgent Bases shielded by Underground guerrillas; spaces where adding Troops changes Control; spaces threatening Pacification. | Not available in Monsoon. Jungle spaces require more pieces to locate guerrillas efficiently. Sweep without follow-up can merely expose enemies temporarily. |
| **Assault** | Use when enemy pieces are already removable and removal changes Control, removes Bases, prevents enemy victory, or clears high-pop spaces. | NVA-Controlled populated spaces; insurgent Bases; Active guerrillas protecting Bases; NVA Troop concentrations; spaces where US Base doubles Assault efficiency. | Do not use Assault merely for body count. Consider whether Air Lift can make the same Troops strike a better target. |
| **Advise** | Use with Train or Patrol to add Aid and/or use indigenous forces for Sweep/Assault/special-force removal. | Spaces with ARVN forces or Irregulars/Rangers that can remove high-value pieces; spaces where +Aid matters; spaces not selected for Training. | Do not ignore Advise. It is one of the best ways for the US to fight while strengthening the ARVN resource base. |
| **Air Lift** | Use to mass Troops for Assault, reposition for Control, rescue threatened bases, set up Training/Pacification legality, or withdraw from bad positions. | From overconcentrated or low-value spaces into high-value Assault/Control/Pacification targets. | In Monsoon, scope is restricted. Do not Air Lift away pieces that are maintaining key COIN Control unless replacement control remains. |
| **Air Strike** | Use when the removal value outweighs Support/Opposition damage, or when degrading the Trail is critical. | Zero-pop spaces; Laos/Cambodia; Active Opposition spaces; spaces with Active enemies and Bases; NVA Troops/Bases threatening victory; LoCs with no Support penalty. | Air Strike in populated spaces shifts toward Opposition. This directly fights the US victory condition and helps VC unless the target is worth it. Cannot remove Underground guerrillas or Tunneled Bases. |

## US preferred combinations

### Train + Advise

Default US state-building turn.

Use when:

- Pacification is possible;
- Aid needs replenishment;
- Irregulars can be placed or flipped into usefulness;
- ARVN cubes are needed at US Bases;
- an indigenous Assault/Sweep can remove meaningful pieces.

Target logic:

1. Train/Pacify the highest-pop legal space where Support can improve.
2. Advise elsewhere to remove a Base, remove NVA Control, remove Underground guerrillas with Special Forces, or add Aid.
3. Prefer spaces where the result protects future Pacification.

### Patrol + Advise

Economy and security turn.

Use when:

- LoCs are at risk;
- guerrillas on LoCs threaten Sabotage or adjacent Ambush;
- US needs to move Troops among Cities/LoCs;
- Advise can add Aid or remove pieces.

Target logic:

1. Move enough cubes to high-Econ LoCs to prevent Sabotage.
2. Activate guerrillas on LoCs.
3. Use free Assault on the best LoC target.
4. Advise where indigenous pieces can produce a control/base/removal swing.

### Sweep + Air Strike

Use sparingly.

This is strong when Sweep exposes insurgents and Air Strike removes them, but it can damage Support. Prefer it when:

- spaces are zero-pop;
- spaces are already at Active Opposition;
- enemy Bases or NVA Control must be stopped;
- the Trail must be degraded;
- the Support damage is acceptable.

### Assault + Air Lift + Assault

Advanced strike pattern.

If US Troops begin in a space with removable enemies, the US can:

1. Assault in the first space.
2. Air Lift those Troops to another space.
3. Continue Assault resolution in the second space.

This should be encoded if the engine supports interrupting an Operation with a Special Activity.

Use when:

- both targets have high-value removable pieces;
- the same Troops can produce two control/base swings;
- the move does not abandon crucial Control.

### Air Lift + Train

Use Air Lift before Training when a US piece must be present in a target space to make Training/Pacification useful.

Use when:

- a high-pop COIN-Controlled space lacks a US piece;
- Pacification there is urgent;
- moving one US piece unlocks a large Support swing.

## US target scoring features

Suggested features:

    us_pacify_value =
        population * support_levels_gained
      + terror_marker_removed_value
      + vc_opposition_denial
      + coup_pacification_setup_bonus
      - arvn_resource_cost
      - risk_of_arvn_govern_followup

    us_available_value =
        available_us_pieces_after_commitment
      - required_map_presence_to_hold_support
      - emergency_commitment_need

    us_assault_value =
        nva_control_removed_population
      + coin_control_added_population
      + insurgent_base_removed_value
      + nva_troops_removed_value
      + vc_base_removed_value
      + aid_gain_from_base_removal
      - opportunity_cost_of_committed_troops

    us_airstrike_value =
        active_enemy_pieces_removed
      + base_removed_value
      + trail_degrade_value
      + nva_victory_denial
      + vc_victory_denial
      - support_loss_penalty
      - vc_opposition_help_penalty

    us_patrol_value =
        econ_value_protected
      + sabotage_prevention
      + city_control_added
      + loc_guerrillas_activated_or_removed
      + future_mobility_enabled

## US errors to avoid

- Treating military removal as inherently good.
- Air Striking populated Support spaces without a major reason.
- Overcommitting US Troops and tanking Available US score.
- Building too many US Bases, especially in passive city positions that do not justify the commitment.
- Ignoring VC because NVA looks more militarily dramatic.
- Ignoring NVA Control because VC looks more politically dangerous.
- Letting ARVN harvest Patronage from US-created Support without checking ARVN’s score.
- Spending ARVN Resources below what the next Pacification campaign needs.
- Waiting until Monsoon to Sweep.

## US final personality statement

The US should behave like this:

    The US is a reluctant occupying force.
    It wants Support, not territory for its own sake.
    It wants ARVN to be strong enough to hold the country, but not so corrupt that ARVN wins first.
    It uses US Troops as a temporary hammer, not as permanent garrison.
    It uses Irregulars, ARVN pieces, Advise, and Air Lift to multiply force.
    It treats Air Strike as a powerful but politically poisonous tool.
    It fights VC to protect Support and fights NVA to prevent Control collapse.
    It tries to win by pacifying, stabilizing, and withdrawing.

---

# 2. ARVN personality

## Strategic identity

ARVN is a self-interested regime-security faction.

It is not merely the US helper. It wants:

- COIN-Controlled Population;
- Patronage;
- enough Aid/Resources to keep operating;
- enough Support to harvest Patronage from;
- enough military presence to prevent NVA/VC from collapsing the state.

The ARVN personality is:

> Hold the cities, control enough provinces, extract Patronage, preserve Aid/Econ, and fight only as much as needed to keep the regime alive.

ARVN is allowed to be selfish. In fact, competent ARVN must be selfish. If ARVN spends the whole game helping the US remove insurgents and build Support, it often just hands the US the win.

## Victory logic

ARVN victory score:

    COIN-Controlled Population + Patronage

ARVN therefore cares about:

- COIN Control of high-pop Cities and Provinces;
- Patronage extraction via Govern;
- preserving enough Support to keep Govern legal and useful;
- not allowing NVA Control to spread across population;
- not allowing VC to wreck Support, Patronage, or ARVN cubes.

ARVN does not directly score Support. Support matters because:

- it enables Govern;
- it helps the US, sometimes too much;
- it can be converted into Patronage;
- it prevents insurgent Rally in that space.

## Core ARVN priority stack

1. **Win or block a win**
   - If Govern or Control can push ARVN above threshold, do it.
   - If US is about to win, consider Govern that reduces Support while gaining Patronage.
   - If NVA is about to win, remove NVA Control or NVA Bases.
   - If VC is about to win, remove VC Bases, add COIN Control, or reduce Opposition.

2. **Harvest Patronage**
   - Govern is the signature ARVN Special Activity.
   - Patronage is not a side objective; it is half the ARVN win engine.
   - Prefer high-pop Govern spaces.
   - Prefer Active Support to Passive Support Govern conversions, because the space remains Supported.

3. **Hold high-pop COIN Control**
   - Cities first.
   - Then high-pop Provinces.
   - Then strategically necessary low-pop/zero-pop spaces.

4. **Maintain Aid/Econ**
   - Aid becomes ARVN Resources at Coup.
   - LoCs add Econ Resources.
   - If ARVN allows LoCs to be wrecked, it loses operational tempo.

5. **Use violence selectively**
   - Remove Bases.
   - Remove NVA Control.
   - Remove threats to high-pop spaces.
   - Remove VC pieces that threaten Support, Patronage, or ARVN cubes.

## ARVN action policy

| Action | Use when | Preferred targets | Avoid / caution |
|---|---|---|---|
| **Train** | Use when ARVN has available pieces, needs Troop/Police pairs, wants Rangers, wants a Province Base, wants Pacification, or wants a carrier Operation for Govern. | Cities; COIN Bases; spaces where adding cubes creates COIN Control; spaces missing Troop+Police pairs; Provinces where an ARVN Base will let Troops remain useful through Coup Redeploy. | Do not train pieces that do not change Control, Pacification eligibility, or future mobility. |
| **Patrol** | Use when LoCs/Econ are threatened, when cube redistribution among Cities/LoCs matters, or when ARVN wants Govern but Train has low value. | High-Econ LoCs; LoCs with guerrillas; Cities needing Control; movement routes from Saigon to Cities; LoCs where the free Assault removes pieces. | Do not strip important Provinces/Cities of Control just to clear LoCs. |
| **Sweep** | Use when valuable spaces contain Underground guerrillas and Assault/Raid cannot yet solve the problem. | High-pop spaces; Supported spaces; spaces with Bases shielded by Underground guerrillas; spaces where moving Troops adds COIN Control. | Not available in Monsoon. Sweep is preparation, not a complete solution. |
| **Assault** | Use when enemies are Active or NVA Troops are present and removal changes the board materially. | Spaces where removal adds COIN Control, removes NVA Control, removes Bases, removes NVA Troops, or clears a high-pop space. | ARVN Assault is weaker than US Assault, especially in Highlands. Avoid vanity Assaults. |
| **Govern** | Use whenever legal and profitable unless military collapse is imminent. This is ARVN’s signature move. | COIN-Controlled Supported spaces, not Saigon, not selected for Training. Highest-pop spaces. Spaces where ARVN cubes exceed US cubes for Patronage mode. | Passive Support to Neutral opens Rally opportunities and hurts US. Still correct if ARVN needs Patronage or US is too close to winning. |
| **Transport** | Use to project Troops/Rangers, reinforce Provinces, set up Sweep/Assault/Raid, move newly Trained pieces, or flip Rangers Underground. | From overstacked safe spaces to high-pop uncontrolled/threatened Provinces, attack staging spaces, Ranger staging spaces, and places where control can swing. | Do not empty origin spaces if that loses COIN Control or exposes a Base. Path stops at enemy pieces. |
| **Raid** | Use when Rangers can surgically remove high-value pieces, especially Underground guerrillas or pieces blocking Control. | UnTunneled Bases; Underground guerrillas; spaces where one Ranger removal changes Control; Supported spaces threatened by VC; NVA Control spaces. | Do not spend Ranger exposure on low-value removals. Tunneled Bases cannot be removed by Raid. |

## ARVN preferred combinations

### Train + Govern

Default ARVN state-building turn.

Use when:

- pieces are available;
- good Govern targets exist;
- ARVN needs Patronage;
- ARVN needs Troop/Police pairs;
- ARVN can Pacify or build toward Coup Pacification.

Target logic:

1. Train where pieces add Control, pair Troops/Police, or create a future ARVN Base.
2. Govern elsewhere, because Govern cannot occur in the same space selected for Training.
3. Prefer high-pop Active Support spaces for Patronage.
4. Use Aid mode if Aid is low or a Coup is approaching.

### Patrol + Govern

Default ARVN economy/governance turn.

Use when:

- LoCs need protection;
- Train has low value;
- ARVN wants Govern;
- pieces need redistribution among Cities/LoCs.

Target logic:

1. Patrol to protect Econ and move cubes.
2. Use the free Assault if a LoC has a valuable target.
3. Govern high-pop Supported COIN-Controlled spaces.

### Sweep + Raid

Use when:

- Underground guerrillas are the immediate problem;
- Rangers can remove pieces that Assault cannot;
- a Base or control-swing space is protected by Underground guerrillas.

Target logic:

1. Sweep to expose enough guerrillas.
2. Raid with Rangers to remove the highest-value hidden pieces.
3. Prioritize Bases, control swings, and high-pop Support spaces.

### Assault + Raid

Use when:

- enemies are already removable;
- Rangers can remove Underground blockers or key pieces before/after Assault;
- a Base can be exposed and removed.

Target logic:

1. Raid where Ranger removal unlocks Control/Base removal.
2. Assault spaces where removal adds COIN Control or removes NVA Control.
3. Prefer Bases and NVA Troops over random guerrilla removal.

### Train + Transport

Use when:

- newly placed pieces must immediately respond to a Province threat;
- a City/Base Training location is not the actual battlefield;
- ARVN needs to project force without waiting a card.

Target logic:

1. Train at a City/Base.
2. Transport pieces to contested Provinces or staging positions.
3. Avoid losing Control at the origin.

### Assault + Transport + Assault

Advanced ARVN strike pattern.

If the implementation supports interrupting an Operation with a Special Activity:

1. Assault in one space.
2. Transport the same Troops/Rangers.
3. Continue Assault in another selected space.

Use only if both Assaults create meaningful value.

## ARVN target scoring features

Suggested features:

    arvn_govern_patronage_value =
        population
      + active_support_to_passive_support_bonus
      + arvn_over_us_cube_bonus
      + arvn_near_victory_bonus
      - passive_support_to_neutral_rally_risk
      - us_ally_score_help_penalty_if_us_close

    arvn_govern_aid_value =
        3 * population
      + aid_low_bonus
      + next_coup_bonus
      + arvn_resource_starvation_bonus

    arvn_control_value =
        coin_control_added_population
      + nva_control_removed_population
      + city_bonus
      + high_pop_province_bonus
      + coup_redeploy_stability_bonus_if_base_or_police_present

    arvn_train_value =
        control_created
      + troop_police_pair_created
      + pacification_enabled
      + rangers_added
      + province_base_created
      - resource_cost
      - overstack_or_bombard_risk

    arvn_assault_value =
        base_removed_or_tunnel_roll
      + nva_troops_removed
      + nva_control_removed
      + coin_control_added
      + high_pop_space_cleared
      - low_yield_highland_penalty

    arvn_transport_value =
        destination_control_gain
      + threatened_space_reinforced
      + assault_or_sweep_enabled
      + ranger_underground_reset
      - origin_control_loss
      - path_blocked_by_enemy

## ARVN errors to avoid

- Acting like a US subordinate.
- Ignoring Patronage until too late.
- Governing away Passive Support to Neutral everywhere and thereby enabling insurgent Rally.
- Failing to protect Aid/Econ.
- Overcommitting Troops to Provinces without COIN Bases right before Coup Redeploy.
- Fighting NVA in bad terrain for low yield.
- Letting VC Subvert ARVN cubes and Patronage unchecked.
- Leaving cities under-defended.
- Training pieces that do not affect Control, Pacification, or Patronage.

## ARVN final personality statement

The ARVN should behave like this:

    ARVN is a regime-preservation machine.
    It wants COIN Control and Patronage more than ideological victory.
    It cooperates with the US only when that cooperation advances ARVN’s own margin.
    It treats Govern as a primary scoring engine.
    It protects Aid and Econ because resources are the regime’s bloodstream.
    It holds cities, contests high-pop provinces, and builds provincial bases where Troops must remain after Coup.
    It uses Rangers and Transport for mobility and surgical force.
    It fights insurgents when they threaten Control, Patronage, Aid, or victory margins.
    It is corrupt, pragmatic, and territorial.

---

# 3. NVA personality

## Strategic identity

The NVA is a conventional military-logistics faction.

It is not mainly trying to create Opposition. That is the VC’s job. The NVA wants:

- NVA-Controlled Population;
- NVA Bases;
- a strong Trail;
- Laos/Cambodia logistics;
- enough Troops to seize and hold territory;
- the ability to exploit or steal VC infrastructure when useful.

The NVA personality is:

> Build the Trail, build bases, use Laos/Cambodia as a highway, mass force for Control, and treat VC as useful until VC becomes a rival.

NVA is the insurgent faction most comfortable with direct military confrontation. But it should still not attack for body count. It should fight to create NVA Control, defend Bases, damage US commitment, or stop COIN victory.

## Victory logic

NVA victory score:

    NVA-Controlled Population + NVA Bases

NVA Control requires NVA pieces to exceed all other pieces in the space, including VC. That means:

- VC pieces can block NVA Control.
- VC Bases may be useful insurgent infrastructure, but they are also rival score.
- Infiltrate is not optional flavor; it is a central NVA tool for converting VC assets and reducing VC political value.

NVA wants high-pop spaces, but it does not need those spaces to be at Opposition. Neutral high-pop NVA Control is good enough.

## Core NVA priority stack

1. **Win or block a win**
   - If March/Attack/Infiltrate/Rally can push NVA over threshold, choose it.
   - If US is close, reduce Support indirectly, kill US pieces, prevent Pacification, or force US commitment.
   - If ARVN is close, remove COIN Control or Patronage opportunity.
   - If VC is close, Infiltrate VC Bases/pieces or reduce Opposition toward Neutral.

2. **Create NVA Control in populated spaces**
   - High-pop spaces first.
   - Saigon is a massive prize if feasible.
   - 2-pop Provinces are highly valuable.
   - NVA Control that removes COIN Control is especially valuable.

3. **Build and protect Bases**
   - Bases are victory points, Rally nodes, Infiltrate nodes, and sometimes Resource engines.
   - Laos/Cambodia Bases are especially important for NVA income and logistics.
   - Highland/Jungle positions are harder for COIN to clear.

4. **Maintain the Trail**
   - Trail improves Rally, March, Infiltrate, and Earnings.
   - Trail 4 enables explosive movement through Laos/Cambodia.
   - COIN Control in Laos/Cambodia before Coup degrades the Trail, so those spaces must be protected or contested.

5. **Exploit VC, but do not be owned by VC**
   - VC helps distract COIN and reduce Support.
   - VC pieces can block NVA Control.
   - VC Bases can be stolen.
   - If VC is ahead, NVA should actively harm VC score.

## NVA action policy

| Action | Use when | Preferred targets | Avoid / caution |
|---|---|---|---|
| **Rally** | Use to place Bases/Guerrillas, build around NVA Bases, or improve the Trail. | Laos/Cambodia; Highland/Jungle Provinces; non-Support spaces; spaces where a Base adds score and future troop flow; spaces with existing NVA Bases. | Rally cannot target Support spaces. If Support blocks Rally, use Terror or military pressure to neutralize it first. |
| **March** | Use to create NVA Control, threaten high-pop areas, occupy LoCs, set up Infiltrate, or mass for Attack/Bombard. | High-pop spaces where NVA can outnumber all others; routes through Laos/Cambodia; LoCs that disrupt COIN mobility/Econ; spaces adjacent to COIN concentrations. | Not available in Monsoon. Avoid moving out of spaces if that loses valuable NVA Control or exposes a Base. |
| **Attack** | Use when removal changes Control, kills key COIN pieces, protects Bases, or damages US commitment. | COIN pieces maintaining Control; US Troops/Bases; ARVN Troop/Police pairs; pieces defending high-pop spaces; pieces threatening NVA Bases. | Guerrilla Attack exposes guerrillas and may fail. NVA Troop Attack is more reliable but requires mass. Do not attack for low-value attrition. |
| **Terror** | Use to reduce Support toward Neutral, place Terror markers, sabotage LoCs, or open spaces for future Rally. | Supported spaces that block Rally; high-pop US Support spaces; LoCs important to Econ/mobility; spaces where Terror prevents Pacification. | NVA Terror does not create Opposition. It is denial and preparation, not VC-style scoring. |
| **Infiltrate** | Use to build Troops from NVA Bases or convert VC pieces/Bases into NVA assets. | NVA Base spaces needing Troops; VC Base spaces where NVA can outnumber VC; tunneled VC Bases worth stealing; spaces where Troop placement creates Control. | Infiltrate can reduce Opposition, which may be good against VC but bad if VC pressure is needed against US. Evaluate ally/rival context. |
| **Bombard** | Use to punish concentrated COIN Troops or Bases near NVA mass. | COIN Base spaces; spaces with 3+ US/ARVN Troops; targets adjacent to 3+ NVA Troops; US Troops that would Assault next. | Bombard removes Troops only, not Police, Bases, or Special Forces. Do not overvalue it if Control does not change. |
| **Ambush** | Use for guaranteed surgical removal, especially with March or Attack. | US Troops; ARVN pieces maintaining Control; Police enabling Pacification; Special Forces; pieces adjacent to LoC guerrillas. | Bases are removed last. Ambush is strongest when one piece matters. |

## NVA preferred combinations

### Rally + Infiltrate

Default NVA build-up turn.

Use when:

- Trail is low or must be improved;
- NVA Bases can generate Troops;
- NVA needs to replace Guerrillas with Troops;
- a Base network must be strengthened.

Target logic:

1. Rally in non-Support spaces to add Guerrillas/Bases.
2. Improve Trail if strategically valuable.
3. Infiltrate at NVA Bases to place Troops.
4. Prefer positions that will threaten high-pop NVA Control next turn.

### March + Infiltrate

Signature NVA expansion/conversion turn.

Use when:

- NVA can move into a VC space and outnumber VC;
- a VC Base can be stolen;
- NVA can move into a high-pop space and then build/convert presence;
- a March creates NVA Control or sets it up.

Target logic:

1. March using Laos/Cambodia routes where possible.
2. Preserve existing NVA Control at origins.
3. Infiltrate VC Bases if the conversion meaningfully increases NVA score or reduces VC score.
4. Prefer high-pop spaces and Base spaces.

### March + Ambush

Use when:

- NVA can move and kill a key piece in one turn;
- Ambush from a LoC can hit an adjacent target;
- one removed piece changes Control;
- US/ARVN piece removal prevents a strong COIN response.

Target logic:

1. March Underground Guerrillas or Troops into position.
2. Ambush to remove the highest-leverage enemy piece.
3. Prefer pieces maintaining Control, Pacification eligibility, or Base defense.

### Attack + Ambush

Use when:

- a guaranteed one-piece removal is better than a risky normal Attack;
- removing one piece breaks COIN Control;
- removing a US piece creates casualties and Aid damage;
- a Base can be reached after other pieces are gone.

### Terror + future Rally

Use when Support blocks NVA growth.

Target logic:

1. Terror a Supported space toward Neutral.
2. Place a Terror marker to hinder COIN Pacification.
3. Next opportunity, Rally or March into the now more permissive area.

### LoC occupation before Coup

Use when:

- Sabotage will reduce ARVN Econ;
- occupying LoCs blocks COIN mobility;
- LoC Ambush adjacency threatens Cities/Provinces;
- COIN Patrol would be forced into low-efficiency response.

## NVA target scoring features

Suggested features:

    nva_control_value =
        population_if_nva_control_added
      + population_if_coin_control_removed
      + city_or_saigon_bonus
      + high_pop_province_bonus
      - pieces_needed_to_hold
      - us_airlift_assault_risk

    nva_base_value =
        1_victory_point
      + rally_node_value
      + infiltrate_node_value
      + resource_value_if_laos_cambodia
      + terrain_defense_bonus
      - vulnerability_to_assault_or_airstrike

    nva_trail_value =
        rally_multiplier_gain
      + march_discount_gain
      + infiltrate_troop_gain
      + resource_gain_at_coup
      - expected_us_airstrike_or_laos_cambodia_degrade_risk

    nva_infiltrate_vc_value =
        nva_base_or_piece_gain
      + vc_base_or_piece_denial
      + vc_score_reduction
      + nva_control_enabled
      - useful_vc_pressure_lost

    nva_bombard_value =
        us_troop_removed_value
      + arvn_troop_removed_value
      + assault_threat_reduction
      + casualty_or_aid_damage
      + control_swing_if_any
      - opportunity_cost

    nva_terror_value =
        support_denial
      + rally_space_opened
      + pacification_hindered
      + loc_sabotage_value
      - no_direct_nva_score_gain

## NVA errors to avoid

- Helping VC win by leaving VC Bases and Opposition untouched.
- Forgetting that VC pieces can block NVA Control.
- Attacking for casualties when Control or Bases are the scoring path.
- Letting the Trail decay.
- Letting COIN Control Laos/Cambodia before Coup.
- Marching out of spaces and losing existing NVA Control.
- Overstacking Troops where Air Lift + Assault or Air Strike can punish them.
- Ignoring LoCs as cheap movement/disruption spaces.
- Waiting until Monsoon to execute a necessary March.

## NVA final personality statement

The NVA should behave like this:

    The NVA is a logistics-driven conventional insurgent army.
    It wins by controlling population and maintaining bases.
    It builds the Trail, uses Laos/Cambodia as a highway, and masses force where Control can swing.
    It fights COIN when fighting changes Control, protects Bases, or damages US commitment.
    It uses Infiltrate to transform logistics into Troops and to steal VC infrastructure.
    It treats VC as a temporary partner and potential rival.
    It does not care about Opposition except as something to deny the VC or as a Rally-enabling political condition.
    It threatens invasion even when the threat itself forces COIN mistakes.

---

# 4. VC personality

## Strategic identity

The VC is a clandestine political-insurgent network.

It does not need to win conventional battles. It wins by:

- spreading Opposition;
- building and protecting VC Bases;
- staying Underground;
- using Terror, Agitation, Tax, Subvert, and Ambush;
- forcing COIN to spend multiple actions to find and remove small numbers of pieces.

The VC personality is:

> Stay hidden, spread political control, build Bases, tax carefully, subvert ARVN, and make COIN waste time reacting everywhere.

VC should avoid playing like NVA. It should not mass openly unless the payoff is decisive. It should make COIN perform the two-step process of Sweep then Assault, while the VC uses one small cell to create large political swings.

## Victory logic

VC victory score:

    Total Opposition + VC Bases

VC therefore cares about:

- shifting high-pop spaces toward Opposition;
- keeping VC Bases alive;
- having VC pieces in spaces without COIN Control for Agitation;
- preventing US Pacification;
- preventing ARVN Govern/Pacification from stabilizing Supported areas;
- preventing NVA from stealing VC Bases via Infiltrate.

VC does not need Control. In fact, VC often prefers uncontrolled spaces with hidden guerrillas.

## Core VC priority stack

1. **Win or block a win**
   - If Terror/Agitation/Bases can push VC over threshold, do it.
   - If US is close, reduce Support and/or make Pacification harder.
   - If ARVN is close, Subvert ARVN cubes, reduce Patronage, or break COIN Control.
   - If NVA is close, interfere with NVA Control or protect/avoid VC Bases being stolen.
   - If NVA threatens to steal VC Bases, defend them or move the scoring plan elsewhere.

2. **Create Opposition**
   - Terror high-pop spaces.
   - Prepare Agitation spaces before Coup.
   - Keep COIN Control out of VC political spaces.
   - Use Terror markers to slow Pacification.

3. **Build and protect VC Bases**
   - Bases are score and income.
   - Bases make Rally stronger.
   - Tunnels and Underground guerrillas make Bases hard to remove.
   - Bases in Highlands/Jungles are harder for COIN to clear.

4. **Stay Underground**
   - Underground guerrillas are the VC’s main defense.
   - Activated guerrillas are vulnerable to Assault and Air Strike.
   - Exposure is acceptable only when the resulting Terror/Tax/Subvert/Ambush is worth it.

5. **Subvert ARVN**
   - ARVN cubes are the local state.
   - Removing/replacing them can break COIN Control, ruin Pacification, and reduce Patronage.
   - Subversion often hurts ARVN more efficiently than direct Attack.

6. **Use Tax intelligently**
   - Tax on LoCs is excellent because it does not shift population toward Support.
   - Tax in Provinces/Cities can create Support, so pair it with Terror/Agitation or use it only when Resources are worth the political cost.

## VC action policy

| Action | Use when | Preferred targets | Avoid / caution |
|---|---|---|---|
| **Rally** | Use to place Guerrillas, build Bases, or flip Guerrillas Underground. | Non-Support spaces; VC Base spaces; high-pop non-Support spaces; Highland/Jungle Base sites; spaces where a single hidden Guerrilla creates future Terror/Subvert/Tax. | Rally cannot target Support spaces. Use Terror or other pressure to neutralize Support first. |
| **March** | Use to spread cells, infiltrate high-pop targets, reach LoCs, set up Terror/Tax/Subvert/Ambush, or avoid COIN concentration. | Neutral/Opposition spaces; LoCs; weakly defended high-pop spaces; spaces where small groups remain Underground. | Not available in Monsoon. Marching into Support or crowded spaces may Activate guerrillas. Avoid exposure unless the payoff is immediate. |
| **Attack** | Use rarely, usually when Ambush makes it reliable or when one removal creates a decisive swing. | Isolated US Troops; ARVN Police/Troops maintaining Control; Special Forces threatening Bases; pieces enabling Pacification. | Normal Attack activates all attacking guerrillas and can fail. Do not expose a cell network for a low-value kill. |
| **Terror** | Use as the primary political scoring Operation. | High-pop spaces without Terror markers; Support/Neutral spaces; spaces COIN cannot quickly Control/Pacify; LoCs for Sabotage; spaces before Coup where Opposition swing matters. | Requires Underground guerrillas. Repeated Terror in a space already marked will not keep adding markers/shifts under normal rules. |
| **Tax** | Use when Resources are needed, especially from LoCs or high-yield spaces. | LoCs with Underground VC; Sabotaged LoCs; non-COIN-Controlled high-pop spaces if the support shift can be offset. | Tax in Provinces/Cities shifts toward Support. Use LoCs or pair with Terror/Agitation. |
| **Subvert** | Use to remove/replace ARVN cubes and reduce Patronage. | ARVN Troop/Police pairs; spaces where removing one or two ARVN cubes breaks COIN Control; high-pop spaces; spaces prepared for Govern/Pacification; ARVN Bases’ local defenses. | Requires Underground VC and ARVN cubes. Does not directly remove US pieces. |
| **Ambush** | Use for surgical guaranteed removal with minimal exposure. | US Troops; ARVN Police/Troops maintaining Control; Special Forces; pieces adjacent to LoC guerrillas; pieces enabling Sweep/Assault/Pacification. | Bases are removed last. Ambush is best when one piece matters. |

## VC preferred combinations

### Rally + Subvert

Use when:

- ARVN cubes are suppressing VC expansion;
- Subvert can break COIN Control;
- Rally can then reinforce the political network;
- a replacement VC Guerrilla creates a new cell.

Target logic:

1. Subvert ARVN pieces in high-value spaces.
2. Rally where Support is absent.
3. Prefer spaces where removing ARVN cubes opens future Agitation or Terror.

### March + Subvert

Use when:

- VC can move Underground guerrillas into ARVN-held spaces without activating;
- ARVN cubes are vulnerable;
- removing/replacing ARVN cubes breaks Control or reduces Patronage.

Target logic:

1. March small enough groups to stay Underground.
2. Subvert Troop/Police pairs or Control-critical cubes.
3. Prefer high-pop spaces and ARVN scoring spaces.

### Terror + Subvert

Use when:

- a space can both shift politically and lose ARVN security forces;
- ARVN is close to winning;
- COIN Control must be broken before Coup;
- Support must be damaged and local regime presence reduced.

Target logic:

1. Terror high-pop spaces for Opposition and marker placement.
2. Subvert ARVN pieces that would Pacify, Govern, or hold Control.
3. Prefer spaces where both actions compound.

### Terror + Tax

Use when:

- VC needs Resources but does not want Tax’s Support shift to stand;
- enough Underground guerrillas exist to support both actions;
- the space is high-yield and politically important.

Target logic:

1. Prefer Tax on LoCs where no Support shift occurs.
2. If Taxing a Province/City, use Terror/Agitation to offset or exceed the Support shift.
3. Only do this in populated spaces if the net political result remains acceptable.

### March + Ambush from LoC

Use when:

- a LoC guerrilla can remove an adjacent piece;
- one removed COIN piece lets a later March remain Underground;
- removing a Police/Troop breaks Control;
- the adjacent target is high value.

Target logic:

1. Use LoCs as attack adjacency platforms.
2. Ambush the piece that most affects Control/Pacification.
3. Then March or Terror based on the new security posture.

### Rally to flip Underground + next Terror

Use when:

- VC has many Active guerrillas that would otherwise be removed;
- a Base space can flip guerrillas Underground;
- the next turn can exploit those Underground guerrillas for Terror, Tax, Subvert, or Ambush.

This is a defensive reset and future-threat creation move.

## VC target scoring features

Suggested features:

    vc_terror_value =
        population * opposition_levels_gained
      + support_removed_value
      + terror_marker_pacification_delay
      + coup_agitation_setup
      + us_score_denial
      - guerrilla_activation_risk
      - coin_reaction_risk

    vc_base_value =
        1_victory_point
      + resource_income
      + rally_capacity
      + tunnel_or_terrain_defense_bonus
      + political_network_anchor_value
      - nva_infiltration_risk
      - coin_assault_or_raid_risk

    vc_rally_value =
        new_guerrilla_future_action_value
      + base_created_value
      + underground_reset_value
      + high_pop_target_preparation
      - support_legality_block

    vc_tax_value =
        resources_gained
      + future_agitation_enabled
      - support_shift_penalty_if_population_space
      - activated_guerrilla_exposure
      + loc_tax_bonus

    vc_subvert_value =
        arvn_cubes_removed_or_replaced
      + patronage_reduction
      + coin_control_removed_population
      + pacification_pair_broken
      + govern_target_disrupted
      + replacement_guerrilla_value

    vc_ambush_value =
        key_piece_removed
      + control_swing
      + pacification_denial
      + us_casualty_or_aid_damage
      + special_force_threat_removed
      - exposure_cost

## VC errors to avoid

- Fighting like NVA.
- Attacking too often with guerrillas and exposing them.
- Taxing high-pop spaces without undoing the Support shift.
- Leaving VC Bases vulnerable to NVA Infiltrate.
- Letting COIN Control block Agitation in key Opposition spaces.
- Allowing US Pacification to erase hard-won Opposition.
- Letting ARVN Govern freely from Supported high-pop spaces.
- Building Bases where they are easy for US/ARVN to Assault.
- Overconcentrating active guerrillas in spaces with COIN pieces.

## VC final personality statement

The VC should behave like this:

    The VC is a hidden political network.
    It wins with Opposition and Bases, not conventional Control.
    It spreads small underground cells into politically valuable spaces.
    It uses Terror and Agitation to change the population.
    It uses Subvert to hollow out ARVN and reduce Patronage.
    It uses Tax to fund operations, preferably on LoCs.
    It uses Ambush surgically and Attack reluctantly.
    It protects Bases with terrain, tunnels, and Underground guerrillas.
    It cooperates with NVA only while NVA pressure helps VC; it fears NVA Infiltrate when VC Bases become tempting.
    It makes COIN spend two actions to solve problems that VC created with one guerrilla.

---

# 5. Faction relationship model

A competent policy system must not encode permanent ally utility.

## US vs ARVN

US and ARVN are friendly by rules but strategically misaligned.

US wants:

    Total Support + Available US

ARVN wants:

    COIN-Controlled Population + Patronage

Therefore:

- US Pacification helps US and creates Govern targets for ARVN.
- ARVN Govern can reduce Support and hurt US while increasing Patronage.
- US may want ARVN strong but not victorious.
- ARVN may want US help but not a US Support win.
- US may convert Patronage to ARVN Resources in Saigon when ARVN Patronage is too high or Resources are needed.

Suggested ally weighting:

    if ARVN near victory:
        US treats ARVN Patronage gain as enemy gain
    else:
        US treats ARVN control/resource gain as useful but secondary

    if US near victory:
        ARVN treats US Support gain as rival gain
    else:
        ARVN treats US military support as useful but secondary

## NVA vs VC

NVA and VC are friendly by rules but strategically misaligned.

NVA wants:

    NVA-Controlled Population + NVA Bases

VC wants:

    Opposition + VC Bases

Therefore:

- VC Opposition does not directly help NVA.
- VC pieces can block NVA Control.
- VC Bases can be stolen by NVA Infiltrate.
- NVA Infiltrate can reduce Opposition, hurting VC.
- VC wants NVA pressure against COIN but not NVA dominance in VC Base spaces.
- NVA wants VC to distract COIN but not win.

Suggested ally weighting:

    if VC near victory:
        NVA prioritizes Infiltrate against VC Bases/Opposition
    else:
        NVA tolerates VC pressure where it damages COIN

    if NVA near victory:
        VC may remove/block NVA Control or avoid strengthening NVA routes
    else:
        VC tolerates NVA pressure where it distracts COIN

## Primary conflict pairs

### US vs VC

This is the political war.

US tries to create Support.
VC tries to create Opposition.

US should prioritize:

- high-pop Opposition spaces;
- VC Bases;
- Terror marker cleanup;
- Pacification conditions;
- preventing Agitation.

VC should prioritize:

- high-pop Support spaces;
- Terror and Agitation;
- preventing COIN Control;
- preventing Pacification;
- making Air Strike politically costly.

### ARVN vs NVA

This is the territorial-control war.

ARVN wants COIN-Controlled Population.
NVA wants NVA-Controlled Population.

ARVN should prioritize:

- cities;
- high-pop provinces;
- removing NVA Control;
- preventing NVA Base/Troop buildup;
- using Transport/Raid to respond flexibly.

NVA should prioritize:

- high-pop control swings;
- massing enough pieces to outnumber all others;
- stealing or bypassing VC pieces that block NVA Control;
- attacking ARVN Troop/Police pairs;
- threatening Saigon and key cities.

### US vs NVA

This is the commitment/casualty/logistics war.

US should:

- prevent NVA Control of population;
- destroy NVA Bases;
- degrade Trail when worthwhile;
- avoid overcommitting US Troops.

NVA should:

- force US commitment;
- create US casualties;
- threaten high-pop Control;
- use Bombard/Ambush/Attack to make US presence expensive;
- preserve the Trail.

### ARVN vs VC

This is the regime-security war.

ARVN should:

- protect Patronage and Supported Govern targets;
- prevent Subvert;
- remove VC from high-pop spaces;
- maintain Police/Troop pairs.

VC should:

- Subvert ARVN cubes;
- reduce Patronage;
- break COIN Control;
- Terror spaces before ARVN/US can Pacify;
- force ARVN to spend resources on security instead of Govern.

---

# 6. DSL expressivity requirements implied by these personalities

A policy DSL that can express competent Fire in the Lake play needs more than simple if/then action triggers.

It needs the following expressive capabilities.

## 6.1 Candidate turn generation

The DSL must generate candidate turns that include:

- operation type;
- special activity type;
- whether the special occurs before, during, or after the operation;
- target spaces;
- target pieces;
- origin spaces for movement;
- legality constraints;
- expected resulting board state.

It must support action interruption/sequencing, such as:

- Assault + Air Lift + Assault;
- Assault + Transport + Assault;
- Rally, pause to Tax, then continue Rally;
- Air Lift before Training;
- March then Infiltrate;
- March then Ambush.

## 6.2 Marginal victory scoring

The DSL must evaluate marginal changes to each faction’s victory score:

- US: Support + Available US.
- ARVN: COIN-Controlled Population + Patronage.
- NVA: NVA-Controlled Population + NVA Bases.
- VC: Opposition + VC Bases.

It must also evaluate denial:

- reducing an enemy score can be as important as increasing own score;
- blocking a near-win should override normal faction habits.

## 6.3 Space-feature scoring

The DSL must score spaces using features such as:

- population;
- current Support/Opposition;
- COIN Control;
- NVA Control;
- Bases and Tunnel markers;
- LoC Econ value;
- terrain type;
- city/province/LoC;
- Laos/Cambodia/North Vietnam status;
- presence of Troop/Police pairs;
- presence of Underground vs Active guerrillas;
- presence of Special Forces;
- whether movement out of origin loses Control;
- whether pieces are vulnerable to Redeploy or Bombard;
- whether the space is legal for Rally/Govern/Pacification/Tax/Subvert/etc.

## 6.4 Temporal awareness

The DSL must represent:

- Coup imminent;
- Monsoon restrictions;
- post-Coup Redeploy effects;
- Support Phase Pacification/Agitation opportunities;
- Resource Phase income/sabotage;
- Trail reset/degrade;
- US Commitment;
- one-card-ahead planning;
- eligibility/pass tradeoffs.

Without temporal awareness, the agent will fail at:

- preparing Coup scoring;
- avoiding Monsoon dead plans;
- protecting Agitation/Pacification spaces;
- preserving ARVN Troops in Provinces;
- protecting Trail before Resources;
- deciding when to pass for future eligibility.

## 6.5 Rival-allied utility

The DSL must not hardcode friendly factions as positive utility.

It should support conditional ally weights:

    utility =
      own_gain
      + ally_gain * ally_weight
      - enemy_gain
      - rival_ally_gain_if_ally_near_win

Where ally weight changes by context.

Examples:

- US likes ARVN Control until ARVN is close to winning.
- ARVN likes US Support until US is close to winning.
- NVA likes VC disruption until VC is close to winning or blocks NVA Control.
- VC likes NVA pressure until NVA can win or steal VC Bases.

## 6.6 Risk modeling

The DSL must express risk penalties:

- exposing Underground guerrillas;
- leaving Bases undefended;
- overconcentrating COIN Troops near Bombard threats;
- Air Striking populated spaces;
- moving pieces out of Control-critical origins;
- placing ARVN Troops in Provinces without COIN Bases before Coup;
- letting NVA/VC occupy LoCs before Coup;
- letting COIN Control Laos/Cambodia before Coup;
- letting NVA outnumber VC in VC Base spaces;
- letting US/ARVN Special Forces threaten Bases.

## 6.7 Operation-specific legality and value

The DSL must be able to express action-specific target priorities.

Examples:

- Govern requires Supported COIN-Controlled spaces, not Saigon, not Train-selected, and Patronage mode requires more ARVN cubes than US cubes.
- Rally requires non-Support spaces.
- Tax requires Underground VC and no COIN Control, with LoCs being especially attractive.
- Subvert requires Underground VC and ARVN cubes.
- Sweep cannot happen in Monsoon.
- March cannot happen in Monsoon.
- Assault cannot remove Underground guerrillas.
- Bases are removed last.
- Tunneled Bases require special handling.
- Air Strike cannot remove Underground guerrillas or Tunneled Bases and causes political damage in populated spaces.
- Infiltrate can convert VC pieces/Bases if NVA outnumbers VC.

## 6.8 Personality-level policy defaults

A good DSL should allow each faction to have weighted defaults that are overridden by victory/block emergencies.

Suggested default personalities:

    US:
      prioritize Support, Pacification, Aid, Irregulars, controlled withdrawal,
      and surgical force. Penalize overcommitment and Air Strike political damage.

    ARVN:
      prioritize COIN Control, Patronage, Govern, Aid/Econ, cities,
      Transport/Raid flexibility, and self-interest over US goals.

    NVA:
      prioritize Trail, Bases, NVA Control, Laos/Cambodia logistics,
      Troop mass, Infiltrate, and high-pop military pressure.

    VC:
      prioritize Opposition, Bases, Underground status, Terror, Agitation setup,
      Subvert, Tax on LoCs, and making COIN waste actions.

---

# 7. Compact faction summaries

## US compact summary

The US is a high-power, low-patience expeditionary faction.

It should:

- build Support;
- preserve Available US pieces;
- use Train/Pacify and Advise heavily;
- protect Aid/Econ enough to keep the COIN machine running;
- deploy Irregulars;
- use Air Lift for decisive concentration and withdrawal;
- use Assault for high-value removals;
- use Air Strike only when the political cost is justified;
- fight VC politically and NVA militarily;
- avoid becoming ARVN’s unpaid bodyguard.

## ARVN compact summary

ARVN is a corrupt-but-functional state-security faction.

It should:

- hold cities;
- contest high-pop provinces;
- Govern for Patronage whenever profitable;
- protect Aid and LoCs;
- Train Troop/Police pairs;
- build Province Bases where Troops must remain after Coup;
- use Transport for mobility;
- use Rangers/Raid for surgical removal;
- fight only where Control, Patronage, Aid, or victory margins are at stake;
- avoid serving US victory more than its own.

## NVA compact summary

NVA is a logistics-backed conventional insurgent army.

It should:

- build the Trail;
- build and defend Bases;
- use Laos/Cambodia as a highway;
- mass Troops for NVA Control;
- seize high-pop spaces;
- use Infiltrate to build Troops and steal VC infrastructure;
- use Bombard/Ambush/Attack to make COIN presence costly;
- disrupt LoCs;
- treat VC as a rival whenever VC blocks Control or nears victory.

## VC compact summary

VC is a clandestine political insurgency.

It should:

- stay Underground;
- create Opposition;
- build and protect Bases;
- use Terror and Agitation as the main scoring engine;
- Tax carefully, especially on LoCs;
- Subvert ARVN cubes and Patronage;
- Ambush surgically;
- avoid conventional fights;
- protect Bases from both COIN removal and NVA Infiltrate;
- force COIN to spend too many actions on too many small threats.