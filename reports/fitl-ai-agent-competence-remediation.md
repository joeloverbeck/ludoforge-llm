# **Proposal: Replace `reports/fitl-competent-agent-ai.md` with a pure faction-competence requirements document**

> **Reassessment / decision (2026-05-21).** This proposal was reassessed against the codebase and `docs/FOUNDATIONS.md`, and partially adopted. Outcome:
> - **Adopted** — the core diagnosis (the report was implementation-contaminated) and the in-place decontamination of `reports/fitl-competent-agent-ai.md` (retitled to *Base-Game Faction Competence Requirements*; removed the `candidate_turn` object, the universal scoring model, all `*_value` formulas, the ally-weighting/`utility` pseudocode, and the "DSL must" §6; added a source-of-truth hierarchy and explicit non-requirements; folded in the Pacification-piece and Event-override rule caveats).
> - **Rejected** — creating a second `reports/fitl-ai-policy-implementation-implications.md`. It is redundant against the already-landed `archive/specs/186` + `187` and the DPSA report (`ai-agent-policy-overhaul-first-iteration.md`), and a drift risk (YAGNI). The superseded sketches were **deleted**, not relocated; the report now points to those artifacts for implementation.
> - **Rejected** — treating this as spec-worthy. Per FOUNDATIONS, specs govern engine/compiler/kernel/runtime code and GameSpecDoc; this work touched neither, so it was done as direct documentation edits (no spec, no tickets).
> - **Not done** — the optional `*-legacy-draft.md` archive; git history already preserves the prior version.
> - **Downstream** — Spec 188 and `archive/specs/IMPLEMENTATION-ORDER-2026-05-22.md` were relabeled ("authoritative source / faithful encoding" → "competence target / implementation attempt"); the landed 186/187 architecture and 188's plan were left intact. The §3 rule "corrections" here were mostly already-correct in the original report; only the two genuinely-missing caveats were added.

## **1. Executive verdict**

`reports/fitl-competent-agent-ai.md` is **not usable as-is** as an authoritative requirements source.

The report contains a strong strategic core, but it is contaminated by implementation material: candidate-turn object sketches, generic scoring formulas, faction target-scoring pseudo-formulas, “DSL must” language, implementation sequencing assumptions, and architecture-facing statements. The risk is not theoretical. Active planning docs already treat the report as the authoritative source for “personalities, combinations, target features, errors-to-avoid, and the relationship model,” and Spec 188 says it is a “faithful encoding” of the report into plan structures. That means speculative implementation-ish material has already crossed the line into planning authority.

The correct document strategy is:

1. **Replace `reports/fitl-competent-agent-ai.md` directly** with a pure base-game faction-competence requirements document.
2. **Move implementation-facing material** into a separate, explicitly non-normative document, probably `reports/fitl-ai-policy-implementation-implications.md`.
3. **Update active downstream specs** so they depend on the new pure requirements document for faction behavior, and on the implementation-implications document only for optional design guidance.
4. **Deprecate the old report content** as a draft, not as authority.

The replacement must define what competent US, ARVN, NVA, and VC play must understand and prioritize under the actual implemented rules. It must not prescribe a scoring formula, target selector, policy DSL, plan-template architecture, or fixed faction personality.

This recommendation aligns with `docs/FOUNDATIONS.md`: game logic remains rule/data authoritative, agents consume the same legal protocol as other clients, computation stays bounded and deterministic, and policy-preview evidence must not masquerade as omniscient certainty.

---

## **2. Evidence base**

### **Repository files inspected**

I inspected the required current files and relevant active downstream docs:

| Area | Files inspected | Use |
| ----- | ----- | ----- |
| Design constitution | `docs/FOUNDATIONS.md` | Non-negotiable architectural constraints: engine agnosticism, one rules protocol, bounded computation, rule-valid legality, observer discipline, determinism, preview integrity. |
| Current draft report | `reports/fitl-competent-agent-ai.md` | Audited for strategic value, rule correctness, implementation contamination, DSL assumptions, faction logic. |
| FITL rules | `rules/fire-in-the-lake/fire-in-the-lake-rules-section-1.md` through `section-8.md`, `fire-in-the-lake-factions-guide.md`, `fire-in-the-lake-rules-non-player-factions.md` | Used as implementation source of truth for victory, operations, special activities, Monsoon, Coup phases, Support/Agitation, Resource phase, Redeploy, Trail, LoCs, bases/tunnels, control, eligibility, events. |
| Archived downstream docs | `archive/specs/IMPLEMENTATION-ORDER-2026-05-22.md`, `archive/specs/188-fitl-four-faction-plan-migration-and-sequencing.md`, `reports/ai-agent-policy-overhaul-first-iteration.md` | Checked whether implementation assumptions from the report had leaked into planning. They had. |
| Archive | Not broadly inspected | Active docs mention archived Specs 186/187, but archive material was not used as authority. |

