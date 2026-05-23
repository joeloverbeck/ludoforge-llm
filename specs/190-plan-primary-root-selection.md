# Spec 190 — Plan-Primary Root Selection: Let the Selected Plan Choose the Action-Selection Root

**Status**: PROPOSED
**Priority**: High — this is the one genuine architectural gap the completed 186–188 series left open. Spec 186 §4.6 specified that the composed plan becomes the primary selector of the action-selection microturn and that flat considerations are retired as the *primary* selector; the implementation commits the plan to state and drives the *tail* microturns, but the *root* is still chosen by the scalar evaluator. Until this lands, the architecture behaves like the old utility-AI with an advisory plan stapled on.
**Complexity**: M — engine change at the root-selection seam; behaviour-changing (profile-quality re-validation required); no compiler/kernel changes.
**Date**: 2026-05-22
**Dependencies**:
- `archive/specs/186-advisory-turn-plan-architecture-core.md` (COMPLETED — plan proposer/evaluator, `PlanExecutionState`, execution controller, fallback ladder, plan trace)
- `archive/specs/187-whole-turn-posture-and-ally-rival-metadata.md` (COMPLETED — posture + relationship scoring the proposer already uses)
- `archive/specs/191-plan-role-semantic-integrity.md` (COMPLETED — trustworthy step matching and enforced role constraints make the plan a safe root authority; see `specs/IMPLEMENTATION-ORDER.md`)

**Trigger report**:
- `reports/ludoforge-ai-overhaul-first-iteration.md` (ChatGPT-Pro audit, 2026-05-22). This spec adopts the audit's central verified finding (#1 — root selection is not plan-primary) and corrects its framing: this is the completion of Spec 186 §4.6, not a new architecture.

**Ticket namespace**: `190PLANROOTSEL` (proposed)

---

## 1. Goal

Make the selected plan/root pair authoritative at the action-selection microturn:

- When `proposeAndCommitAdvisoryTurnPlan` returns `status: selected`, the **returned root decision is the plan's chosen root** (matched into the published `legalActions` frontier), not the scalar evaluator's pick.
- The scalar `evaluatePolicyMove` path is demoted to the **fallback floor**: it chooses the root only when no plan template matches (`status` other than `selected`), exactly as Spec 186 §4.6 specified ("considerations survive as … the primitive policy that the fallback ladder bottoms out in").
- This relocates the existing `value:1` leaf-scoring strategy modules to their intended subordinate role *without rewriting the profiles* — they score within role selectors / posture / the no-template fallback, not as the primary root chooser.

## 2. Non-Goals

