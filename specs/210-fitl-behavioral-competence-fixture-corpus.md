# Spec 210 — FITL Behavioral Competence Fixture Corpus (P0)

**Status**: PROPOSED
**Priority**: High — this is where FITL faction competence actually gets *proven* rather than asserted. After Specs 201–205 authored the four-faction doctrine library, the remaining gap (verified 2026-06-03) is that no test executes a turn and asserts the intended strategic property improved. This spec closes that gap for the highest-value P0 claims using the Spec 209 harness.
**Complexity**: M–L — fixtures + curated states under `packages/engine/test/policy-profile-quality/` (or a `competence/` sibling), plus *conditional* YAML feature additions in `data/games/fire-in-the-lake/92-agents.md` — added only where a fixture proves the current encoding cannot distinguish the required choice. No engine work.
**Date**: 2026-06-03
**Dependencies**:
- **Hard**: `archive/specs/209-game-agnostic-executed-turn-competence-harness.md` (COMPLETED) — every fixture here is built on the Spec 209 harness. 210 can start after the archived Spec 209 harness landed.
- **Soft**: `archive/specs/201-fitl-shared-doctrine-and-lifecycle.md`, `202` (US), `203` (NVA), `204` (VC), `205` (ARVN) — all COMPLETED; this spec proves the doctrine those specs authored.
- **Soft**: `data/games/fire-in-the-lake/91-victory-standings.md` — victory formulas used directly in outcome assertions.
- **Soft**: `data/games/fire-in-the-lake/93-observability.md` — public preview surfaces fixtures assert against.

**Trigger report**: `reports/fitl-ai-encoding-second-iteration.md` (ChatGPT-Pro second iteration). See §6 (Reassessment).

**Ticket namespace**: `210FITLCOMP`

---

## 1. Goal

Prove, at `executed-outcome` (and where specified, `adversarial`) proof tier, that the production FITL agents select competent legal moves from the real frontier and improve the intended strategic property. Scope is **P0 only**: each faction's primary victory engine plus its top signature combinations, plus the shared doctrine fixtures. P1 fixtures (Patrol/Advise, Air Lift, Sweep/Raid, Bombard, Rally/Base network, event direct-swing) are explicitly deferred.

Each fixture:
- builds a real state and a published legal frontier via the Spec 209 live-frontier runner;
- includes at least one bad-but-legal alternative root (adversarial helper);
- asserts an outcome delta over generic queries (victory margin / named feature / token count) tied to the faction's victory formula;
- asserts preview-ref provenance for decisive refs;
- replays deterministically.

## 2. P0 Fixture Set (~16)

**Shared (one per faction where applicable):**
1. **Block current leader** — one fixture per faction (US/ARVN/NVA/VC), near-win leader with ≥2 legal denials and one irrelevant strong move; assert the selected candidate reduces the leader's margin more than the alternative, via the leader's own victory-formula query.
2. **Immediate own win** — at least the US case (Support+Available) as the shared exemplar: a legal winning move plus a tempting non-winning setup; assert the winning root is selected and the executed margin crosses threshold.
3. **Near-Coup concrete swing** — one fixture: Coup imminent, speculative setup tempting, concrete swing available; assert the selected plan changes the Coup-scored property.
4. **Monsoon paired** — same board with Monsoon false/true; assert Sweep/March setup preferred when legal, and a competent legal fallback (not merely "not Sweep/March") under Monsoon.
5. **Ally-rival paired** — same tempting ally-helping move, ally far-from-win vs near-win; assert cooperation in the former and throttle in the latter.

**US:**
6. Train/Pacify executes and improves Support (named-feature/token query) on a legal COIN-controlled high-pop target.
7. Train+Advise selected over plain Train on a live frontier; Advise role executed; Aid/removal outcome.
8. Safe Air Strike: zero-pop/Trail target selected; populated-Support target present as the bad alternative and rejected; executed Support not harmed.

**ARVN:**
9. Train+Govern executes; Patronage increases and Support destruction is bounded.
10. Transport origin-control: a route that would lose origin Control is the bad alternative; constraint rejects it; selected route preserves origin Control.
11. Pre-Coup redeploy avoidance: a Troop deployment that evaporates in Coup redeploy is demoted.