I treated the repo rules as source of truth. Where online strategy commentary or the existing report conflicted with the rules, the rules win.

### **Online sources consulted**

The online research base was useful but not huge. Direct BGG strategy retrieval was poor, so I weighted accessible, specific sources more heavily and treated broad player advice as suggestive, not authoritative.

| Source | Relevance |
| ----- | ----- |
| InsideGMT Fire in the Lake tag archive | Confirms available strategy articles and designer-variant articles, and separates base-game strategy from later Trưng/expansion material. |
| Robert Crowter-Jones / ElusiveMeeple strategy tips | Strong general player-strategy evidence: focus on own and opponent win conditions, stop near-wins even by allies, use eligibility pressure, respect Monsoon-protected positions, and distinguish faction geographies/roles. |
| InsideGMT “Perfect Openings: First Turn VC Strategy” | Good VC-specific evidence for Rally/Subvert, early VC presence, Subvert’s effect on ARVN control/Patronage, Tax timing, and the dangers of overcommitting VC resources. The comment correction is especially useful because it shows why rules must outrank player heuristics. |
| Volko Ruhnke / Mark Herman designer variants | Useful warning that base-game US mechanics, especially Air Lift/Air Strike/Commitment in the Short scenario, have known tournament/balance edge cases. These variants should **not** be imported into base-game requirements, but they expose traps and overpowered-looking tactics the AI must evaluate carefully. |

### **Weighting**

The weighting should be:

1. **FOUNDATIONS** for project architecture and what a requirements doc may or may not prescribe.
2. **Repo FITL rules** for legality, phases, effects, and base-game fidelity.
3. **Online strategy and designer commentary** for how competent players think, where tactics matter, and where faction incentives are subtle.
4. **Current report** only as a draft: useful prior work, not authoritative.

---

## **3. Current report diagnosis**

### **Strong parts worth preserving**

The current report is not junk. Its strategic center is mostly right:

| Current-report idea | Verdict |
| ----- | ----- |
| Victory-margin-first reasoning | Preserve. Victory checks happen at Coup rounds, and each faction’s victory formula is correctly central. |
| Block near-wins, including ally near-wins | Preserve. External strategy advice explicitly stresses stopping wins immediately, even by allies. |
| Monsoon/Coup timing as a first-class horizon | Preserve. Monsoon blocks Sweep and March, restricts US Air Lift/Air Strike, and disables Pivotal Events. |
| US as Support + Available balancing act | Preserve. That is the US victory condition. |
| ARVN as self-interested Control + Patronage faction | Preserve. That is the ARVN victory condition, and Govern is a real Patronage engine. |
| NVA as Trail/base/control logistics faction | Preserve. Trail affects NVA Rally, March, Infiltrate, and Earnings; NVA scores NVA Control + Bases. |
| VC as clandestine Opposition + Bases faction | Preserve. VC scores Opposition + VC Bases, and Terror/Agitation are central political tools. |
| Ally-rival model | Preserve, but rewrite as strategic requirement rather than utility formula. |
| Avoiding body-count play | Preserve. This is one of the most important competence requirements. |

### **Implementation-contaminated parts**

These sections should not remain in the pure requirements document:

| Current material | Problem | Treatment |
| ----- | ----- | ----- |
| Title: “AI Policy Requirements: Competent Faction Personalities” | Conflates faction competence with policy implementation and “personalities.” | Rename. Use “Base-Game Faction Competence Requirements.” |
| Scope phrase: “so that an AI-agent DSL can be evaluated” | Makes DSL evaluation part of the requirements source. | Delete from pure doc. |
| `candidate_turn = operation + optional_special_activity + ...` | Implementation representation choice. | Move to non-normative implications. |
| Universal scoring sketch | Scoring architecture disguised as requirements. | Delete from pure doc; optionally move as illustrative non-normative considerations. |
| Per-faction target scoring features | Pseudo-formulas can harden into policy weights/selectors. | Rewrite as prose strategic requirements; move sketches only with caveats. |
| “should be encoded if the engine supports…” | Direct implementation instruction. | Move to implications or rule-validation notes. |
| Suggested ally weighting snippets | Utility-model prescription. | Rewrite as prose ally-rival requirements. |
| Full DSL expressivity section | Valuable, but in the wrong document and too prescriptive. | Split into separate non-normative implementation-implications doc. |