- **No profile rewrite.** The four-faction authoring (Spec 188) and its demoted leaf scorers stay as authored. This spec changes *which layer chooses the root*, not the authored content. (Spec 186 §11 settled "considerations are demoted, not abolished".)
- **No new doctrine layer, no new selector sources, no posture/relationship changes.** Specs 186/187 own those; this spec only re-wires the seam in `chooseActionSelectionDecision`.
- **No kernel/legality/constructibility changes.** The plan still proposes only from kernel-published legal roots; it never fabricates legality (Foundations #5/#18).
- **No removal of the scalar path.** It is demoted, not deleted — it remains the no-template fallback and primitive floor.

## 3. Context (verified against codebase, 2026-05-22)

- `PolicyAgent.chooseActionSelectionDecision` (`packages/engine/src/agents/policy-agent.ts:603–655`):
  - `:616` `const evaluation = evaluatePolicyMove({...})` — scalar policy scores the root.
  - `:634` `const planTrace = proposeAndCommitAdvisoryTurnPlan(input, this.planExecutionState, this.profileId)?.trace` — the plan is proposed and committed to `PlanExecutionState`, but **only `.trace` is extracted**.
  - `:640–644` `const selectedDecision = actionDecisions.find((decision) => decision.move === evaluation.move) ?? …selectedStableMoveKey` — the returned root is keyed entirely to the *scalar* result; the plan's chosen root is used only for the diagnostic trace (`:653`).
- The committed plan still drives subsequent microturns through `chooseFrontierDecision` → `plan-controller`, so plan-driven *tail* execution works; only *root* authority is missing.
- Spec 186's ARVN Train+Govern proof slice passes because once the scalar picks Train, the committed plan drives Govern — it never required the plan to *override* a scalar root choice. Spec 186's acceptance tests (Phase 2(e) v2-equivalence; Phase 3 distinct Train/Govern spaces) did not include a root-override witness, so the gap was not caught.
- Spec 186 §4.6 intent (per spec text): "The v2 top-level consideration-scoring pass is retired as the *primary* selector of the microturn"; plan-first is reached when a template matches, otherwise it "falls through to the primitive consideration policy."

## 4. Architecture

### 4.1 Root-authority seam

Rework `chooseActionSelectionDecision` so the plan proposal result is consumed for selection, not only for trace:

1. Build the legal `actionSelection` decisions (unchanged, `:606–613`).
2. Call `proposeAndCommitAdvisoryTurnPlan` and consume the full return value: it already returns `{ result, trace }`, where `result.status` is the canonical `selected`/`noTemplate`/`noRootMatch`/`noRoleBinding` discriminant and `result.selected.rootStableMoveKey` is the plan's chosen root key (also mirrored on `trace.selectedRootStableMoveKey`). No signature change is required — the change is purely which fields the caller consumes.
3. **If `status: selected`** — resolve the plan's chosen root into the published `actionDecisions` frontier (by stable move key) and return it, threading `input.rng` back unchanged (the plan proposer is deterministic and consumes no RNG, so there is no scalar-style advanced RNG to pass on). The plan's root is, by construction, one of the enumerated legal roots (the proposer matches templates against published legal root actions — Spec 186 §4.4), so the resolution always finds a member; failure is an assert-impossible internal error, not a fallback path.
4. **Otherwise** (`noTemplate`/`noRootMatch`/`noRoleBinding`) — fall through to the existing scalar `evaluatePolicyMove` selection (`:616`, `:640`), which becomes the no-template fallback.
5. Plan-state commit and trace attachment are preserved in both branches.

The scalar evaluation is only *invoked* on the fallback branch — when a plan is selected, the scalar root-scoring pass is skipped (it no longer chooses the root). This is the literal realization of Spec 186 §4.6.

### 4.2 Runtime invariant

Add an architectural-invariant assertion (and test): when the plan proposal status is `selected`, the returned root decision's stable move key equals the plan's committed root stable move key, and the returned decision is a member of the published `legalActions` frontier.

## 5. Data flow / Process

`actionSelection` frontier → propose plans from legal roots → **selected ⇒ root = plan root ∈ frontier → commit → return** ; **not selected ⇒ scalar `evaluatePolicyMove` → root ∈ frontier → commit → return**. Subsequent microturns are unchanged (plan controller drives the tail).

## 6. Determinism and replay (Foundations #8, #16)

Plan proposal/selection is already deterministic (Spec 186). Demoting the scalar pass to the fallback branch removes a redundant scoring pass on the plan-selected branch but does not introduce nondeterminism. Plan traces and decisions must remain replay-identical; plan-less profiles must remain byte-identical to current behaviour (the v2-equivalence guarantee is preserved because the fallback branch is the unchanged scalar path).

## 7. Edge cases

- **Plan selected, multiple frontier members share the root tag** — resolve by the plan's committed root stable move key (exact identity), not tag.
- **Plan selected but no frontier member matches the committed root key** — assert-impossible (proposer selects from published legal roots); surface as an internal error, never a silent scalar fallback.
- **No template matches** — scalar fallback, identical to today.
- **Posture unavailable for the selected plan** — Spec 187's posture fallback already governs proposal scoring; this spec does not change it. A plan can still be `selected` with a posture-fallback status, and it then chooses the root.
- **Plan-less profile** — `status` is never `selected`; behaviour is byte-identical to today.

## 8. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Root-authority wiring (§4.1) + invariant (§4.2) | On `status: selected` the returned root == committed plan root ∈ frontier; scalar pass skipped on the selected branch; plan-less profiles byte-identical (v2-equivalence preserved); determinism/replay preserved | M |
| **P2** | Root-override witness + profile-quality re-validation | A constructed scenario where the plan's root differs from the scalar evaluator's pick asserts the **plan's** root is returned; ARVN proof-slice witnesses still pass; profile-quality witnesses re-run (warning-class) | S–M |

## 9. Test plan

- **Architectural-invariant** — `selected ⇒ returned root == committed plan root ∈ legalActions`; scalar root-scoring not invoked on the selected branch.
- **Profile-quality (warning-class, `policy-profile-quality/`)** — root-override witness (plan root chosen over a divergent scalar pick) for ARVN; existing Train+Govern separation + fallback witnesses still pass.
- **v2-equivalence** — a `considerations`-only (plan-less) profile produces byte-identical decisions to current behaviour (re-uses Spec 186 Phase 2(e) harness).
- **Determinism** — plan traces and decisions replay-identical.

## 10. Foundation alignment

#5/#18/#19 (plan stays advisory-to-legality and atomic; root is still a published legal action; no compound shape exposed) · #8/#16 (deterministic, replay-proven; behaviour change proven by a root-override witness) · #14 (the scalar-first root path is replaced, not shimmed — scalar demoted to fallback, no `_legacy` alias) · #15 (root-cause: complete Spec 186 §4.6's intended decision authority rather than tuning weights or rewriting profiles).

## 11. Reassessment of the external proposal (`reports/ludoforge-ai-overhaul-first-iteration.md`)

**Adopted:**
- Claim #1 (root selection is not plan-primary; the plan is advisory/trace-only at the root) — the audit's central architectural finding, verified directly against `policy-agent.ts:616/634/640`. This spec is its fix.

**Corrected:**
- The audit's "the current architecture is still not the primary decision architecture … perform a second major architectural iteration" framing — corrected to: Spec 186 §4.6 *already* specified plan-primary root selection; the implementation realized plan-driven tail execution + advisory root but not root authority. This is completion of a built architecture, not a new iteration.
- The audit's claims #2/#3 ("strategy modules are score-groups, selectors use `value:1`/`projectedSelfMargin`/`weight:0`") — these describe the demoted leaf scorers Spec 186 §11 deliberately kept. They read as "scalar soup" only because the scalar pass currently chooses the root; this spec relocates them to their intended subordinate role *without a profile rewrite*. No profile-authoring spec is warranted on this basis.

**Deferred / rejected:** see `archive/specs/191-plan-role-semantic-integrity.md` §11 (shared disposition table for the audit's remaining recommendations) and `specs/IMPLEMENTATION-ORDER.md`.

## 12. Out of scope (named follow-on / sibling)

- **Spec 191** — plan/role semantic integrity (lands first; hardens the step matching and role constraints that make the plan a safe root authority).
- Cookbook rewrite (after this lands, via `reassess-agent-dsl-cookbook`), relationship-matrix, evolution-loop revival — per Spec 191 §11.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-23:

- [`archive/tickets/190PLANROOTSEL-001.md`](../archive/tickets/190PLANROOTSEL-001.md) — Plan-primary root authority at action-selection seam + invariants (COMPLETED 2026-05-23; covers §8 P1: §4.1 wiring, §4.2 invariant, §9 architectural-invariant + determinism + v2-equivalence-preserved)
- [`tickets/190PLANROOTSEL-002.md`](../tickets/190PLANROOTSEL-002.md) — ARVN root-override witness + profile-quality re-validation sweep (covers §8 P2: §9 root-override witness + profile-quality re-validation)

## Outcome

TBD.