**NVA:**
12. Trail repair before Coup: Rally improves Trail when Trail is low; March violence present as bad alternative.
13. March+Infiltrate: March creates Infiltrate conditions; executed outcome improves NVA control/margin (not random VC harm).
14. Infiltrate VC only when rational: paired VC-near-win vs VC-not-near-win; Infiltrate selected only in the justified variant.

**VC:**
15. Terror high-pop non-COIN: Terror executes and Opposition (or Support-denial) improves on a legal high-pop target; low-pop Terror present as bad alternative.
16. LoC-Tax over populated-Support Tax: LoC tax selected; populated-Support tax present and demoted/avoided absent resource crisis.
17. Ambush-first / Agitation prep (combined or as two if budget allows): Attack+Ambush selected over conventional Attack; near-Coup Agitation prep selected over a flashy irrelevant move.

(Numbering is indicative; the implementing tickets may merge #16/#17 if the curated states overlap, but every faction must reach `executed-outcome` tier on its primary victory engine and ≥1 signature combination.)

## 3. Conditional YAML Additions (`92-agents.md`)

Add a feature **only** when a fixture fails because the current encoding cannot distinguish the required choice. Candidates (verified status 2026-06-03):
- **Genuinely new `stateFeatures`** (none currently exist): `availableUsPieces`, `keyEconSabotageCount`, `agitationReadyPop`, `pacifiableSupportPop`, `nvaSanctuaryBaseCount`, `vcBaseThreatenedByNvaInfiltrate`.
- **`candidateFeatures` that do NOT yet exist**: `projectedAvailableUsDelta`, `projectedPatronageDelta`, `projectedNvaBaseDelta`, `projectedVcBaseDelta`.
- **Do NOT re-add** the four that already exist: `projectedSupportDelta`, `projectedOppositionDelta`, `projectedAidDelta`, `projectedTrailDelta`.

Each added feature must be justified by a named failing fixture in the ticket that adds it (no speculative authoring — the trigger report's own "tune YAML only where a fixture fails" rule).

## 4. Acceptance Criteria

1. Every faction reaches `executed-outcome` proof tier on its primary victory engine and ≥1 signature combination.
2. Shared block-leader fixtures exist for all four factions; immediate-win, near-Coup, Monsoon-paired, and ally-rival-paired fixtures exist.
3. Each positive fixture has a co-located adversarial bad-but-legal alternative that the agent rejects.
4. Preview-derived decisive refs are `ready` or explicitly traced non-`ready`; no silent coercion.
5. All fixtures replay deterministically (identical stable keys, microturn decisions, outcome deltas).
6. Production FITL spec still compiles; no illegal/non-constructible agent moves; existing 201–205 witnesses still pass; smoke/perf canaries stay green.
7. Any YAML feature added is gated on a named failing fixture.

## 5. Non-Goals

- **No P1 fixtures** (Patrol/Advise LoC/Econ, Air Lift route, Sweep/Raid expose-before-removal, Bombard, Rally/Base network, base-threat-from-Infiltrate, event direct-swing).
- **No event-decision annotation taxonomy.** Event direct-swing remains a module, not a plan template, until a (deferred) fixture proves the annotation surface cannot express direct-swing vs trap.
- **No brittle single-stable-key assertions** where moves are strategically equivalent — assert strategic properties and adversarial dominance.
- **No engine changes.**
- **No witness reclassification work** beyond tagging the new fixtures with the Spec 209 `@proof-tier` annotation.

## 6. Reassessment of `reports/fitl-ai-encoding-second-iteration.md`

**Kept:** the P0 fixture intents (per-faction victory engine + signature combos + shared win/block/near-Coup/Monsoon/ally-rival), the bad-but-legal-alternative requirement, preview-status and replay requirements, and "tune YAML only where a fixture fails."

**Corrected:** the report conflates existing and new YAML features — 4 of 8 proposed `candidateFeatures` already ship and MUST NOT be re-added (§3). Feature additions are folded into fixture work, not a standalone authoring spec.

**Rejected:** P1 fixtures and the event-annotation taxonomy are deferred (YAGNI / scope control); the 24-fixture full set is trimmed to ~16 P0 to avoid the brittle-overfitting risk the report itself warns about.
