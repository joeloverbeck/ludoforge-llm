# Spec 180 — Standing-Vector Observability and Outer-Preview Signal Integrity

**Status**: PENDING
**Priority**: Medium — durable observability + ergonomics upgrades surfaced by `reports/spec-179-remediation.md`; not blocking, but each pillar pays compound interest the moment a second game grows opponent-aware authoring needs.
**Complexity**: M — three independently-mergeable pillars, each comparable in size to Spec 162 §5.
**Date**: 2026-05-17
**Dependencies**:
- `specs/179-action-selection-preview-outcome-grant-opt-in.md` (witness signal — outer-preview opponent refs are uniform until 179's drive-boundary lift lands; Phases 2-4 of this spec depend on 179 being live)
- `archive/specs/162-preview-signal-integrity.md` (Foundation #20 introduced for inner-preview; this spec extends it to the outer-preview `seatAgg` aggregate path)
- `archive/specs/122-cross-seat-victory-aggregation.md` (`seatAgg`, `$seat`, `over: opponents` IR — substrate this spec extends, not replaces)
- `archive/specs/113-preview-state-policy-surface.md` (per-seat preview surface — substrate)
- `archive/specs/164-continued-inner-preview-deepening.md` (cap-class registry pattern — model for any added availability mode names)

**Trigger reports**:
- `reports/spec-179-remediation.md` (external-LLM deep-research proposal reassessed by this spec — see §12)
- `reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md` (origin gap report; resolved at the mechanical level by Spec 179, residual observability/ergonomics gap captured here)

**Ticket namespace**: `180STDVECOBSROL` (proposal — finalized by `/spec-to-tickets`)

---

## 1. Goal

Three small architectural upgrades to the outer-preview surface that, taken together, make opponent-aware policy authoring honest, debuggable, and ergonomic across games — without adding new compiled IR or duplicating Spec 122's `seatAgg`:

1. **Outer-preview signal integrity.** Foundation #20's "unavailable preview refs MUST NOT silently coerce into numeric contributions" was wired through the inner-preview chooseN path by Spec 162. The outer-preview seat-aggregate path (`seatAgg(over: opponents, expr: preview.victory.currentMargin.$seat, aggOp: sum)`) still silently returns `0` when every per-seat cell is unavailable. Close that gap.
2. **Per-candidate × per-seat trace matrix.** Today `previewUsage.readyRefStats` reports aggregate ready/cand ratios per ref name. After Spec 179 lifts the drive boundary, operators investigating which opponent's projected state shifted per candidate have no per-seat breakdown — the trigger report had to add a custom aggregation script. Bake the matrix into `previewUsage` so future opponent-preview investigations are first-class.
3. **Named role primitives.** Add `currentLeader`, `nearestThreat`, `closestAhead`, `closestBehind` as terminal-ranking-derived seat selectors usable inside `seatAgg.over` (or as standalone refs). Eliminates ad-hoc `aggOp: max` + `over: opponents` boilerplate when the author actually wants a single named role.

Foundation #20 is the load-bearing principle. The other two pillars are observability and authoring ergonomics, both bounded.

## 2. Non-Goals

- **No replacement for `seatAgg`.** `standingRef` and `standingAgg` as separate compiled IR nodes (ChatGPT-Pro proposal §6.3) are explicitly out of scope. `seatAgg` is extended with an `availability` field and a `role` binding; no new union variants are added to `AgentPolicyExpr`. See §12 for rationale.
- **No drive-boundary change.** This spec assumes Spec 179 has lifted the `outcomeGrantResolve` exit; it does not modify `driveSyntheticCompletion`. Phases 2-4 of this spec depend on 179 being live.
- **No inner-preview opponent option refs.** `preview.option.delta.victory.currentMargin.<seat>` (and friends) is a real gap (`policy-preview-inner.ts:98-148` is self-only) but is a distinct, larger spec. Deferred (see §8).
- **No evolution-library migration.** ChatGPT-Pro's proposed `hurtCurrentLeader`/`reduceNearestThreat`/`avoidHelpingCurrentLeader`/etc. cookbook entries are useful but live in a separate cookbook+profile-migration spec; this spec ships exactly two FITL ARVN witness considerations to prove the surface works.
- **No game-specific engine logic.** Role primitives are derived from `def.terminal.ranking` + `def.terminal.margins`; FITL, Texas Hold'em, and any future game all use the same resolution code.
- **No raising of any cap class.** `standard256`, `deep1024` (Spec 164) and Spec 179's new post-grant `extraDepthCap` remain unchanged.
- **No `allies`/`teams` semantics.** Spec 122 deferred this; Spec 180 inherits the same deferral.

## 3. Context (verified against codebase)

### 3.1 The outer-preview silent-0 gap

`packages/engine/src/agents/policy-evaluation-core.ts:1447-1487` evaluates `seatAgg`:

```ts
for (const seatId of resolvedSeats) {
  const value = this.evaluateExpr(node.expr); // with currentSeatContext = seatId
  if (typeof value === 'number') values.push(value);
}
switch (node.aggOp) {
  case 'sum':   return values.reduce((a, b) => a + b, 0);   // empty → 0
  case 'count': return values.length;                        // empty → 0
  case 'min':   return values.length === 0 ? undefined : Math.min(...values);
  case 'max':   return values.length === 0 ? undefined : Math.max(...values);
}
```

Per-seat evaluation that returns `undefined` (preview ref unavailable: `depthCap`, `hidden`, `stochastic`, `unresolved`, `failed`, `gated`) is silently dropped from `values`. For `sum`/`count`, the aggregate then returns numeric `0` — indistinguishable from "every opponent's projected margin really is zero". This is exactly the Foundation #20 violation Spec 162 closed for the inner-preview chooseN path, except it lives one architectural layer up.

The hazard becomes load-bearing after Spec 179 lands: profile authors writing `seatAgg(over: opponents, expr: preview.victory.currentMargin.$seat, aggOp: sum)` will get genuine numeric signal for most decisions (the drive can now see opponent effects) but a numeric `0` masquerading as "neutral opponent state" when the post-grant continuation itself hits `extraDepthCap`. Without integrity, `arvn-evolved`'s denial considerations can flip-flop between "real opponent harm" and "depth-capped pretending to be neutral" with no trace differentiation.

### 3.2 Per-seat trace observability gap

`packages/engine/src/agents/policy-eval.ts` tracks per-decision `previewUsage` with `readyRefStats` (per ref name, aggregate ready/cand counts) and per-candidate `previewDrive.kind`. It does NOT track per-candidate × per-seat status. The trigger report (`reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md`) had to write a custom aggregation script over `trace-*.json` to produce the per-seat readyRefStats table that diagnosed the bug; the next operator investigating an opponent-preview anomaly will have to do the same work from scratch.

This is the same "infrastructure exists at one scope but not the other" pattern Spec 162 closed: per-ref availability tracking infrastructure (`PolicyEvaluationCandidate.unknownPreviewRefs`, `PreviewOptionRefStatus`) is already in place; the outer-preview path just doesn't materialize the per-candidate × per-seat view.

### 3.3 Authoring ergonomics gap

`data/games/fire-in-the-lake/92-agents.md` defines `selfMargin`, `selfRank`, `projectedSelfMargin`, `projectedSelfRank` — all `self`-scoped. To author "reduce nearest threat" today requires:

```yaml
# Current approach — works, but verbose and game-coupled in spirit
nearestThreatMarginCurrent:
  expr:
    seatAgg: { over: opponents, expr: { ref: victory.currentMargin.$seat }, aggOp: max }
nearestThreatMarginProjected:
  expr:
    seatAgg: { over: opponents, expr: { ref: preview.victory.currentMargin.$seat }, aggOp: max }
nearestThreatMarginDelta:
  expr: { sub: [{ ref: feature.nearestThreatMarginCurrent }, { ref: feature.nearestThreatMarginProjected }] }
```

The author has to know that `aggOp: max` over `opponents` happens to mean "leader" only under `ranking.order: desc` semantics, and inverts under `asc`. Encoding the role explicitly (`role: nearestThreat`) lets the engine apply `terminal.ranking.order` correctly across games.

### 3.4 Code anchors

| File:line | Role |
|---|---|
| `packages/engine/src/agents/policy-evaluation-core.ts:1447-1487` | `seatAgg` evaluator — silent-0 site for `sum`/`count`. |
| `packages/engine/src/agents/policy-expr.ts:1316-1444` | `seatAgg` IR + static analyzer (extend with `availability`, `role`). |
| `packages/engine/src/agents/policy-surface.ts:25-28, 207-238, 448-503` | `PolicyVictorySurface`, seat-token parser, `buildPolicyVictorySurface`. |
| `packages/engine/src/agents/policy-eval.ts:209, 269, 554, 893, 1046, 1236, 1248` | `previewUsage`, `readyRefStats` (extend with per-seat matrix). |
| `packages/engine/src/agents/policy-preview.ts:163-171` | `PolicyPreviewTraceOutcome` taxonomy (ready/stochastic/depthCap/hidden/unresolved/failed/gated/noPreviewDecision/random) — reuse. |
| `packages/engine/src/kernel/types-core.ts:443` | `AgentPolicyExpr` union — `seatAgg` variant extended in-place, no new variant. |
| `packages/engine/src/cnl/compile-agents.ts`, `validate-agents.ts` | Compiler/validator wiring for new fields. |
| `packages/engine/schemas/*.json` | Regenerated schema artifacts. |
| `docs/agent-dsl-cookbook.md` | Addendum for `availability`, `role`, named role primitives. |
| `docs/FOUNDATIONS.md` | Foundation #20 Appendix line updated to credit Spec 180 with the outer-preview extension. |

## 4. Architecture

Three independently-testable pillars.

### 4.1 Status-aware `seatAgg` for preview refs (Foundation #20 — outer-preview)

Extend `seatAgg` with an `availability` field:

```yaml
seatAgg:
  over: opponents
  expr: { ref: preview.victory.currentMargin.$seat }
  aggOp: sum
  availability: requireAllReady   # NEW; default for new authoring; back-compat default is skipUnavailable
```

| Mode | Semantics | Trace contribution |
|---|---|---|
| `requireAllReady` | If any per-seat evaluation returns unavailable, the aggregate returns unavailable (registered into `candidate.unknownPreviewRefs` with reason = worst per-seat reason). Requires explicit `previewFallback` per Spec 162. | Per-seat statuses recorded; aggregate flagged unavailable. |
| `requireAnyReady` | If at least one per-seat evaluation is ready, aggregate uses only ready cells; trace records skipped seats with reasons. | Per-seat statuses recorded; aggregate ready, partial. |
| `skipUnavailable` (back-compat default for existing profiles) | Current behavior preserved — non-numeric values silently skipped. **Compiler emits an advisory** when this mode is implicit on a preview-derived `seatAgg`, prompting the author to choose explicitly. | Per-seat statuses still recorded (Pillar 4.2) so the silence is no longer invisible. |
| `selfAndTargetReady` (used with `role:`) | Self cell and the role-selected seat cell must both be ready; other cells irrelevant. | Per-seat statuses recorded; aggregate ready or unavailable. |

The default for new authoring is `requireAllReady`; existing profiles keep `skipUnavailable` semantics (the advisory is the migration nudge, not a hard break — Spec 162 already migrated profiles to explicit `previewFallback` for the inner-preview path; the outer-preview migration is the natural next step for any author scoring preview seat-aggregates).

The compiler diagnostic `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` (Spec 162) is extended to fire when a consideration's `value` chain reaches a preview-derived `seatAgg` with `availability != skipUnavailable` and no `previewFallback` declared. `skipUnavailable` retains the legacy "silent-0" semantics so existing profiles do not break at compile time; the advisory path nudges migration.

### 4.2 Per-candidate × per-seat trace matrix

Add to `previewUsage` (engine-side; surfaces in `trace-*.json`):

```json
"previewUsage": {
  "readyRefStats": { ... existing aggregate ... },
  "seatMatrix": {
    "byCandidate": {
      "<stableMoveKey>": {
        "perSeatRefs": {
          "preview.victory.currentMargin": {
            "nva": { "status": "ready", "value": 4 },
            "vc":  { "status": "depthCap" },
            "us":  { "status": "ready", "value": -2 }
          }
        }
      }
    }
  }
}
```

Constraints:
- **Materialized only on demand.** The matrix is built only when the active consideration set requests at least one `preview.*.<seat>` ref via a `seatAgg` (otherwise the existing scalar `readyRefStats` is sufficient). Avoids unbounded trace growth on profiles that do not author opponent considerations.
- **Bounded by `O(candidatePreviewCap × seats × requestedPerSeatRefs)`.** No kernel-hot-path object additions; the matrix lives in evaluation-side trace metadata, mirroring the `unknownPreviewRefs` placement used by Spec 162.
- **Reuses the `PolicyPreviewTraceOutcome` taxonomy.** No new statuses introduced.

### 4.3 Named role primitives

Add four terminal-ranking-derived seat selectors usable inside `seatAgg.over` and as direct seat tokens:

| Role | Resolved from | Semantics |
|---|---|---|
| `currentLeader` | `victory.currentMargin` ranked by `def.terminal.ranking.order` + tie-break order | Opponent (or self, if `over: all`) with the best current standing. |
| `nearestThreat` | Same, but always excludes self | Opponent closest to winning under the game's ranking order; normalizes asc/desc so "threat" always means "better terminal standing". |
| `closestAhead` | Same | Opponent immediately ahead of self in current rank. |
| `closestBehind` | Same | Opponent immediately behind self. |

Authoring forms:

```yaml
# Form 1 — as ref seat token
expr: { ref: victory.currentMargin.role:currentLeader }

# Form 2 — as seatAgg.over filter (single-seat aggregate; equivalent to a ref but allows aggOp: count for "is the leader resolvable")
seatAgg:
  over: { role: nearestThreat }
  expr: { ref: preview.victory.currentMargin.$seat }
  aggOp: min
  availability: selfAndTargetReady
```

Resolution is deterministic via the existing `def.terminal.ranking` tie-break chain. If no seat resolves (e.g., 1-seat game, or all opponent cells unavailable in projected scope when resolving from `preview.*`), the role is `unresolved` and any aggregate using it follows the chosen `availability` mode.

### 4.4 Foundations alignment

- **Foundation #1 (Engine-Agnosticism)**: Role primitives derived from `def.terminal.ranking` — game-supplied, not engine-coded. No FITL/Hold'em branches.
- **Foundation #10 (Bounded Computation)**: Matrix bounded by `candidatePreviewCap × seats × requestedRefs`; no cap raise; no new ref families.
- **Foundation #15 (Architectural Completeness)**: Closes the outer-preview half of the silent-0 gap Spec 162 closed for inner-preview.
- **Foundation #20 (Preview Signal Integrity)**: Extended from inner-preview to outer-preview `seatAgg`. Appendix line updated.

## 5. Phases

| Phase | Scope | Acceptance | Effort |
|---|---|---|---|
| **0 — Audit current `seatAgg` silent-0 behavior** | Add an architectural-invariant test that pins current behavior: a `seatAgg(sum, over: opponents, expr: preview.X.$seat)` with all per-seat values unavailable returns numeric `0` and contributes to the score. Records the bug as a witness so Phase 1 can prove the fix. | Test added at `packages/engine/test/architecture/preview-integrity/spec-180-outer-preview-silent-zero-witness.test.ts` (`@test-class: convergence-witness`, `@witness: spec-180-outer-preview-silent-zero`). Passes today; Phase 1 flips it to verify the new contract. | XS |
| **1 — Status-aware `seatAgg`** | Extend `seatAgg` IR with `availability` field; extend evaluator to surface per-seat status; extend compiler diagnostic; emit advisory for legacy `skipUnavailable` default on preview-derived aggregates. | (a) New `availability` field accepted by compiler+validator; legacy profiles compile under `skipUnavailable` default + advisory. (b) `requireAllReady` causes preview-derived aggregate to return unavailable and register the consideration via `previewFallback` per Spec 162. (c) Architectural-invariant test at `spec-180-outer-preview-availability.test.ts` proves the four modes. (d) Schema artifacts regenerated. | M |
| **2 — Per-candidate × per-seat trace matrix** | Materialize `previewUsage.seatMatrix.byCandidate.<key>.perSeatRefs.<refName>.<seatId>` when the active consideration set requests preview seat-aggregates. Cap by `candidatePreviewCap × seats × requestedRefs`. | (a) Architectural-invariant test confirms matrix shape and presence. (b) Trace-shape regression test pins the JSON schema. (c) Off-by-default for profiles without preview seat-aggregates (no `seatMatrix` block emitted in that case). (d) Replay-determinism test (same seed → byte-identical matrix). | S–M |
| **3 — Named role primitives** | Add `currentLeader`, `nearestThreat`, `closestAhead`, `closestBehind` resolvers from `def.terminal.ranking`. Both ref form (`role:currentLeader`) and `seatAgg.over: { role: ... }` form supported. | (a) Generic 4-seat test fixture confirms each role resolves correctly under both `ranking.order: asc` and `desc`. (b) `unresolved` role propagates through the chosen `availability` mode. (c) Compiler validates `role:` tokens against the four-role enum. | S–M |
| **4 — FITL ARVN witness + cookbook addendum** | Re-run the Spec 179 Phase 2 witness with two added `arvn-evolved` considerations using the new surface: `hurtCurrentLeader` and `reduceNearestThreat` (both using `role:` + `availability: selfAndTargetReady` + explicit `previewFallback: noContribution`). Update `docs/agent-dsl-cookbook.md` with the new `availability`/`role`/`seatMatrix` surfaces. | (a) Witness: `hurtCurrentLeader` and `reduceNearestThreat` differentiate ARVN candidates on ≥ 30% of main-phase decisions where opponent margins shift post-grant (lower bound than 179's 50% because role-selection narrows the contributing seats; the looser bound proves the surface works without claiming it eclipses 179's mechanical fix). (b) Cookbook addendum lands. (c) FOUNDATIONS Appendix line for Spec 180 added. | S–M |

Phase 1 is independently mergeable (no trace shape change, no role primitives). Phase 2 depends on Phase 1 (per-seat status entries are the matrix's source data). Phase 3 depends on Phase 1 (`availability: selfAndTargetReady` requires per-seat status). Phase 4 depends on Spec 179 being live (the witness has no opponent signal otherwise). Phases 1-3 can land before Spec 179 if needed; Phase 4 is the integration gate.

## 6. Acceptance Gate Summary

A profile that authors `seatAgg(over: opponents, expr: preview.X.$seat, availability: requireAllReady, ...)` without `previewFallback` MUST fail to compile with `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK`. A profile that authors the same with explicit `previewFallback: noContribution` MUST evaluate the aggregate as unavailable (no contribution) when any per-seat cell is unavailable, and the trace MUST record per-seat statuses. The FITL ARVN witness MUST produce role-resolution traces naming the leader/threat seat per decision and differentiating the chosen denial considerations on the lower-bounded fraction of decisions defined in Phase 4. No FITL-specific engine code is introduced; no new compiled IR variant; no kernel signature change.

## 7. Foundation Alignment

| Foundation | Alignment |
|---|---|
| #1 (Engine-Agnosticism) | Reinforced — role resolution reads `def.terminal.ranking`, no game-specific code |
| #4 (Authoritative state and observer views) | Unaffected |
| #5 (One Rules Protocol, Many Clients) | Unaffected |
| #8 (Determinism) | Reinforced — matrix and role resolution are deterministic; replay test pins it |
| #9 (Replay, Telemetry, Auditability) | Reinforced — per-seat statuses surface in trace |
| #10 (Bounded Computation) | Unchanged — matrix bounded by candidates × seats × requested refs; no cap raise |
| #12 (Compiler-Kernel Validation Boundary) | Reinforced — extended diagnostic catches the outer-preview silent-fallback bug at compile time |
| #14 (No Backwards Compatibility) | Honored within the spec — `skipUnavailable` legacy default exists only as a migration advisory; if Phase 4 surfaces no live profile relying on it, Phase 4 ticket may flip the default outright |
| #15 (Architectural Completeness) | Direct goal — closes the outer-preview half of the silent-zero gap |
| #16 (Testing as Proof) | Direct goal — witness + four architectural invariants |
| #19 (Decision-Granularity Uniformity) | Reinforced — outer-preview seat-aggregates now obey the same integrity contract as inner-preview option refs |
| **#20 (Preview Signal Integrity)** | **Extended by this spec** to the outer-preview seat-aggregate path; Appendix amended |

## 8. Out of Scope (Cross-Reference)

- **Inner-preview opponent option refs** (`preview.option.delta.victory.currentMargin.<seat>`). `policy-preview-inner.ts:98-148` is self-only. Real gap; separate spec. The ARVN witness gains less from this than from the outer-preview fix because ARVN's denial selection happens at action selection (outer), not microturn target selection (inner). A future spec should add this only after a witness shows it materially differentiates a profile that the outer-preview surface cannot.
- **`standingRef` / `standingAgg` as separate compiled IR.** ChatGPT-Pro proposal §6.3. Would duplicate Spec 122's `seatAgg` surface. Deferred — adopt only if the extended `seatAgg` proves insufficient under live witness load.
- **Full standing-vector data model** (per-seat current/projected/delta margin AND rank rows with provenance objects). ChatGPT-Pro proposal §6.1. Most of its observability value is captured by Pillar 4.2's matrix. The remaining structured-provenance shape can land as a follow-up if the matrix turns out to be insufficient for diagnostic tooling.
- **Evolution library migration** of `arvn-evolved` / `vc-evolved` profiles with `preferOwnProjectedMarginDelta` / `preferOwnRankGain` / `avoidHelpingCurrentLeader` / `bestOpponentMarginReduction` / `preferDefensiveWhenOwnFlat` / `preferRankImprovementWhenMarginFlat`. Cookbook+profile-migration spec; not blocked by 180.
- **`allies` / `teams` semantics.** Spec 122's deferral inherited.
- **Replacing `seatAgg` with `standingAgg`.** Both ChatGPT-Pro and this spec agree they should co-exist; this spec keeps `seatAgg` and extends it in-place rather than parallel-tracking.
- **Spec 179's drive-boundary work.** Owned by 179; this spec does not touch `driveSyntheticCompletion`.

## 9. Open Questions

1. **Extend `seatAgg` vs. parallel `standingAgg` operator.** This spec recommends extension to avoid duplicating IR. If during Phase 1 the field count on `seatAgg` proves unwieldy (`over`, `expr`, `aggOp`, `availability`, `role`, `tieBreak`), a parallel `standingAgg` is the fallback. Decision deferred to Phase 1 implementer's judgment; the externally-observable behavior is the same either way.
2. **Default `availability` for new authoring.** This spec proposes `requireAllReady`. Phase 4 may downgrade to `selfAndTargetReady` if the witness shows `requireAllReady` is too strict in the presence of one habitually-depthCapped seat. Either is acceptable; the constraint is that *no implicit* `skipUnavailable` reaches production profiles after Phase 4.
3. **`seatMatrix` field name.** `seatMatrix` vs `perSeatPreview` vs `previewBySeat` — pick whichever matches the conventions in the schema artifact lane.
4. **Role-resolution caching.** Should `currentLeader` (resolved from current state) be cached at decision scope to avoid re-resolution per `seatAgg.over: { role: currentLeader }`? Likely yes; mark for Phase 3 implementer.
5. **Cross-game witness.** Texas Hold'em currently has no opponent-aware authoring (the conformance test runs a neutral shared-seat profile). The Phase 4 cookbook addendum should include a Texas Hold'em-shaped example (e.g., "fold when an opponent's projected pot equity exceeds threshold") so the surface is not perceived as FITL-only — but a live witness gate on Texas Hold'em is out of scope; FITL ARVN is the load-bearing witness.

## 10. Witness Substrate

For Phase 4 (depends on Spec 179 having landed):

```bash
cd <repo-root>
# Phase 4 witness — re-add two role-based considerations to arvn-evolved on top of 179's outcomeGrantContinuation opt-in
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs \
  --seeds 15 --trace-default all --concurrency 8
node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs
```

Plus a custom aggregation node script over `campaigns/fitl-arvn-agent-evolution/traces/trace-*.json` that produces the per-candidate × per-seat matrix from `previewUsage.seatMatrix`, so before/after comparisons against the 179 baseline use identical methodology. The script is a candidate for promotion into `packages/engine/test/fixtures/` so future opponent-preview investigations reuse it (per the brainstorm Step 1.5 disposition rule).

## 11. Notes for `/spec-to-tickets`

Suggested ticket decomposition:

- `180STDVECOBSROL-001` — Phase 0 witness (silent-zero pin) + Foundation #20 Appendix line draft.
- `180STDVECOBSROL-002` — Phase 1 status-aware `seatAgg` (IR + evaluator + compiler diagnostic + four-mode test).
- `180STDVECOBSROL-003` — Phase 2 `previewUsage.seatMatrix` (materialization + trace-shape regression + replay determinism).
- `180STDVECOBSROL-004` — Phase 3 named role primitives (resolvers + ref form + `seatAgg.over: { role: ... }` form + asc/desc fixture).
- `180STDVECOBSROL-005` — Phase 4 FITL ARVN witness + cookbook addendum + FOUNDATIONS Appendix amendment.

Tickets 1-4 are mergeable in any order after 1; ticket 5 depends on Spec 179 having landed in addition to tickets 1-4 of this spec.

## 12. Reassessment of Source Proposal (`reports/spec-179-remediation.md`)

ChatGPT-Pro's deep-research proposal is reassessed against the codebase per the external-LLM analysis rule. Per-recommendation dispositions:

| Recommendation | Disposition | Rationale |
|---|---|---|
| Replace Spec 179 wholesale with "Spec 179R" standing-vector model | **Rejected** | Spec 179's mechanical fix (lift `outcomeGrantResolve` drive exit) IS the correct fix for the witness gap. The trigger report's trace data shows opponent refs are *requested AND ready at 75.3%* with uniform values — the cause is the drive boundary, not status fidelity. ChatGPT-Pro could not access Spec 179 or the trigger report through its Git connector; its replacement verdict was against an imagined "candidate solution class," not the real spec. |
| Standing-vector observability (per-seat status preserved through aggregates) | **Adopted with adjustment (Pillar 4.1)** | Concept is right and matches Foundation #20's principle. Implemented as `seatAgg.availability` extension rather than a parallel `standingAgg` operator — avoids IR duplication. Spec 162 already established this contract for inner-preview; this spec extends it. |
| Candidate × seat preview matrix in trace | **Adopted (Pillar 4.2)** | Genuine observability gap. Materialized on demand, bounded by candidate × seat × requested-ref counts. Hot-path concerns flagged by ChatGPT-Pro's risk section are respected via the on-demand materialization rule. |
| Named role primitives (`currentLeader`, `nearestThreat`, `closestAhead`, `closestBehind`) | **Adopted (Pillar 4.3)** | Ergonomic upgrade for opponent-aware authoring; eliminates the `aggOp: max` + `over: opponents` boilerplate that silently inverts under `ranking.order: asc`. Resolved from `def.terminal.ranking`, no game-specific code. |
| New compiled IR nodes `standingRef` and `standingAgg` (parallel to `seatAgg`) | **Rejected (preferred extension over duplication)** | `seatAgg` IR can carry the new fields. Reduces blast radius and avoids two parallel surfaces for what is conceptually the same operation. If Phase 1 finds the field count unwieldy, Open Question §9.1 is the escape valve. |
| Full standing-vector data model with `StandingMetricStatus`, `StandingCell`, `CandidateStandingEvidence`, structured `provenance` objects | **Deferred** | Most of the observability value lands via the matrix (Pillar 4.2). Promoting per-cell provenance to a structured TypeScript type lattice may pay off later but is not load-bearing for opponent-aware authoring. Adopt only if downstream diagnostic tooling shows the matrix is insufficient. |
| Inner-preview opponent option refs (`preview.option.delta.standing.<seat>`) | **Deferred to follow-up spec** | Real gap (`policy-preview-inner.ts:98-148` is self-only) but a separate, larger architectural change. ARVN's denial selection happens at action selection (outer-preview), not microturn target selection; Spec 180 should ship and witness against outer-preview first. |
| Evolution library entries (`preferOwnProjectedMarginDelta`, `preferOwnRankGain`, `hurtCurrentLeader`, `reduceNearestThreat`, `avoidHelpingCurrentLeader`, `avoidHelpingNearestThreat`, `bestOpponentMarginReduction`, `preferDefensiveWhenOwnFlat`, `preferRankImprovementWhenMarginFlat`) | **Deferred to cookbook+profile spec** | Cookbook addendum + ARVN/VC profile migration is a substantial coordinated edit. Spec 180 ships exactly two of these (`hurtCurrentLeader`, `reduceNearestThreat`) to witness the surface; a follow-up spec migrates the rest. |
| Status taxonomy `{ready, hidden, stochastic, unresolved, failed, depthCap, gated, partial}` | **Adopted (reused)** | Already exists as `PolicyPreviewTraceOutcome` (`policy-preview.ts:163-171`). Spec 180 reuses this taxonomy verbatim; no new statuses. ChatGPT-Pro's `partial` status maps to existing `requireAnyReady`-aggregate behavior + per-seat trace cells. |
| Spec 15 cited as defining `victory.currentMargin.<seat>` and `preview.victory.currentMargin.<seat>` | **Corrected** | Spec 15 is the FITL scope/gaps spec. The per-seat victory IR was introduced in Spec 64 (decomposed victory metrics), exposed on the preview surface by Spec 113, and generalized to arbitrary seats via `$seat` in Spec 122. Citations in derivative work should reference 64/113/122. |
| `seatAgg` should be replaced by `standingAgg` | **Rejected (keep both — actually keep one extended)** | ChatGPT-Pro §12 itself answers "No. Keep both." Spec 180 goes one step further: keep `seatAgg` extended in-place, no parallel operator. Reduces surface area; same author-visible behavior. |
| Availability modes `requireAllReady`, `requireAnyReady`, `selfAndTargetReady`, `skipUnavailable` | **Adopted** | All four modes ship in Pillar 4.1. `skipUnavailable` is the back-compat default; the other three are the new explicit-availability options. |
| `tieBreak: terminalRanking | stableSeatId` field on aggregates | **Adopted implicitly via role primitive resolution** | Roles resolve via `def.terminal.ranking` tie-break chain. Explicit `tieBreak` on every `seatAgg` is overspecified — most aggregates don't need it. Surface in Open Question §9.1's "field count" decision; can be added if Phase 3 finds a witness case requiring it. |
| External research citations (MaxN, GGP, OpenSpiel, AlphaStar, COIN) | **Acknowledged as context** | Useful framing for why a standing-vector evaluation model is well-precedented. None directly drive an IR decision in this spec — Spec 180's design choices are codebase-grounded — but the citations strengthen the case for the surface being game-agnostic. |
| `Risk: opponent-margin signals may still be genuinely unavailable at root action-selection scope` (ChatGPT-Pro §12) | **Resolved by Spec 179, not Spec 180** | Spec 179's drive-boundary lift is what produces opponent-effect signal. Spec 180 makes the signal observable and ergonomically authorable; it does not produce the signal. This dependency is the load-bearing reason Spec 180's Phase 4 cannot run until Spec 179 lands. |