The report’s DSL section is the biggest structural problem. It says a DSL “must” generate candidate turns, score marginal victory deltas, score space features, represent temporal awareness, model ally weights, and express risk penalties. Some of these are legitimate **capability implications**, but they are not faction-competence requirements.

### **Faction-logic issues and corrections**

The current report is broadly strategically sound, but several claims need tightening.

| Issue | Correction |
| ----- | ----- |
| US blocking via “killing US Troops/Bases” is too loose. | Killing US pieces only blocks US indirectly through casualties, Aid impact, OOP/Available dynamics, forced commitment, and loss of map posture. It does not simply subtract from Available unless the phase effects make that true. |
| “Troop/Police pairs for COIN Pacification” needs phase nuance. | Coup Support Phase Pacification requires COIN Control, Police, and the pacifying faction’s Troops. US Train Pacification during a campaign needs only a US piece and COIN Control, not Police; ARVN Train Pacification needs ARVN Troops and Police. |
| Bombard “casualty or Aid damage” is underconditioned. | Bombard sends US Troops to Casualties, which can later reduce Aid; ARVN Troop removal is not Aid damage by itself. |
| VC Tax “future Agitation enabled” is misleading. | Tax provides resources and LoC Tax is excellent, but Tax in populated spaces shifts toward Support and activates a guerrilla. It can harm VC political position unless paired with a follow-on plan. |
| Advanced “Assault + Air Lift + continued Assault” and “Assault + Transport + continued Assault” need rule-legality validation. | Special Activities may occur before/during/after Operations, but legality of selected Assault spaces when pieces arrive mid-operation should be tested against the app’s action construction. Do not make this a normative competence requirement yet. |
| Event handling is underdeveloped. | Events override normal rules where stated, and competent play must sometimes choose Event over Ops/Specials when the Event has direct victory, tempo, eligibility, resource, or denial value. |

---

## **4. Faction-by-faction strategy findings**

## **US**

### **Validated strategic identity**

The US is a high-force, low-patience expeditionary faction. It wins by increasing **Total Support + Available US Troops/Bases**, not by controlling territory for its own sake. It needs enough map presence to secure Support and prevent insurgent control, but too much map presence lowers the Available component of its victory condition.

### **Victory-condition implications**

Competent US play must:

* create and defend Support;
* preserve or recover Available US pieces through Commitment timing;
* prevent VC Opposition and VC Bases from running away;
* prevent NVA Control of populated spaces and NVA Bases from crossing threshold;
* avoid converting Support into Opposition through casual Air Strikes;
* use ARVN without letting ARVN win first.

### **Core competent priorities**

1. **Near-Coup Support and Available posture.** US should not discover at the Coup that it has neither Support nor Available pieces.
2. **Pacification setup.** US must distinguish US Train Pacification from Coup Support Phase Pacification.
3. **Selective military force.** Removal is valuable when it changes victory margins, control, base safety, Support/Opposition, Pacification legality, Trail, or enemy timing.
4. **Air power discipline.** Air Strike can remove active enemies and degrade Trail, but selected populated spaces shift toward Active Opposition.
5. **Commitment discipline.** Commitment is the main US mechanism for shifting US pieces between map and Available; late-game withdrawal is not optional flavor.

### **Major traps**

* Body-count fixation.
* Air Striking populated Support spaces without decisive payoff.
* Overcommitting Troops/Bases and destroying the Available score.
* Ignoring VC because NVA looks militarily dramatic.
* Ignoring NVA Control because VC looks politically dangerous.
* Spending ARVN Resources as if ARVN were a US wallet.
* Letting ARVN Govern away US-created Support while ARVN approaches victory.

Designer-variant commentary reinforces that US air and mobility powers have known edge cases in tournament/base-game play; the replacement doc should not import variants, but should require US agents to evaluate Air Lift, Air Strike, and Commitment as high-leverage tools with balance-sensitive consequences.

