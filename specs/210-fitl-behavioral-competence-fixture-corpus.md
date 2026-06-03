# Spec 210 — FITL Behavioral Competence Fixture Corpus (P0)

**Status**: PROPOSED
**Priority**: High — this is where FITL faction competence actually gets *proven* rather than asserted. After Specs 201–205 authored the four-faction doctrine library, the remaining gap (verified 2026-06-03) is that no test executes a turn and asserts the intended strategic property improved. This spec closes that gap for the highest-value P0 claims using the Spec 209 harness.
**Complexity**: M–L — *promote in place* the existing ~50 structural doctrine witnesses under `packages/engine/test/policy-profile-quality/` (authored by Specs 201–205; currently `architectural-invariant`/`convergence-witness` with no `@proof-tier`) to `executed-outcome` (and where specified, `adversarial`) tier, by rewriting each `assertSharedModuleWitness`-style body into a curated state run through the Spec 209 live-frontier harness. The structural compile/bind/score check folds into the harness fixture's `assertPlanTraceChain` assertion. Plus *conditional* YAML feature additions in `data/games/fire-in-the-lake/92-agents.md` — added only where a fixture proves the current encoding cannot distinguish the required choice. No engine work (new `candidateFeatures` are pure-data `preview.*` analogues; new `stateFeatures` compose existing expr primitives).
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

**These fixtures already exist as structural witnesses.** Specs 201–205 authored ~50 doctrine witnesses in `policy-profile-quality/` (e.g. `shared-block-current-leader-{us,arvn,nva,vc}`, `us-train-pacify-high-pop-support`, `nva-march-infiltrate-builds-nva-not-steal-vc`) that *compile, bind, and score* the doctrine modules via `assertSharedModuleWitness` — with a synthetic `stopReason` and no executed turn — and sit at `architectural-invariant`/`convergence-witness` (proposal-level) tier. None import the Spec 209 competence harness. This spec **promotes those witnesses in place** to `executed-outcome` tier; it does not author a parallel fixture set. (The trigger report §11.3 frames the same work as *"replace synthetic-root-only tests with live-frontier tests."*)

Each promoted fixture:
- builds a real state and a published legal frontier via the Spec 209 live-frontier runner;
- includes at least one bad-but-legal alternative root (adversarial helper);
- asserts an outcome delta over generic queries (victory margin / named feature / token count) tied to the faction's victory formula;
- asserts preview-ref provenance for decisive refs;
- replays deterministically.

## 2. P0 Fixture Set (~16)

Each P0 intent below already has a structural witness in `policy-profile-quality/`; the deliverable is to **rewrite that file in place** to a harness-backed `executed-outcome` fixture — reusing the `describe` name and doctrine intent, and adding a curated state, a bad-but-legal adversarial root, outcome-delta assertions, preview-status checks, and replay identity. Existing target files per intent (no new files are created where one already exists):

| # | Existing structural witness file(s) |
|---|---|
| 1 | `shared-block-current-leader-{us,arvn,nva,vc}` |
| 2 | `shared-immediate-win-{us,arvn,nva,vc}` |
| 3 | `shared-near-coup-concrete-swing-{us,arvn,nva,vc}` |
| 4 | `shared-monsoon-awareness-{us,arvn,nva,vc}` |
| 5 | `shared-ally-rival-throttle-{us,arvn,nva,vc}` (+ `arvn-us-rival-risk-flip`, `nva-vc-rival-suppresses-terror`) |
| 6 | `us-train-pacify-high-pop-support` |
| 7 | `us-train-advise-beats-plain-train` |
| 8 | `us-sweep-airstrike-prefers-zero-pop-or-trail` + `us-avoids-airstrike-populated-support` |
| 9 | `arvn-train-govern-separation` + `arvn-govern-active-support-priority` (+ `arvn-govern-patronage-unavailable-demotes`) |
| 10 | `arvn-transport-refuses-origin-control-loss` (+ `arvn-transport-postState-origin-control-constraint-time`) |
| 11 | `arvn-precoup-posture-avoids-redeploy-undone` |
| 12 | `nva-protects-trail-before-coup` + `nva-rally-improves-trail` |
| 13 | `nva-march-infiltrate-builds-nva-not-steal-vc` (+ adversarial `nva-march-infiltrate-steal-vc-base`) |
| 14 | `nva-avoid-low-yield-vc-steal` + `nva-blocks-vc-near-win` |
| 15 | `vc-terror-high-pop-non-coin-controlled` |
| 16 | `vc-tax-on-populated-support-vetoed` + `vc-tax-funds-future-terror-rally` |
| 17 | `vc-attack-only-with-ambush` + `vc-avoids-conventional-attack-without-ambush` + `vc-agitation-prep-before-coup` + `nva-attack-ambush-beats-conventional-attack` |

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

