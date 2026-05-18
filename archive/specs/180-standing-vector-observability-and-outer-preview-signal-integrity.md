# Spec 180 — Standing-Vector Observability and Ordinary-Operation Preview Signal Integrity

**Status**: COMPLETED
**Priority**: High — `archive/tickets/179ACTSELPRE-009.md` selected this spec as the bounded generic successor after production FITL event/free-operation routing failed to provide a closing `outcomeGrantResolve` witness.
**Complexity**: M–L — one signal-production pillar plus observability/ergonomics pillars; each phase remains independently mergeable after the Phase 0 witness locks the contract.
**Date**: 2026-05-17
**Dependencies**:
- `archive/specs/179-action-selection-preview-outcome-grant-opt-in.md` (synthetic `outcomeGrantResolve` substrate only; production ordinary-operation visibility was deferred here by `archive/tickets/179ACTSELPRE-009.md`)
- `archive/specs/162-preview-signal-integrity.md` (Foundation #20 introduced for inner-preview; this spec extends it to the outer-preview `seatAgg` aggregate path)
- `archive/specs/122-cross-seat-victory-aggregation.md` (`seatAgg`, `$seat`, `over: opponents` IR — substrate this spec extends, not replaces)
- `archive/specs/113-preview-state-policy-surface.md` (per-seat preview surface — substrate)
- `archive/specs/164-continued-inner-preview-deepening.md` (cap-class registry pattern — model for any added availability mode names)

**Trigger reports**:
- `reports/spec-179-remediation.md` (external-LLM deep-research proposal reassessed by this spec — see §12)
- `reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md` (origin gap report; original `outcomeGrantResolve` hypothesis narrowed by tickets 007/008; ordinary-operation visibility now owned here)

**Ticket namespace**: `180STDVECOBSROL` (finalized by `archive/tickets/179ACTSELPRE-009.md`)

---

## 1. Goal

Four small architectural upgrades to the outer-preview surface that, taken together, make opponent-aware policy authoring honest, debuggable, and ergonomic across games — without adding new compiled IR or duplicating Spec 122's `seatAgg`:

1. **Bounded ordinary-operation standing projection.** Spec 179 can continue through synthetic `outcomeGrantResolve` frames, but current production FITL ordinary operations and event/free-operation grants do not publish the frame needed to close the ARVN opponent-margin witness. Add a generic standing-projection route that observes candidate effects through the one-rules protocol with explicit bounded status, rather than a FITL branch or raw-effect shortcut.
2. **Outer-preview signal integrity.** Foundation #20's "unavailable preview refs MUST NOT silently coerce into numeric contributions" was wired through the inner-preview chooseN path by Spec 162. The Phase 0 witness proved that the outer-preview seat-aggregate path (`seatAgg(over: opponents, expr: preview.victory.currentMargin.$seat, aggOp: sum)`) silently returned `0` when every per-seat cell was unavailable. Close that gap and then add explicit author-facing availability controls.
3. **Per-candidate × per-seat trace matrix.** Today `previewUsage.readyRefStats` reports aggregate ready/cand ratios per ref name. Operators investigating which opponent's projected state shifted per candidate have no per-seat breakdown — the trigger report had to add a custom aggregation script. Bake the matrix into `previewUsage` so future opponent-preview investigations are first-class.
4. **Named role primitives.** Add `currentLeader`, `nearestThreat`, `closestAhead`, `closestBehind` as terminal-ranking-derived seat selectors usable inside `seatAgg.over` (or as standalone refs). Eliminates ad-hoc `aggOp: max` + `over: opponents` boilerplate when the author actually wants a single named role.

Foundation #20 is the load-bearing principle. The other pillars are signal production, observability, and authoring ergonomics, all bounded.

## 2. Non-Goals

- **No replacement for `seatAgg`.** `standingRef` and `standingAgg` as separate compiled IR nodes (ChatGPT-Pro proposal §6.3) are explicitly out of scope. `seatAgg` is extended with an `availability` field and a `role` binding; no new union variants are added to `AgentPolicyExpr`. See §12 for rationale.
- **No raw-effect preview shortcut.** Ordinary-operation signal production must use the generic published-decision / apply path. It must not evaluate `removeToken`, `moveToken`, or other effect handlers out of sequence, and it must not introduce FITL-specific engine branches.
- **No silent replacement of Spec 179.** The `outcomeGrantContinuation` substrate remains valid for synthetic or future production paths that actually publish `outcomeGrantResolve`; this spec owns the different ordinary-operation standing surface.
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

Before Phase 1, per-seat evaluation that returned `undefined` (preview ref unavailable: `depthCap`, `hidden`, `stochastic`, `unresolved`, `failed`, `gated`) was silently dropped from `values`. For `sum`/`count`, the aggregate then returned numeric `0` — indistinguishable from "every opponent's projected margin really is zero". This is exactly the Foundation #20 violation Spec 162 closed for the inner-preview chooseN path, except it lives one architectural layer up.

The all-unavailable hazard is load-bearing even before richer author-facing availability modes land: profile authors writing `seatAgg(over: opponents, expr: preview.victory.currentMargin.$seat, aggOp: sum)` must not receive numeric `0` masquerading as "neutral opponent state" when every per-seat preview cell is unavailable or capped. Without integrity, `arvn-evolved`'s denial considerations can flip-flop between "real opponent harm" and "unavailable/capped pretending to be neutral" with no trace differentiation.

### 3.2 The ordinary-operation signal-production gap

Spec 179 originally targeted the `outcomeGrantResolve` exit in `driveSyntheticCompletion`. Tickets 007 and 008 proved that this is not the production FITL ordinary-operation surface:

- ordinary ARVN operations (`patrol`, `sweep`, `assault`) are main-phase operation actions, not event/free-operation grant resolvers;
- event declarations can issue pending free-operation grants, but current production routing exposes those grants as free-operation `actionSelection` moves rather than `outcomeGrantResolve` frames;
- the only concrete constructed `outcomeGrantResolve` frame found in the repo is the synthetic architecture fixture at `packages/engine/test/architecture/preview-post-grant/post-grant-fixture.ts`.

The successor must therefore produce ordinary-operation standing signal by observing the generic decision/application path, not by pretending event/free-operation evidence proves ordinary operation effects. The selected route is an integrated standing projection under this spec, not a parallel `previewEffect.*` namespace.

### 3.3 Per-seat trace observability gap

`packages/engine/src/agents/policy-eval.ts` tracks per-decision `previewUsage` with `readyRefStats` (per ref name, aggregate ready/cand counts) and per-candidate `previewDrive.kind`. It does NOT track per-candidate × per-seat status. The trigger report (`reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md`) had to write a custom aggregation script over `trace-*.json` to produce the per-seat readyRefStats table that diagnosed the bug; the next operator investigating an opponent-preview anomaly will have to do the same work from scratch.

This is the same "infrastructure exists at one scope but not the other" pattern Spec 162 closed: per-ref availability tracking infrastructure (`PolicyEvaluationCandidate.unknownPreviewRefs`, `PreviewOptionRefStatus`) is already in place; the outer-preview path just doesn't materialize the per-candidate × per-seat view.

### 3.4 Authoring ergonomics gap

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

### 3.5 Code anchors

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

Four independently-testable pillars.

### 4.0 Bounded ordinary-operation standing projection

Add a standing-projection route for action-selection preview candidates. The route must:

1. start from a kernel-published action-selection candidate;
2. apply the candidate through the same one-rules protocol used by clients and agents (`applyPublishedDecision` / `applyTrustedMove` and subsequent published microturns);
3. drive only up to an explicit named projection cap and record that cap in trace metadata;
4. compute current/projected standing cells through the existing terminal margin/ranking machinery (`buildPolicyVictorySurface` and `def.terminal.ranking`), not through game-specific effect annotations;
5. return status-bearing cells (`ready`, `hidden`, `stochastic`, `unresolved`, `failed`, `depthCap`, `gated`) instead of silently producing scalar `0` when the projection cannot observe the relevant effect.

The public authoring contract remains centered on standing/victory refs and `seatAgg`:

- existing `preview.victory.currentMargin.<seat>` / `preview.victory.currentRank.<seat>` stay valid scalar aliases over ready standing cells;
- `preview.standing.margin.<seat>` / `preview.standing.rank.<seat>` may be introduced as clearer synonyms if Phase 1 needs a distinct namespace, but the first implementation should prefer preserving existing ref families unless the focused witness proves the old names cannot carry status safely;
- no separate `previewEffect.*` namespace lands unless Phase 0 proves the integrated standing projection cannot observe ordinary-operation effects without duplicating kernel effect semantics.

First proving witness before implementation:

- **Focused failing witness**: `packages/engine/test/architecture/preview-standing/spec-180-ordinary-operation-standing-projection-witness.test.ts`.
- **Generic invariant**: a four-seat synthetic fixture publishes two action-selection candidates; one candidate reaches an ordinary operation body that changes an opponent's terminal margin through the normal published-decision/apply path, while the other does not. Current code must show that the existing action-selection preview keeps the opponent standing scalar uniform or lacks per-seat status; the fixed surface must report a ready differentiated opponent standing cell for the value-bearing candidate and an explicit unavailable/capped status when the projection cap prevents observation.
- **FITL ARVN integration witness**: a bounded rerun over the existing ARVN action-selection witness (`arvn-evolved`, seeds 1000-1014 or the smallest validated subset in the implementing ticket) must classify `patrol` / `sweep` / `assault` ordinary-operation candidates by per-candidate standing cells and role-based considerations, without relying on `previewUsage.outcomeGrantContinuation.exitCounts`.

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
| `skipUnavailable` (migration default for existing profiles) | Partial legacy behavior preserved: non-numeric values are skipped when at least one ready cell exists. The all-unavailable case remains unavailable after Phase 1 and must use explicit fallback before contributing. **Compiler emits an advisory** when this mode is implicit on a preview-derived `seatAgg`, prompting the author to choose explicitly. | Per-seat statuses still recorded (Pillar 4.2) so skipped cells are no longer invisible. |
| `selfAndTargetReady` (used with `role:`) | Self cell and the role-selected seat cell must both be ready; other cells irrelevant. | Per-seat statuses recorded; aggregate ready or unavailable. |

The default for new authoring is `requireAllReady`; existing profiles keep `skipUnavailable` partial-ready semantics (the advisory is the migration nudge, not a hard break — Spec 162 already migrated profiles to explicit `previewFallback` for the inner-preview path; the outer-preview migration is the natural next step for any author scoring preview seat-aggregates). The all-unavailable silent-0 case is not preserved because Foundation #20 forbids unavailable preview refs from silently becoming numeric contributions.

The compiler diagnostic `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` (Spec 162) is extended to fire when a consideration's `value` chain reaches a preview-derived `seatAgg` with `availability != skipUnavailable` and no `previewFallback` declared. `skipUnavailable` retains legacy partial-ready skipping only; the advisory path nudges migration.

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
| **0 — Ordinary-operation witness + silent-0 pin** | Add the focused failing ordinary-operation standing-projection witness and preserve the current `seatAgg` silent-0 behavior as a bug witness. No production implementation yet. | (a) `spec-180-ordinary-operation-standing-projection-witness.test.ts` fails on current code for the generic ordinary-operation standing invariant. (b) `spec-180-outer-preview-silent-zero-witness.test.ts` records the current silent-0 bug. (c) Ticket/spec graph no longer routes ordinary-operation visibility through Spec 179. | XS–S |
| **1 — Bounded standing projection route** | Implement the generic standing-projection route described in §4.0, including named projection cap metadata, status-bearing cells, and the base Foundation #20 rule that all-unavailable preview-derived standing aggregates remain unavailable instead of contributing numeric `0`. | (a) Phase 0 generic witness turns green. (b) Existing `preview.victory.*` scalar refs remain unchanged for ready cells. (c) Unavailable/capped projected standing never contributes as numeric `0` without explicit fallback. | M |
| **2 — Status-aware `seatAgg`** | Extend `seatAgg` IR with `availability` field; extend evaluator to surface per-seat status for explicit partial-availability modes; extend compiler diagnostic; emit advisory for migration-default `skipUnavailable` on preview-derived aggregates. | (a) New `availability` field accepted by compiler+validator; legacy profiles compile under `skipUnavailable` default + advisory while preserving Phase 1's all-unavailable no-contribution behavior. (b) `requireAllReady` causes preview-derived aggregate to return unavailable and register the consideration via `previewFallback` per Spec 162. (c) Architectural-invariant test at `spec-180-outer-preview-availability.test.ts` proves the four modes. (d) Schema artifacts regenerated. | M |
| **3 — Per-candidate × per-seat trace matrix** | Materialize `previewUsage.seatMatrix.byCandidate.<key>.perSeatRefs.<refName>.<seatId>` when the active consideration set requests preview seat-aggregates or standing projection. Cap by `candidatePreviewCap × seats × requestedRefs`. | (a) Architectural-invariant test confirms matrix shape and presence. (b) Trace-shape regression test pins the JSON schema. (c) Off-by-default for profiles without preview seat-aggregates/standing projection (no `seatMatrix` block emitted). (d) Replay-determinism test (same seed → byte-identical matrix). | S–M |
| **4 — Named role primitives** | Add `currentLeader`, `nearestThreat`, `closestAhead`, `closestBehind` resolvers from `def.terminal.ranking`. Both ref form (`role:currentLeader`) and `seatAgg.over: { role: ... }` form supported. | (a) Generic 4-seat test fixture confirms each role resolves correctly under both `ranking.order: asc` and `desc`. (b) `unresolved` role propagates through the chosen `availability` mode. (c) Compiler validates `role:` tokens against the four-role enum. | S–M |
| **5 — FITL ARVN witness + cookbook addendum** | Re-run the ordinary-operation ARVN witness with two added `arvn-evolved` considerations using the new surface: `hurtCurrentLeader` and `reduceNearestThreat` (both using `role:` + `availability: selfAndTargetReady` + explicit `previewFallback: noContribution`). Update `docs/agent-dsl-cookbook.md` with the new projection/availability/role/seatMatrix surfaces. | (a) Witness: `hurtCurrentLeader` and `reduceNearestThreat` differentiate ARVN ordinary-operation candidates on ≥ 30% of main-phase decisions where opponent margins shift through the standing projection. (b) Cookbook addendum lands. (c) FOUNDATIONS Appendix line for Spec 180 added. | S–M |

Phase 0 is the implementation precondition. Phase 1 produces ordinary-operation signal and prevents the all-unavailable standing path from becoming silent numeric score. Phase 2 adds explicit author-facing availability modes and partial-availability semantics. Phase 3 makes the per-seat evidence inspectable. Phase 4 adds role ergonomics. Phase 5 is the FITL integration gate and does not depend on production `outcomeGrantResolve` activation.

## 6. Acceptance Gate Summary

A profile that authors `seatAgg(over: opponents, expr: preview.X.$seat, availability: requireAllReady, ...)` without `previewFallback` MUST fail to compile with `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK`. A profile that authors the same with explicit `previewFallback: noContribution` MUST evaluate the aggregate as unavailable (no contribution) when any per-seat cell is unavailable, and the trace MUST record per-seat statuses. The FITL ARVN witness MUST produce role-resolution traces naming the leader/threat seat per decision and differentiating the chosen denial considerations on the lower-bounded fraction of decisions defined in Phase 5. No FITL-specific engine code is introduced; no new compiled IR variant; no kernel signature change.

## 7. Foundation Alignment

| Foundation | Alignment |
|---|---|
| #1 (Engine-Agnosticism) | Reinforced — role resolution reads `def.terminal.ranking`, no game-specific code |
| #4 (Authoritative state and observer views) | Unaffected |
| #5 (One Rules Protocol, Many Clients) | Unaffected |
| #8 (Determinism) | Reinforced — matrix and role resolution are deterministic; replay test pins it |
| #9 (Replay, Telemetry, Auditability) | Reinforced — per-seat statuses surface in trace |
| #10 (Bounded Computation) | Reinforced — standing projection has a named cap; matrix bounded by candidates × seats × requested refs; no cap raise |
| #12 (Compiler-Kernel Validation Boundary) | Reinforced — extended diagnostic catches the outer-preview silent-fallback bug at compile time |
| #14 (No Backwards Compatibility) | Honored within the spec — `skipUnavailable` legacy default exists only as a migration advisory; if Phase 4 surfaces no live profile relying on it, Phase 4 ticket may flip the default outright |
| #15 (Architectural Completeness) | Direct goal — moves ordinary-operation visibility into a generic standing projection and closes the outer-preview half of the silent-zero gap |
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
2. **Default `availability` for new authoring.** This spec proposes `requireAllReady`. Phase 5 may downgrade the witness profile to `selfAndTargetReady` if the witness shows `requireAllReady` is too strict in the presence of one habitually depth-capped seat. Either is acceptable; the constraint is that *no implicit* `skipUnavailable` reaches production profiles after Phase 5.
3. **`seatMatrix` field name.** `seatMatrix` vs `perSeatPreview` vs `previewBySeat` — pick whichever matches the conventions in the schema artifact lane.
4. **Role-resolution caching.** Should `currentLeader` (resolved from current state) be cached at decision scope to avoid re-resolution per `seatAgg.over: { role: currentLeader }`? Likely yes; mark for Phase 3 implementer.
5. **Cross-game witness.** Texas Hold'em currently has no opponent-aware authoring (the conformance test runs a neutral shared-seat profile). The Phase 5 cookbook addendum should include a Texas Hold'em-shaped example (e.g., "fold when an opponent's projected pot equity exceeds threshold") so the surface is not perceived as FITL-only — but a live witness gate on Texas Hold'em is out of scope; FITL ARVN is the load-bearing witness.

## 10. Witness Substrate

For Phase 5:

```bash
cd <repo-root>
# Phase 5 witness — add two role-based considerations to arvn-evolved using the standing-projection surface
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs \
  --seeds 15 --trace-default all --concurrency 8
node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs
```

Plus a custom aggregation node script over `campaigns/fitl-arvn-agent-evolution/traces/trace-*.json` that produces the per-candidate × per-seat matrix from `previewUsage.seatMatrix`, so before/after comparisons against the 179 baseline use identical methodology. The script is a candidate for promotion into `packages/engine/test/fixtures/` so future opponent-preview investigations reuse it (per the brainstorm Step 1.5 disposition rule).

## 11. Ticket Chain

Ticket decomposition created by `archive/tickets/179ACTSELPRE-009.md`:

- [`archive/tickets/180STDVECOBSROL-001.md`](../archive/tickets/180STDVECOBSROL-001.md) — Phase 0 witness (ordinary-operation standing-projection failing witness + silent-zero pin).
- [`archive/tickets/180STDVECOBSROL-002.md`](../archive/tickets/180STDVECOBSROL-002.md) — Phase 1 bounded standing-projection route.
- [`archive/tickets/180STDVECOBSROL-003.md`](../archive/tickets/180STDVECOBSROL-003.md) — Phase 2 status-aware `seatAgg` (IR + evaluator + compiler diagnostic + four-mode test).
- [`archive/tickets/180STDVECOBSROL-004.md`](../archive/tickets/180STDVECOBSROL-004.md) — Phase 3 `previewUsage.seatMatrix` (materialization + trace-shape regression + replay determinism).
- [`archive/tickets/180STDVECOBSROL-005.md`](../archive/tickets/180STDVECOBSROL-005.md) — Phase 4 named role primitives (resolvers + ref form + `seatAgg.over: { role: ... }` form + asc/desc fixture).
- [`archive/tickets/180STDVECOBSROL-006.md`](../archive/tickets/180STDVECOBSROL-006.md) — Phase 5 FITL ARVN witness + cookbook addendum + FOUNDATIONS Appendix amendment.

Tickets 2-4 depended on ticket 1; ticket 5 depended on ticket 3; ticket 6 depended on tickets 2-5. All six phase tickets are archived. No phase depends on production `outcomeGrantResolve` activation.

## 12. Reassessment of Source Proposal (`reports/spec-179-remediation.md`)

ChatGPT-Pro's deep-research proposal is reassessed against the codebase per the external-LLM analysis rule. Per-recommendation dispositions:

| Recommendation | Disposition | Rationale |
|---|---|---|
| Replace Spec 179 wholesale with "Spec 179R" standing-vector model | **Partially adopted after tickets 007-009** | Spec 179's mechanical fix remains valid for synthetic/future paths that actually publish `outcomeGrantResolve`, but it is not the production ordinary-operation witness. Spec 180 now owns the standing-vector successor while preserving Spec 179's narrower substrate. |
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
| `Risk: opponent-margin signals may still be genuinely unavailable at root action-selection scope` (ChatGPT-Pro §12) | **Adopted as Spec 180 Phase 0/1 owner** | Tickets 007/008 proved the risk against the production FITL witness. Spec 180 now owns the focused ordinary-operation standing-projection witness and the bounded generic signal-production route before observability and role ergonomics land. |

## Outcome (2026-05-18)

Status is complete. Spec 180 landed the bounded ordinary-operation standing projection, outer-preview signal integrity, per-candidate seat matrix, role primitives, FITL ARVN witness, cookbook/foundations updates, and the follow-up causal/action witness.

What landed:

- Phase 0 through Phase 5 are archived at `archive/tickets/180STDVECOBSROL-001.md` through `archive/tickets/180STDVECOBSROL-006.md`.
- The causal/action follow-up is archived at `archive/tickets/180STDVECOBSROL-007.md`.
- The implementation kept the standing route generic and avoided FITL-specific engine branches.
- The final ARVN profile uses the new role-standing signal through `hurtCurrentLeader` and `reduceNearestThreat`; ticket 007 retuned only those two standing weights to make the signal selected-action-causal in a bounded subset.

Verification and residual limits:

- Final engine package proof for ticket 007 passed with `pnpm -F @ludoforge/engine test`: schema artifacts check passed and `92 / 92` test files passed.
- Dependency proof passed with `pnpm run check:ticket-deps`.
- The ticket-007 retained witness proved `5 / 20` counterfactual selected-action flips and `3 / 16` targeted opponent-seat rows improved, with `0 / 16` worsened.
- The final 15-seed ARVN aggregate score remained worse than the ticket-006 witness, so this spec proves the opponent-standing signal is available and action-causal in a subset, not that the ARVN profile is globally stronger.
- Spec 179's production ordinary-operation goal is superseded by this completed standing-projection route; Spec 179's narrower synthetic `outcomeGrantResolve` substrate remains historical.
