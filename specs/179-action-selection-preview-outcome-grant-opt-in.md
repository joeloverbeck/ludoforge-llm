# Spec 179 — Action-Selection Preview: `outcomeGrantResolve` Opt-In

**Status**: PENDING
**Priority**: Medium — unblocks opponent-denial considerations in FITL (Patrol/Sweep/Assault) and any other game whose action effects live in `outcomeGrantResolve` frames; no current campaign can express the strategy without it.
**Complexity**: S–M — single bounded driver change with profile-side opt-in; phased measure-then-implement-then-document.
**Date**: 2026-05-17
**Dependencies**:
- `archive/specs/178-optimize-continued-deepening-inner-preview-orchestration.md` (perf substrate that makes deeper drive affordable on `arvn-evolved`)
- `archive/specs/171-visible-sequence-projection.md` (prior preview-surface contract work — surface visibility model)
- `archive/specs/164-*.md` (named cap-class registry — pattern this spec follows for cap-name opt-in)
**Trigger report**: `reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md`
**Ticket namespace**: `179POSTGRANTPREV` (proposal — finalized by `/spec-to-tickets`)

## 1. Goal

Allow profile authors to opt into an action-selection preview drive that continues past the first `outcomeGrantResolve` frame, up to a named extended depth cap, so that `preview.victory.currentMargin.<seat>` (and `preview.feature.X` for opponent-tied features) reflects the post-grant projected state of opponent margins after an ARVN candidate action resolves. Land the change with a profiling gate so the deeper drive does not regress the Spec 178 perf substrate.

## 2. Non-Goals

- **No default behavior change.** Profiles that do not opt in get the current bounded drive exactly as today; the `outcomeGrantResolve` exit remains the default.
- **No FITL-specific kernel change.** The opt-in surface and the drive extension are generic; FITL is the witness workload, not the change scope.
- **No kernel-API signature change** for non-agent callers. Only the policy-preview drive's exit conditions are extended; `applyMove`, `publishMicroturn`, and the kernel's per-frame resolution loop are unchanged.
- **No unbounded drive.** The post-grant continuation MUST itself be bounded by a named cap class (Foundation 10). Reusing `completionDepthCap` is allowed but should be re-thought given the extra work.
- **No change to `chooseNStep` inner-frontier continued-deepening** (already Spec 178 territory).
- **No automatic fall-through past `actionSelection` or `turnRetirement`.** Only `outcomeGrantResolve` becomes opt-in-extensible; the other current exits (next actionSelection, turn retirement, seat change, turn change) stay hard.
- **No new ref family.** `preview.victory.currentMargin.<seat>` and `preview.feature.X` continue to be the surface; only their resolved values change for profiles that opt in. Direction B (separate `previewEffect.*` surface, per report §"Proposed Fix Directions") is explicitly out of scope; profile authors who need post-grant visibility get it via the existing surface plus the new opt-in.

## 3. Context

### 3.1 Surfaced gap

`reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md` documented: across 427 ARVN actionSelection decisions × 15 seeds, `preview.victory.currentMargin.nva` is 100% uniform across candidates and `preview.victory.currentMargin.vc` is 95.5% uniform, while the self-margin control is 67.7% differentiating with average range 1.26. The engine accepts opponent seat tokens (`packages/engine/src/agents/policy-surface.ts:207-222`), and the preview engine does request and resolve the refs (84% of decisions, 75% ready/cand ratio), so this is not a depth-cap or rejection issue. The uniformity is structural: the drive exits on `outcomeGrantResolve` (`packages/engine/src/agents/policy-preview.ts:986-993`) before the opponent-piece-removing/activating effects of operations such as FITL Assault land in state. Profile authors who try to express opponent-denial strategies silently get dead-weight considerations.

### 3.2 Why a profile opt-in (not always-on)

Always-extending the drive past `outcomeGrantResolve` would:

- Regress the Spec 178 perf substrate by adding per-candidate effect-resolution work to every action-selection preview, including the common case (Govern/Train) where opponent margins genuinely don't change.
- Foundation 10 (Bounded Computation) is preserved by the existing `completionDepthCap`; lifting the `outcomeGrantResolve` exit without a separate budget would make the drive's wall-time cost grow with effect-chain complexity rather than with seat-turn count.
- Profiles that don't depend on opponent visibility see no benefit but pay the cost.

A profile-side opt-in (analogous to Spec 164's named cap-class pattern) lets opt-in profiles pay the cost when they have a use for the signal, and leaves opt-out profiles on the fast path.

### 3.3 Code anchors

| File:line | Role |
|---|---|
| `packages/engine/src/agents/policy-preview.ts:55` | `K_PREVIEW_DEPTH = 6` — current shared depth constant. |
| `packages/engine/src/agents/policy-preview.ts:864-1074` | `driveSyntheticCompletion(trustedMove)` — the bounded driver this spec extends. |
| `packages/engine/src/agents/policy-preview.ts:986-993` | Exit conditions; `ctxKind === 'outcomeGrantResolve'` becomes opt-in-extensible. |
| `packages/engine/src/agents/policy-preview.ts:608-610` | `completionPolicy`, `fallbackCompletionPolicy`, `completionDepthCap` — current profile-tunable preview controls; this spec adds one more. |
| `packages/engine/src/agents/policy-surface.ts:207-222` | Seat-token acceptance for `victory.currentMargin.<seatToken>`; unchanged. |
| `packages/engine/src/kernel/types.ts` | `AgentPreviewConfig` / `AgentPreviewBudget` schema; extend with the opt-in field. |
| `packages/engine/src/cnl/compile-agents.ts`, `validate-agents.ts`, `game-spec-doc.ts` | Compiler & validator paths that surface profile preview config; thread the new field through. |
| `packages/engine/schemas/*.json` | Schema artifacts that need the new field. |
| `docs/agent-dsl-cookbook.md:108-122` | Preview Refs documentation; updated in Phase 2. |

### 3.4 Witness workload

FITL ARVN with the `arvn-evolved` profile, tier 15 (15 seeds, 1000-1014). The pre-opt-in trace data is exp-002 from `campaigns/fitl-arvn-agent-evolution/results.tsv` (this spec's trigger campaign). The post-opt-in witness is a single experiment that re-adds the exp-002 `penalizeOpponentMargin` consideration plus the new profile opt-in, and verifies opponent-margin refs differentiate (`distinct > 1` on >50% of decisions, target range ≥ 0.5).

## 4. Architecture

### 4.1 Profile surface (proposal)

Extend `AgentPreviewConfig` with an optional `outcomeGrantContinuation` block, analogous in shape to `continuedDeepening` from Spec 164:

```yaml
preview:
  mode: exactWorld
  budget:
    strategy: balancedCoverage
    fullCandidateCap: 10
    minPerGroup: 1
  inner:
    chooseOne: true
    chooseNStep: true
    # ... existing fields ...
  outcomeGrantContinuation:
    enabled: true
    extraDepthCap: 4         # bounded extra depth past the outcomeGrantResolve exit
    capClass: postGrant16    # named cap class for reproducibility metadata
```

`enabled: false` (or block absent) → current behavior. `enabled: true` → driver continues past `outcomeGrantResolve` frames up to the named extra-depth budget, then exits with a new `kind: 'postGrantCap'` or reuses `kind: 'depthCap'` (open question §10). The chosen cap class is statically named in the compiled artifact per Foundation 10.

### 4.2 Driver change

In `driveSyntheticCompletion` (`policy-preview.ts:986-993`), replace the unconditional `outcomeGrantResolve` exit with a check against the new profile setting. When `outcomeGrantContinuation.enabled` is true:

1. Continue the loop past the `outcomeGrantResolve` frame.
2. Track post-grant depth separately from the existing `depth` counter (so the pre-grant `completionDepthCap` and the new `extraDepthCap` are independent budgets, both bounded).
3. On reaching `extraDepthCap`, exit with the appropriate kind so the trace surface differentiates "completed past grants" vs "depth-capped past grants" (Foundation 20).

The other current exits (`actionSelection`, `turnRetirement`, seat change, turn change) remain hard — they bound the drive by seat/turn semantics, not by within-action resolution depth.

### 4.3 Trace surface

`previewUsage` already exposes per-ref readyRefStats and per-candidate `previewDrive.kind`. The opt-in path should:

- Add a `previewUsage.outcomeGrantContinuation` block with `enabled`, `extraDepthCap`, observed `extraDepthReached`, and counts of `completed` / `postGrantCap` / `stochastic` exits. This is the Foundation 9 (Replay/Audit) and Foundation 20 (Preview Signal Integrity) surface for the new behavior — operators can see in the trace whether and how the extended drive ran.

### 4.4 Foundations alignment

- **Foundation 10 (Bounded Computation)**: opt-in adds a *named, bounded* extra-depth budget. The cap class is statically named and recorded.
- **Foundation 15 (Architectural Completeness)**: this fix addresses the root cause (the drive exits before action effects land) rather than papering over (e.g., declarative effect annotations per Direction C of the trigger report).
- **Foundation 20 (Preview Signal Integrity)**: the extended drive's exit kind is reported in the trace so consumers can distinguish "ref ready post-grant" from "ref ready pre-grant"; a new advisory may be appropriate when the extended drive hits the extra-depth cap without resolving the requested ref. The current ready/unknown/depthCap/stochastic vocabulary is extended, not muddied.

## 5. Phases

| Phase | Scope | Acceptance | Effort |
|---|---|---|---|
| **0 — Pre-implementation bench** | Run the witness command against current `arvn-evolved` (Spec 178 post-fix substrate). Record slow-tier wall-time numbers. Re-add exp-002's `penalizeOpponentMargin` to confirm uniformity holds at current state. | Bench numbers archived in `reports/179-phase-0-pre-opt-in-baseline.md`. Confirms uniformity is reproducible on a clean check-out. | S |
| **1 — Implement opt-in** | Extend `AgentPreviewConfig` schema; thread through compiler/validator/schema artifacts; implement the post-grant continuation in `driveSyntheticCompletion`; add `previewUsage.outcomeGrantContinuation` trace fields; add a unit test pinning a small generic game's preview behavior with the opt-in on/off. | (a) New profile field accepted by compiler+validator; old profiles unchanged. (b) Engine test suite green. (c) Generic test demonstrates a candidate whose opponent-tied state differs only post-grant produces `distinct > 1` on the relevant ref with opt-in on, and `distinct = 1` with opt-in off. | M |
| **2 — Witness on FITL ARVN + cookbook update** | Re-run the witness with `arvn-evolved.preview.outcomeGrantContinuation.enabled = true, extraDepthCap = 4`, plus a re-added `penalizeOpponentMargin`. Compare trace readyRefStats vs Phase 0 baseline. Update `docs/agent-dsl-cookbook.md` to document the new opt-in and the per-seat opponent ref availability (currently only `.self` is shown). | (a) `preview.victory.currentMargin.<nva|vc>` shows `distinct > 1` on >50% of decisions and avg range ≥ 0.5 on the witness. (b) Slow-tier wall-time regression on the witness ≤ 5% versus Phase 0 baseline (else escalate to Spec 180 Direction B per the trigger report). (c) Cookbook addendum lands: per-seat opponent ref surface documented; new opt-in documented; partial-coverage warning added. | S–M |

Phase 0 is measurement-only; Phase 1 is the implementation; Phase 2 is the FITL witness + docs landing. The campaign (`fitl-arvn-agent-evolution`) resumes after Phase 2 lands.

## 6. Acceptance Gate Summary

A profile that opts in must produce per-seat opponent-margin preview refs that differentiate ARVN candidates whose underlying action class affects opponent state. The witness target on FITL ARVN tier 15 is `distinct > 1` on ≥ 50% of decisions for both `currentMargin.nva` and `currentMargin.vc`, with avg range ≥ 0.5 each. The perf gate is ≤ 5% slow-tier wall-time regression versus the Spec 178 post-fix substrate.

## 7. Out-of-Scope (Cross-Reference)

- **Direction B** of the trigger report (separate `previewEffect.*` surface): considered, deferred. If Phase 2's perf gate fails on `arvn-evolved`, fold this spec and open Spec 180 for Direction B.
- **Direction C** of the trigger report (declarative action effect annotations): rejected by the trigger report itself ("not the right answer for this gap").
- **Adjacent concern #2** of the report (which 4.5% of VC decisions currently differentiate): a small follow-up investigation, not in this spec.
- **`preview.feature.X` for opponent-tied features** (report adjacent concern #1): the Phase 1 driver change *should* lift this as a free side-effect (the post-grant state would expose the opponent-tied feature recomputations), but Phase 2 acceptance only pins `currentMargin.<opp>`; a separate witness run can confirm features lift, and Phase 2 should record the observed behavior.

## 8. Open Questions

1. **Exit kind name** for "extended drive hit `extraDepthCap`": `postGrantCap`, or reuse `depthCap` with a context flag, or other.
2. **Trace field name** for `previewUsage.outcomeGrantContinuation`: confirm with operators that this name matches the schema-artifact conventions.
3. **`extraDepthCap` default tier** when the profile sets `enabled: true` but omits `extraDepthCap`: should this default to a small value (e.g., 4) or require an explicit set? Spec 164's pattern is "named cap class is mandatory when opted in" — that is the safer default and is the proposal here.
4. **WASM route alignment**: Spec 176/178's WASM preview-drive currently fails closed on complex previews and falls back to TS. The Phase 1 implementation should mirror the opt-in behavior in the WASM path or explicitly document that the WASM path falls back when the opt-in is set. Operator preference to be confirmed during Phase 1.

## 9. Witness Substrate

For Phases 0 and 2:

```
cd <repo-root>
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs \
  --seeds 15 --trace-default all --concurrency 8
node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs
```

Plus a custom aggregation node script over `campaigns/fitl-arvn-agent-evolution/traces/trace-*.json` that produces the readyRefStats table from `reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md` (the trigger report) so before/after comparisons use identical methodology.

## 10. Tickets

Decomposed via `/spec-to-tickets` on 2026-05-17:

- [`archive/tickets/179ACTSELPRE-001.md`](../archive/tickets/179ACTSELPRE-001.md) — Phase 0 — Pre-implementation bench (baseline witness report) (covers §5 Phase 0)
- [`archive/tickets/179ACTSELPRE-002.md`](../archive/tickets/179ACTSELPRE-002.md) — Phase 1a — Schema/compiler/validator wiring for `outcomeGrantContinuation` (covers §5 Phase 1 schema)
- [`archive/tickets/179ACTSELPRE-003.md`](../archive/tickets/179ACTSELPRE-003.md) — Phase 1b — Driver change in `driveSyntheticCompletion` (post-grant continuation) (covers §5 Phase 1 driver, §4.2)
- [`tickets/179ACTSELPRE-004.md`](../tickets/179ACTSELPRE-004.md) — Phase 1c — `previewUsage.outcomeGrantContinuation` trace surface (covers §5 Phase 1 trace, §4.3)
- [`tickets/179ACTSELPRE-005.md`](../tickets/179ACTSELPRE-005.md) — Phase 2 — FITL ARVN witness + cookbook addendum (covers §5 Phase 2, §6 acceptance gate)
- [`tickets/179ACTSELPRE-006.md`](../tickets/179ACTSELPRE-006.md) — (Optional) WASM-route alignment for `outcomeGrantContinuation` (covers Open Question §8.4)

Namespace `179ACTSELPRE` finalized from user invocation (brainstorm proposal `179POSTGRANTPREV` superseded). Ticket 001 added to cover §5 Phase 0 which was omitted from the brainstorm-time decomposition.