### **Current-report corrections**

Preserve the US section’s main identity, but remove formulas. Rewrite Air Strike, Commitment, and Advise as rule-grounded requirements, not scoring features.

---

## **ARVN**

### **Validated strategic identity**

ARVN is not “the US helper.” It is a regime-survival faction that wins through **COIN-Controlled Population + Patronage**. Govern is not flavor; it is a central scoring mechanism, but it consumes Aid and can reduce Support.

### **Victory-condition implications**

Competent ARVN play must:

* hold cities and high-pop provinces;
* preserve enough Aid/Econ/Resources to operate;
* Govern for Patronage when the timing and support consequences are acceptable;
* avoid being used as US support machinery;
* prevent NVA control expansion;
* prevent VC Subvert/Terror from hollowing out local security and Patronage.

### **Core competent priorities**

1. **COIN Control of population.** Cities and high-pop provinces are scoring infrastructure.
2. **Patronage extraction.** Active Support is often better Govern material than Passive Support because Govern on Active Support leaves the space Supported.
3. **LoC/Econ protection.** Sabotaged LoCs reduce ARVN resource flow and therefore reduce future tempo.
4. **Redeploy awareness.** ARVN Troops in LoCs and Provinces without COIN Bases must redeploy at Coup; pre-Coup Troop placement that evaporates is bad play.
5. **Ranger/Raid/Transport flexibility.** ARVN can be mobile and surgical, but movement that loses COIN Control is self-harm.

External strategy advice matches this: ARVN must keep moving, fight both insurgent factions, maintain COIN Control, and cannot rely on the US to deliver its victory condition.

### **Major traps**

* Acting as a US subordinate.
* Ignoring Patronage until too late.
* Governing Passive Support to Neutral everywhere and opening Rally space.
* Letting LoCs collapse.
* Placing Troops pre-Coup where Redeploy will undo the plan.
* Fighting low-yield battles in bad terrain.
* Letting VC Subvert Troop/Police pairs or Patronage-critical positions.

### **Current-report corrections**

The ARVN strategic section is one of the best parts of the report. Preserve the concept, delete the `arvn_*_value` pseudo-formulas, and rewrite the action table as conditional strategic requirements.

---

## **NVA**

### **Validated strategic identity**

The NVA is a logistics-backed conventional insurgent army. It wins through **NVA-Controlled Population + NVA Bases**. It does not need Opposition. VC pieces can actively block NVA Control because NVA Control requires NVA pieces to exceed all other pieces, including VC.

### **Victory-condition implications**

Competent NVA play must:

* build and protect NVA Bases;
* maintain the Trail;
* use Laos/Cambodia logistics without letting COIN degrade the Trail at Coup;
* mass force only where Control, base protection, or enemy denial follows;
* use Infiltrate to build Troops and, when useful, convert VC infrastructure;
* treat VC as a temporary ally and scoring rival.

The internal repo faction guide strongly supports this identity: NVA often builds via Rally/Infiltrate, seeks Trail 4 for Laos/Cambodia movement, eventually must March into South Vietnam, and should avoid low-value slugging with the US.

### **Core competent priorities**

1. **Trail and base infrastructure.** Trail affects Rally, March, Infiltrate, and Earnings; NVA income includes Laos/Cambodia bases and 2×Trail.
2. **Population Control.** High-pop spaces matter, but vulnerable lowland gains can be worse than defensible highland/jungle posture.
3. **Infiltrate judgment.** Infiltrate can build Troops at NVA Bases or convert VC pieces when NVA outnumbers VC; it can also reduce Opposition, which is good against a leading VC and bad if VC pressure is needed against US.
4. **Bombard/Ambush discipline.** Use them when one removed piece changes control, prevents an Assault, causes meaningful US casualties, or protects NVA base/control posture.
5. **Monsoon timing.** Necessary Marches must occur before Monsoon.

### **Major traps**

* Helping VC win by ignoring VC Bases/Opposition.
* Leaving VC pieces in places where they block NVA Control.
* Letting the Trail decay or reset badly.
* Allowing any Laos/Cambodia COIN Control before Coup.
* Attacking for casualties instead of Control/Bases.
* Overstacking where US Air Lift/Assault/Air Strike can punish.

### **Current-report corrections**

The NVA section is strategically good. Correct Bombard phrasing, delete formulas, and avoid presenting Infiltrate as always good; it is ally-rival conditional.