(Numbering is indicative; the implementing tickets may merge #16/#17 if the curated states overlap, but every faction must reach `executed-outcome` tier on its primary victory engine and ≥1 signature combination. All target files already exist — tickets rewrite them in place rather than creating new files.)

## 3. Conditional YAML Additions (`92-agents.md`)

Add a feature **only** when a fixture fails because the current encoding cannot distinguish the required choice. Candidates (verified status 2026-06-03):
- **`stateFeatures` not among the existing 24** — the `library.stateFeatures` block in `92-agents.md` already defines 24 entries (margins, `patronage`, `coinControlPop`, `availableUsTroops`, `availableUsBases`, `nvaBaseCount`, `nvaTroopCount`, monsoon, etc.). Candidates absent verbatim: `availableUsPieces`, `keyEconSabotageCount`, `agitationReadyPop`, `pacifiableSupportPop`, `nvaSanctuaryBaseCount`, `vcBaseThreatenedByNvaInfiltrate`. Before adding any, check for a near-duplicate and prefer composing existing features (e.g. `availableUsPieces` overlaps `availableUsTroops` + `availableUsBases`; `nvaSanctuaryBaseCount` overlaps `nvaBaseCount`).
- **`candidateFeatures` that do NOT yet exist**: `projectedAvailableUsDelta`, `projectedPatronageDelta`, `projectedNvaBaseDelta`, `projectedVcBaseDelta`, `projectedAgitationReadyDelta`. Each follows the shipping `coalesce(sub(preview.<ref>, <ref>), 0)` + `previewFallback: { onUnavailable: noContribution }` pattern over already-resolvable `preview.var.global.*` / `preview.feature.*` refs (pure data, no engine change).
- **Do NOT re-add** the four `candidateFeatures` that already exist: `projectedSupportDelta`, `projectedOppositionDelta`, `projectedAidDelta`, `projectedTrailDelta`. Note also that `projectedCurrentLeaderMargin`, `projectedLeaderMarginDelta`, `projectedAllyMarginDelta`, and `projectedNearestThreatMargin` already ship and likely cover the block-leader (#1) and ally-rival (#5) fixtures without any new feature.

Each added feature must be justified by a named failing fixture in the ticket that adds it (no speculative authoring — the trigger report's own "tune YAML only where a fixture fails" rule).

## 4. Acceptance Criteria

1. Every faction reaches `executed-outcome` proof tier on its primary victory engine and ≥1 signature combination.
2. The shared block-leader (all four factions), immediate-win, near-Coup, Monsoon-paired, and ally-rival-paired witnesses are promoted from structural to `executed-outcome` tier — their `assertSharedModuleWitness` bodies replaced by harness runs.
3. Each positive fixture has a co-located adversarial bad-but-legal alternative that the agent rejects.
4. Preview-derived decisive refs are `ready` or explicitly traced non-`ready`; no silent coercion.
5. All fixtures replay deterministically (identical stable keys, microturn decisions, outcome deltas).
6. Production FITL spec still compiles; no illegal/non-constructible agent moves; 201–205 witnesses not targeted for promotion still pass, and every promoted witness passes at its new `executed-outcome` tier; smoke/perf canaries stay green.
7. Any YAML feature added is gated on a named failing fixture.
8. Promotion is in place: each promoted fixture keeps its existing file path and `describe` name, carries the Spec 209 `@proof-tier: executed-outcome` (and where applicable `adversarial`) annotation, and no parallel fixture file is created where a structural witness already exists.

## 5. Non-Goals

- **No P1 fixtures** (Patrol/Advise LoC/Econ, Air Lift route, Sweep/Raid expose-before-removal, Bombard, Rally/Base network, base-threat-from-Infiltrate, event direct-swing).
- **No event-decision annotation taxonomy.** Event direct-swing remains a module, not a plan template, until a (deferred) fixture proves the annotation surface cannot express direct-swing vs trap.
- **No brittle single-stable-key assertions** where moves are strategically equivalent — assert strategic properties and adversarial dominance.
- **No engine changes.**
- **No witness reclassification work** beyond promoting the targeted fixtures and tagging them with the Spec 209 `@proof-tier` annotation.

## 6. Reassessment of `reports/fitl-ai-encoding-second-iteration.md`

**Kept:** the P0 fixture intents (per-faction victory engine + signature combos + shared win/block/near-Coup/Monsoon/ally-rival), the bad-but-legal-alternative requirement, preview-status and replay requirements, and "tune YAML only where a fixture fails."

**Corrected:** the report conflates existing and new YAML features — of the 9 `candidateFeatures` it proposes (report §10.3), 4 already ship and MUST NOT be re-added; 5 are genuinely new (§3). It also lists `stateFeatures` work as if none exist, when 24 already ship. Most decisively, the proposed P0 fixtures already exist as structural witnesses (Specs 201–205); per the report's own §11.3, the work is to **replace those synthetic-root/structural tests with live-frontier `executed-outcome` tests in place**, not to author a new corpus. Feature additions are folded into fixture work, not a standalone authoring spec.

**Rejected:** P1 fixtures and the event-annotation taxonomy are deferred (YAGNI / scope control); the 24-fixture full set is trimmed to ~16 P0 to avoid the brittle-overfitting risk the report itself warns about.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-06-03:

- [`tickets/210FITLCOMP-001.md`](../tickets/210FITLCOMP-001.md) — Establish promotion pattern + shared competence helper; promote block-current-leader ×4 (covers §2(1))
- [`tickets/210FITLCOMP-002.md`](../tickets/210FITLCOMP-002.md) — Promote shared immediate-win fixtures ×4 (covers §2(2))
- [`tickets/210FITLCOMP-003.md`](../tickets/210FITLCOMP-003.md) — Promote shared near-Coup concrete-swing fixtures ×4 (covers §2(3))
- [`tickets/210FITLCOMP-004.md`](../tickets/210FITLCOMP-004.md) — Promote shared Monsoon-paired fixtures ×4 (covers §2(4))
- [`tickets/210FITLCOMP-005.md`](../tickets/210FITLCOMP-005.md) — Promote shared ally-rival-paired fixtures ×4 + rival-specific; retire dead structural helper (covers §2(5))
- [`tickets/210FITLCOMP-006.md`](../tickets/210FITLCOMP-006.md) — Promote US faction fixtures (covers §2(6–8))
- [`tickets/210FITLCOMP-007.md`](../tickets/210FITLCOMP-007.md) — Promote ARVN faction fixtures (covers §2(9–11))
- [`tickets/210FITLCOMP-008.md`](../tickets/210FITLCOMP-008.md) — Promote NVA faction fixtures (covers §2(12–14, 17-NVA))
- [`tickets/210FITLCOMP-009.md`](../tickets/210FITLCOMP-009.md) — Promote VC faction fixtures (covers §2(15–17))
- [`tickets/210FITLCOMP-010.md`](../tickets/210FITLCOMP-010.md) — Conditional §3 YAML feature additions, gated on failing fixtures (covers §3, §4 AC#7)