---

## **VC**

### **Validated strategic identity**

The VC is a clandestine political insurgency. It wins through **Total Opposition + VC Bases**, not Control. Its competence depends on hidden guerrillas, Terror, Agitation, Tax, Subvert, Ambush, bases, and forcing COIN to spend multiple steps to solve dispersed threats.

### **Victory-condition implications**

Competent VC play must:

* create Opposition in populated spaces;
* protect VC Bases, especially from both COIN removal and NVA Infiltrate;
* keep enough VC pieces in non-COIN-Controlled spaces for Agitation;
* use Terror markers to slow Pacification;
* maintain resources without giving away political position;
* break ARVN control and Patronage through Subvert;
* stay Underground unless exposure has a concrete payoff.

The VC opening strategy article supports Rally/Subvert as a serious VC development pattern and highlights the strategic value of early guerrilla presence, Subvert against ARVN control/Patronage, and future Tax to recover resources. It also includes a rule correction warning that player heuristics can be wrong, especially around Pacification requirements.

### **Core competent priorities**

1. **Political scoring.** Terror and Agitation are not side actions; they are the VC scoring engine.
2. **Base survival.** Bases are VP, income, and Rally capacity.
3. **Underground status.** Active guerrillas are vulnerable. Exposure must buy political shift, resources, Subvert damage, or decisive Ambush.
4. **Subvert ARVN.** Removing/replacing ARVN cubes can break COIN Control, ruin Pacification pairs, and reduce Patronage.
5. **Tax carefully.** LoC Tax is excellent because it gives resources without a Support shift. Tax in populated spaces shifts toward Support and is dangerous unless the resources/follow-up justify it.

### **Major traps**

* Fighting like NVA.
* Normal Attacking too often and exposing cells.
* Taxing populated spaces without a political repair plan.
* Leaving bases vulnerable to NVA Infiltrate.
* Letting COIN Control block Agitation.
* Letting US Pacification erase hard-won Opposition.
* Depleting VC resources too early without realistic Tax recovery.

### **Current-report corrections**

Preserve the VC identity and most traps. Rewrite Tax and Rally/Subvert as conditional strategic patterns. Remove `vc_*_value` formulas.

---

## **5. Cross-faction and temporal requirements**

The replacement document should have a cross-faction section before faction chapters. Required content:

| Topic | Pure requirement |
| ----- | ----- |
| Coup timing | Competent agents must evaluate not just the current board, but the board that will matter at the next Victory Phase, Resource Phase, Support Phase, Redeploy Phase, Commitment Phase, and Reset. |
| Monsoon timing | Agents must know that Sweep and March are unavailable during Monsoon, US Air Lift/Air Strike are limited to two spaces, and Pivotal Events are unavailable. Plans depending on Sweep/March must happen earlier. |
| Eligibility and pass | Agents must evaluate whether acting now is worth becoming ineligible, and whether passing for resources/next-card eligibility creates a stronger future turn. |
| Resource economy | ARVN Resources, Aid, Econ, VC Resources, NVA Resources, Trail, Bases, and Sabotage are strategic constraints, not bookkeeping. |
| Support/Opposition | US and VC are in a direct political contest over Support/Opposition. Active levels count double population. |
| Control | ARVN and NVA are in a direct territorial contest, but COIN Control and NVA Control are asymmetric. NVA must exceed all others alone. |
| Bases and tunnels | Bases are scoring, income, Rally, and logistics infrastructure. Tunneled Bases require special handling and must not be treated as ordinary removable bases. |
| LoCs/Econ/Sabotage | LoCs are spaces. They matter for Econ, movement, Tax, Sabotage, and Ambush adjacency. |
| Trail and Laos/Cambodia | NVA must protect Trail and Laos/Cambodia infrastructure; COIN incursions can degrade Trail at Coup, while US/ARVN pieces there are removed during Redeploy. |
| Ally-rival behavior | US/ARVN and NVA/VC are friendly by rules, but victory incentives diverge. Agents must help allies only when it improves their own margin or blocks worse outcomes. |
| Blocking near-wins | Blocking a near-win overrides normal faction habits. This includes blocking an ally. External strategy advice strongly supports this. |
| No myopic removal | Piece removal is good only when it changes score, legality, future threat, resources, Support/Opposition, Control, or timing. |
| No fake personality | Faction “personality” must emerge from incentives and board state. It must not override victory logic. |

---

## **6. Recommended document taxonomy**

### **Recommended files**

| File | Status | Purpose |
| ----- | ----- | ----- |
| `reports/fitl-competent-agent-ai.md` | Replace directly | New pure competence requirements document. Keep the path because active docs already cite it. |
| `reports/fitl-ai-policy-implementation-implications.md` | New | Non-normative implementation implications derived from the requirements. |
| Optional: `reports/fitl-competent-agent-ai-legacy-draft.md` | Optional archive-by-rename, not `archive/*` unless project convention prefers it | Preserve old text only as historical prior art, with a warning that it is deprecated. |

### **What the pure requirements document contains**

* Base-game scope.
* Source-of-truth hierarchy.
* Rule-backed strategic requirements.
* Faction victory logic.
* Cross-faction timing and incentive requirements.
* Faction-specific competence requirements.
* Traps/errors to avoid.
* Examples of competent reasoning in prose.
* Open questions and playtest needs.

### **What it excludes**

* Scoring formulas.
* Fixed weights.
* Candidate-turn data structures.
* DSL expressivity requirements.
* Plan-template schemas.
* Selector names.
* Architecture recommendations.
* Implementation-specific “must support” language.
* Printed bot reproduction.
* Expansions, Trưng, Sovereign of Discord, tournament variants, unless explicitly excluded.

### **What the implementation-implications document contains**

* Non-normative capability implications.
* Traceability from requirement IDs to possible implementation capabilities.
* Possible board features an implementation may need to inspect.
* Possible plan/preview/sequencing implications.
* Example scorer/selector sketches clearly labeled illustrative.
* Rule-validation questions.
* Test/witness ideas.
* Explicit warning: this document does not define faction competence.

---

## **7. Requirements for the replacement pure-competence document**

### **Proposed outline**

# Fire in the Lake Base-Game Faction Competence Requirements

## 1. Status and scope
## 2. Source-of-truth hierarchy
## 3. Definition of competent faction behavior
## 4. Global rule-interaction requirements
 - Victory checks and final margins
 - Event-card eligibility and passing
 - Monsoon
 - Coup phases
 - Resources, Aid, Econ, Patronage
 - Support/Opposition
 - COIN Control and NVA Control
 - Bases and tunnels
 - LoCs, Sabotage, and Tax
 - Trail and Laos/Cambodia
 - Events and Pivotal Events
## 5. Cross-faction incentive requirements
 - Win now
 - Block near-wins
 - Ally-rival behavior
 - Avoid body-count play
 - Avoid fake faction personality
## 6. US competence requirements
## 7. ARVN competence requirements
## 8. NVA competence requirements
## 9. VC competence requirements
## 10. Tactical patterns agents must recognize
## 11. Explicit non-requirements
## 12. Validation examples and open questions

### **Exact replacement text: scope**

Use this text at the top of the replacement:

# Fire in the Lake Base-Game Faction Competence Requirements

This document defines what competent AI faction behavior must understand and prioritize for the base game of Fire in the Lake as implemented in this repository.

It is not an implementation architecture. It does not prescribe a scoring formula, policy DSL, target selector, plan-template schema, fixed weight set, search algorithm, or bot flowchart. Any implementation implication derived from this document must be recorded separately and labeled non-normative.

A competent faction agent is exciting to play against because it makes rule-valid, situationally intelligent decisions from the current game state, visible timing structure, faction incentives, and legal action frontier. It does not act randomly to simulate personality, does not follow a fixed script when the board state contradicts it, and does not pursue faction flavor over victory logic.

This document covers only the base game. It does not define requirements for expansions, Trưng bots, solitaire bot reproduction, optional tournament variants, or non-base-game scenarios except to exclude them.

### **Exact replacement text: source hierarchy**

## Source-of-truth hierarchy

Requirements in this document are valid only if they align with:

1. `docs/FOUNDATIONS.md`;
2. the active repository rules under `rules/fire-in-the-lake/`;
3. base-game Fire in the Lake strategy evidence and play experience;
4. repository reports and prior drafts, only as lower-trust prior art.

If a strategic claim conflicts with the active repository rules, the repository rules win. If a strategic claim implies an implementation capability, that implication belongs in a separate non-normative implementation-implications document.

### **Example rewrites**

| Current implementation-ish text | Replacement pure requirement |
| ----- | ----- |
| `us_airstrike_value = active_enemy_pieces_removed + base_removed_value + trail_degrade_value - support_loss_penalty` | “The US must treat Air Strike as powerful but politically costly. It is appropriate when active-piece removal, base removal, Trail degradation, or near-win denial outweighs the mandatory political shift in selected populated spaces. It is poor play when it damages Support without decisive strategic payoff.” |
| `arvn_govern_patronage_value = population + active_support_to_passive_support_bonus ...` | “ARVN must recognize Govern as a primary Patronage engine, but must distinguish Active Support targets from Passive Support targets because Governing Passive Support to Neutral opens Rally space and hurts the US.” |
| `nva_infiltrate_vc_value = nva gain + vc denial - useful VC pressure lost` | “NVA must use Infiltrate both as a troop-building tool and as an ally-rival tool. Converting VC infrastructure is correct when it improves NVA score/control or blocks VC, but harmful when VC pressure is still needed to contain COIN.” |
| `vc_tax_value = resources_gained + future_agitation_enabled - support_shift_penalty` | “VC must Tax when resources are strategically necessary, especially on LoCs. Tax in populated spaces is dangerous because it shifts toward Support and exposes a guerrilla; it is competent only when the resource gain and follow-on political plan justify the cost.” |

---

## **8. Treatment of target-scoring / pseudo-formula sections**

| Section | Recommendation | Reason |
| ----- | ----- | ----- |
| Universal candidate-turn scoring sketch | **Delete from pure doc; move only as non-normative implication.** | It is a policy architecture sketch, not a competence requirement. |
| US target scoring features | **Rewrite.** | The insights are good; the formulas are not requirements. |
| ARVN target scoring features | **Rewrite.** | Govern/control/train insights are essential, but numeric-style decomposition risks becoming fixed selector design. |
| NVA target scoring features | **Rewrite with correction.** | Preserve Trail/base/control/Infiltrate ideas; correct Bombard/Aid/casualty nuance. |
| VC target scoring features | **Rewrite with correction.** | Preserve Terror/base/Subvert/Tax insights; fix Tax/Agitation wording. |
| Suggested ally weighting snippets | **Rewrite as prose.** | Conditional ally-rival behavior is a strategic requirement; utility-weight logic is implementation. |
| Preferred combinations | **Retain as “tactical patterns to recognize,” not templates.** | Competent players must understand combinations, but the report should not prescribe plan-template structure. |
| Advanced interrupt patterns | **Move to rule-validation / implications.** | Special timing is real, but some advanced continued-operation patterns need app legality validation before becoming normative. |

If moved, each formula must be labeled:

Non-normative implementation sketch. This is not a requirement, not a weight model, and not authoritative faction strategy. It is an example of considerations an implementation might inspect when trying to satisfy the corresponding competence requirement.
---

## **9. Treatment of the DSL expressivity section**

Do **not** delete it outright. It is valuable, but it is misplaced.

The current DSL section should be split as follows:

### **Keep in the pure requirements document**

Only a short implementation-neutral statement:

Competent faction behavior requires reasoning over legal action consequences, timing, visible future-card information, phase effects, resources, control, Support/Opposition, bases, hidden/active status, ally-rival incentives, and near-win denial. This document does not prescribe how an agent represents or computes that reasoning.

### **Move to `reports/fitl-ai-policy-implementation-implications.md`**

Move and rewrite:

* candidate turn generation;
* marginal victory scoring;
* space-feature scoring;
* temporal awareness;
* ally-rival utility;
* risk modeling;
* operation-specific legality and value;
* personality defaults.

### **Proposed implementation-implications outline**

# FITL AI Policy Implementation Implications

## 1. Status: non-normative
## 2. Traceability to pure competence requirements
## 3. Consequence reasoning capabilities
## 4. Timing and phase-awareness implications
## 5. Legal action sequencing implications
## 6. Board-feature observability implications
## 7. Ally-rival modeling implications
## 8. Risk and exposure modeling implications
## 9. Example non-normative scorer/selector sketches
## 10. Witness scenarios and playtest probes
## 11. Explicitly forbidden interpretations

The “forbidden interpretations” section should say:

* Do not treat any sketch as a required formula.
* Do not hardcode faction action tables detached from board state.
* Do not use omniscient information outside explicit analysis mode.
* Do not duplicate legality outside the kernel.
* Do not add FITL-specific engine logic.
* Do not make “personality” override victory incentives.

This is the clean split that preserves useful implementation thinking without letting it pollute strategic requirements.

---

## **10. Specific proposed changes**

### **Direct changes to `reports/fitl-competent-agent-ai.md`**

1. Replace the title and scope with the exact text above.
2. Delete the universal `candidate_turn` object block from the pure doc.
3. Delete the universal scoring sketch from the pure doc.
4. Replace “policy personality” wording with “competence requirements.”
5. Replace all `*_value = ...` pseudo-formulas with prose requirements.
6. Move DSL expressivity content to a separate non-normative document.
7. Add a source-of-truth hierarchy.
8. Add explicit base-game-only exclusions.
9. Add rule-backed caveats:
   * US Train Pacification differs from Support Phase Pacification.
   * NVA Terror does not create Opposition.
   * VC Tax in populated spaces shifts toward Support.
   * Bombard’s US casualty effect differs from ARVN Troop removal.
   * Monsoon blocks Sweep/March.
   * Events can override normal rules.
10. Add a “not implementation architecture” section.

### **Changes to active downstream docs**

| File | Required change |
| ----- | ----- |
| `specs/188-fitl-four-faction-plan-migration-and-sequencing.md` | Remove “authoritative source for target features” language. Replace “faithful encoding” with “implementation attempt to satisfy pure competence requirements.” Treat target features as non-normative. |
| `archive/specs/IMPLEMENTATION-ORDER-2026-05-22.md` | Stop saying the competence report requires a specific composed-turn architecture. It may say the requirements motivate whole-turn consequence reasoning, but not that AdvisoryTurnPlan is mandated by faction competence. |
| `reports/ai-agent-policy-overhaul-first-iteration.md` | Reclassify DPSA as an implementation proposal, not a requirements consequence. Its syntax examples should cite the implementation-implications doc, not the pure competence doc. |

### **Exact replacement section: “Non-requirements”**

## Explicit non-requirements

This document does not require:

- reproducing printed non-player bots;
- using any particular policy DSL;
- using target-scoring formulas;
- using fixed weights;
- using plan templates;
- using whole-turn advisory objects;
- using Monte Carlo search, minimax, behavior trees, HTN planning, or utility AI;
- preserving any current report claim merely because it is already written;
- importing expansions, Trưng, optional tournament variants, or non-base-game material.

A later implementation may choose any architecture that satisfies these requirements while obeying `docs/FOUNDATIONS.md` and the active FITL rules.
---

## **11. Open questions and uncertainty**

1. **Advanced operation interruption patterns need validation.** “Assault + Air Lift + continued Assault” and “Assault + Transport + continued Assault” may be legal depending on how operation-space legality is constructed and when pieces must be present. The rules allow Special Activities before/during/after Operations, but the app’s legal-action construction should be tested before these become requirements.
2. **Online strategy evidence is uneven.** The accessible sources are useful, but not enough to claim a full consensus across expert players. Direct BGG strategy-thread retrieval was not productive. Treat the online evidence as corroboration, not proof.
3. **US base-game balance is contested.** Designer variant notes show tournament concern around US Short-scenario cut-and-run, Air Lift, Air Strike, and Commitment. Do not import variants, but do require the AI to evaluate these tactics carefully.
4. **Faction competence should be playtested.** More prose will not settle whether an agent is “exciting to play against.” The replacement document should drive witness scenarios and playtest probes, not pretend every strategic judgment can be settled on paper.
5. **Events need more treatment.** The current report focuses on Ops/Specials. Competent agents also need to recognize when an Event is more important than faction-default behavior, especially because Event text can override rules.

---

## **12. Final recommendation**

Deprecate the current report as an authoritative source immediately.

Replace `reports/fitl-competent-agent-ai.md` with a pure base-game faction-competence requirements document. Preserve the strategic insights, but remove or relocate all implementation assumptions. Create `reports/fitl-ai-policy-implementation-implications.md` for the DSL/scoring/plan/capability material, explicitly labeled non-normative.

The current contamination risk is real because active planning already treats the report’s target features and combinations as things to encode faithfully. That should stop. The replacement document should answer only:

What must a competent Fire in the Lake faction agent understand and prioritize to play intelligently?

Everything about how to represent, score, select, preview, or execute that behavior belongs somewhere else.
