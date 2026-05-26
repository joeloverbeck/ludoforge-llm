# Spec 199 — Compound Availability at Root Proposal

**Status**: PROPOSED
**Priority**: Medium — Spec 191 P3 validated authored `root.compound` metadata against at least one *static* continuation witness at compile time, but the plan proposer at runtime does not probe whether the compound special-activity continuation is *currently grantable* in the published frontier. Today, the controller discovers unavailability one microturn later via the fallback ladder; the proposal trace records intended coherence the runtime cannot honor. This is the second-iteration audit's proposal #7 — a real proposal-trace integrity gap, but smaller in scope than the audit framed it. The user explicitly requested promoting it from ticket-sized to a separate spec.
**Complexity**: M — adds a bounded compound-availability probe at the kernel-publication seam, wires it into the proposer, and surfaces availability status as a trace field with provenance. Similar shape to Foundation #18's constructibility-publication probe (Spec 144) but scoped to compound continuations, not microturn legality.
**Date**: 2026-05-26
**Dependencies**:
- `archive/specs/186-advisory-turn-plan-architecture-core.md` (COMPLETED — plan-template IR including `root.compound` metadata)
- `archive/specs/190-plan-primary-root-selection.md` (COMPLETED — plan root authority; compound availability is meaningful at root-selection time)
- `archive/specs/191-plan-role-semantic-integrity.md` (COMPLETED — P3 added compile-time compound witness validation that this spec extends to runtime)
- `archive/specs/144-probe-and-recover-microturn-publication.md` (COMPLETED — Foundation #18 publication-probe pattern this spec reuses)

**Trigger report**:
- `reports/ai-agent-policy-overhaul-second-iteration.md` §5 ("Plan root compound validation is good, but runtime root matching is still coarse … If the selected root later cannot realize the intended special activity in that state, the controller will legally fallback/deviate, but the proposal trace may still overstate intended coherence"). User-requested promotion from ticket-sized to standalone spec.

**Ticket namespace**: `199COMPAVAILROOT` (proposed)

---

## 1. Goal

Surface compound special-activity grantability at plan-root proposal time so:

1. **Plan-root candidates with `root.compound` metadata are probed** for whether the named special-activity continuation is currently grantable in the published frontier under bounded depth — similar to Foundation #18's constructibility probe, scoped to compound continuation rather than next-microturn legality.
2. **Each compound-bearing root candidate carries an availability status**: `compoundReady` (the special activity will be grantable next microturn), `compoundProvisional` (grantability is uncertain past the probe budget; controller fallback may activate), or `compoundUnavailable` (no continuation path exists at any reachable next microturn).
3. **The plan proposer prefers** `compoundReady` over `compoundProvisional` over `compoundUnavailable` when the role/score/posture ranking is otherwise tied; the controller's runtime fallback remains the safety net (Foundation #18).
4. **The plan trace exposes compound availability with provenance** — the same Foundation-#20-style shape used by preview refs (status, observer scope, budget outcome). Proposal traces stop overstating coherence the controller will not realize.

## 2. Non-Goals

- **No removal of the runtime fallback ladder.** Spec 186's controller fallback (`plan-controller.ts:28-76`) remains the safety net per Foundation #18 publication contract — the probe is best-effort advisory at proposal time, not authoritative.
- **No new compound-grant semantics.** The kernel's special-activity grant predicates are unchanged; this spec wires the *existing* predicates into proposal-time probing.
- **No change to root-selection authority.** Spec 190 owns "plan chooses root"; this spec adds an availability-aware *ranking adjustment* among compound-bearing candidates, not a new authority layer.
- **No probe of compound continuations more than one microturn deep.** The probe is bounded by Foundation #10 — one microturn lookahead (the "next decision" boundary) is the budget; deeper coherence is not knowable cheaply and is the controller's concern.
- **No FITL profile rewrite.** Authored `root.compound` metadata is unchanged; the spec changes how the proposer consumes the same metadata at runtime.

## 3. Context (verified against codebase, 2026-05-26)

- **Compile-time compound validation (Spec 191 P3 outcome)** — `validate-agent-plan-templates.ts` validates that each authored `root.compound.{specialTags, timing, interruptAfterStage}` aligns with at least one continuation witness in the GameDef's action surface. The witness proves *some* state could grant the continuation, not that the *current* state will.
- **Compound metadata in the IR** — `compile-agent-plan-templates.ts:94-102` copies `root.compound` verbatim into `CompiledPlanRoot` (inline; there is no standalone `CompiledPlanCompound` type — compound metadata lives at `CompiledPlanRoot['compound']`, defined inline at `kernel/types-core.ts:1209`). The runtime does not probe the metadata; the controller discovers continuation availability one microturn later by attempting to match.
- **Plan-proposer root iteration** — `plan-proposal.ts:122-162` iterates plan-template root candidates and assembles each candidate's `score: priorityTier + roleScore + considerationScore + posture.scoreDelta` (at line 152). The compound metadata is recorded on the candidate but does not influence ranking; a `compoundUnavailable` candidate competes equally with a `compoundReady` candidate.
- **Controller fallback on compound miss** — `plan-controller.ts:28-76` handles the runtime case: if the next microturn's frontier does not match the expected step (e.g., because the compound continuation was not granted), the controller falls back through `exact → reselected → primitiveConsiderationPolicy → stableFrontierTieBreak` (trace-event labels). This is observable in plan-trace `deviations` and per-microturn `match` + `fallbackReason` fields. The fallback is correct safety-net behavior; the *trace overstatement* (proposal said "Train+Govern" but controller actually did "Train+stable-fallback") is the integrity gap.
- **Foundation #18 publication-probe pattern** — Spec 144 introduced a bounded publication probe that verifies constructibility one microturn deep before publishing. The same probe-then-publish shape applies here: the proposer probes compound continuation grantability before *recommending* the root, in the same way the kernel probes microturn constructibility before *publishing* it.
- **Preview signal integrity precedent** (Foundation #20) — `archive/specs/162` introduced explicit preview-ref status; the implementing type is `PreviewOptionRefStatus` at `packages/engine/src/agents/policy-preview-inner.ts:50`, a 2-arm union (`'ready'` with value | `'unavailable'` with reason). The compound-availability status field this spec adds **extends** that pattern with a `'provisional'` arm for depth-capped / partial-grant outcomes that the binary ready/unavailable shape cannot express.

## 4. Architecture

### 4.1 Bounded compound-availability probe

Add a kernel-side primitive (likely under `packages/engine/src/kernel/microturn/`, colocated with existing decision-probe infrastructure such as `probeDecisionContinuationAdmissionResult` in `kernel/microturn/continuation.ts`):

```ts
type CompoundAvailability =
  | { kind: 'ready' }
  | { kind: 'provisional', reason: 'depth-capped' | 'partial-grant' }
  | { kind: 'unavailable', reason: 'no-continuation' | 'no-grant-predicate' };

function probeCompoundAvailability(
  def: GameDef,
  state: GameState,
  seatId: SeatId,
  rootDecision: Extract<Decision, { readonly kind: 'actionSelection' }>,
  compound: NonNullable<CompiledPlanRoot['compound']>,
): CompoundAvailability;
```

The signature uses existing engine types — per Foundation #4, observer scope is encoded by `seatId` + state, so there is no first-class `ObserverScope` parameter; compound metadata is read inline off `CompiledPlanRoot['compound']` (no standalone `CompiledPlanCompound` type exists).

Behavior:
- **`ready`**: simulating the kernel's grant predicate against the post-root state confirms the next microturn's frontier will include a decision matching `compound.specialTags` + `compound.timing`.
- **`provisional`**: the grant predicate depends on state branches the probe cannot evaluate at its bounded depth (e.g., RNG outcomes, opponent decisions not yet resolved). Marked depth-capped per Foundation #20.
- **`unavailable`**: no grant predicate exists for this compound metadata in the current state; the controller will definitely fall back.

The probe is observer-safe (consults only seat-visible state) and bounded (one microturn deep per Foundation #10). It is pure over `(def, state, seatId, rootDecision, compound)`; no side effects.

### 4.2 Proposer integration

`plan-proposal.ts` extends the candidate-scoring path: after computing `priorityTier + roleScore + considerationScore + posture.scoreDelta`, for each candidate whose template has `root.compound` metadata, invoke `probeCompoundAvailability` and annotate the candidate.

Ranking modification (`compareAlternatives` at `plan-proposal.ts:645-649`): the existing function chains three comparisons (`priorityTier` → `score` → `stableKey`); insert compound availability between `score` and `stableKey` — prefer `ready` > `provisional` > `unavailable`. Scores are exact integers per Foundation #8, so equality is bitwise. The new key is a *terminal-class* tiebreaker (fires only when tier and score tie), not a primary ranking key; the existing `stableKey` remains the deterministic final fallback.

When no candidate is `ready` but some are `provisional`, the proposer selects the highest-ranked `provisional` candidate (and the controller's fallback ladder handles unavailability at runtime per Foundation #18).

### 4.3 Trace provenance

Plan-trace fields gain a per-candidate compound-availability status on the existing `PolicyPlanTraceAlternative` type at `kernel/types-plan-trace.ts:9-15`. The new field extends `PreviewOptionRefStatus`'s 2-arm pattern with a `'provisional'` arm — the depth-capped / partial-grant outcome cannot be expressed by the binary ready/unavailable shape, so a third arm is justified:

```ts
interface PolicyPlanTraceAlternative {
  // ... existing fields (templateId, rootStableMoveKey, score, priorityTier, stableKey) ...
  readonly compoundAvailability?: CompoundAvailability;
}
```

The selected candidate's status is also surfaced at the top-level proposal trace (`PolicyPlanTrace`). Alternative statuses live on each `PolicyPlanTraceAlternative` entry in the existing `alternatives` array so contrastive trace consumers see why a `compoundReady` candidate beat a higher-scored `compoundUnavailable` one (when the tiebreaker fired).

### 4.4 Compile-time witness extension

Spec 191 P3 validates a *static* continuation witness exists. This spec extends validation to assert that the authored `root.compound.specialTags` align with the grant-predicate vocabulary the engine recognizes — catching authoring typos at compile time rather than at proposal-probe runtime. The vocabulary is enumerable: special-activity grants resolve via action IDs in `accompanyingOps` lists on `ActionPipelineDef` (precedent: `validate-gamedef-extensions.ts` already validates `accompanyingOps` entries against known action IDs), so this validation is implementable rather than gated.

## 5. Determinism and replay (Foundations #8, #16)

- `probeCompoundAvailability` is pure; same inputs produce same `CompoundAvailability`.
- Probe results are recorded in trace; replays produce byte-identical trace including compound-availability status.
- `pnpm turbo build` twice byte-identical (no compile-time changes unless §4.4 lands).

## 6. Edge cases

- **No `root.compound` on a template** — probe is not invoked; candidate ranks normally without availability annotation.
- **Probe budget exhausted** — `provisional` status with `reason: depth-capped`; proposer treats as middle preference, controller fallback remains safety net.
- **Compound spans multiple microturns** — probe checks only the immediate next microturn; later microturns are the controller's concern (per Non-Goals). Trace records depth-capped if compound continues past the probe budget.
- **Observer-scoped state insufficient to evaluate grant predicate** — `provisional` with `reason: partial-grant`; treated as preview's `hidden` per Foundation #20.
- **All candidates are `compoundUnavailable`** — proposer still selects the highest-ranked candidate (by primary tier/score); trace flags the all-unavailable situation; controller fallback handles it. No new failure mode.
- **The tiebreaker fires on identical scores between `ready` and `provisional`** — `ready` wins per §4.2 ordering.

## 7. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Probe primitive (§4.1) | `compound-availability-probe.ts` implements bounded probe; pure-function tests cover `ready` / `provisional` / `unavailable` outcomes on synthesized fixtures; observer-safety preserved | M |
| **P2** | Proposer integration + trace fields (§4.2 + §4.3) | `plan-proposal.ts` invokes probe for compound-bearing candidates; tiebreaker is the terminal lex key; trace exposes per-candidate + selected-candidate availability; replay byte-identical | M |
| **P3** | Architectural-invariant + correspondence tests | Architectural-invariant: probe verdict predicts controller fallback (no false `ready` cases). Convergence witness: FITL scenario where a previously-overstated proposal trace now correctly records `compoundUnavailable` or `provisional`. Determinism: replay byte-identity preserved | M |
| **P4** | Compile-time vocabulary extension (§4.4) | Validates each authored `root.compound.specialTags` token aligns with an action ID present in some `accompanyingOps` list in the GameDef's action surface; extends `validatePlanTemplateCompound` with a vocabulary check following the precedent of `validate-gamedef-extensions.ts` | S |

## 8. Test plan

- **Probe purity** (architectural-invariant, `packages/engine/test/unit/agents/plan-proposal-compound-availability.test.ts`): synthesized `(def, state, seatId, rootDecision, compound)` fixtures produce expected `CompoundAvailability` outcomes; same inputs deterministic.
- **Predict-fallback correspondence** (architectural-invariant, `packages/engine/test/architecture/plan-controller-compound-availability-correspondence.test.ts`): for a corpus of FITL plan templates, probe `ready` verdict implies controller does not fall back at the next microturn; probe `unavailable` implies controller does fall back. No false `ready` cases.
- **Tiebreaker behavior** (architectural-invariant, `packages/engine/test/unit/agents/plan-proposal-compound-availability.test.ts`): when two candidates have equal primary score and differ only in availability, the proposer picks the `ready` candidate.
- **Trace integrity** (golden trace): plan trace records availability for every compound-bearing candidate; replay byte-identical.
- **FITL convergence witness**: a previously-known overstated-trace scenario (where the proposer claimed Train+Govern but the controller fell back to Train+stable) now produces `compoundProvisional` or `compoundUnavailable` in the trace.

## 9. Foundation alignment

#1 (engine-agnostic probe; compound metadata is generic per Spec 186) · #4 (probe is observer-safe) · #10 (probe is bounded by one microturn lookahead) · #12 (compile-time vocabulary extension is the knowable-from-spec part; runtime probe handles state-dependent semantics) · #15 (root-cause: closes the proposal-trace integrity gap without weakening the controller fallback safety net) · #18 (probe-then-publish-style pattern, reused at proposal time; controller fallback remains the legality safety net) · #19 (microturn protocol unchanged) · #20 (compound availability surfaces explicit provenance, mirrors preview-ref status shape).

## 10. Reassessment of source proposal (`reports/ai-agent-policy-overhaul-second-iteration.md`)

**Adopted (this spec's slice):**
- §5 (proposal #7: explicit compound availability/status at root proposal time) → §4.1 + §4.2 + §4.3.

**Corrected:**
- The audit's framing that this is part of a broader "DPRT-P" reframe is rejected — this is a focused probe addition, not architectural replacement. The proposal-trace integrity gap is real and meaningful; the framing is not.
- User-requested promotion from ticket-sized to standalone spec adopted: the scope is bounded (probe + proposer wiring + trace fields + compile-time vocabulary extension) but cross-cutting enough across kernel, agent, and trace surfaces that ticket-sized decomposition is awkward.

**Deferred (named follow-ups, not in this spec):**
- Probe budgets deeper than one microturn — uncommitted; controller fallback handles deeper unavailability adequately.
- Other proposals owned by sibling specs (constraints/route → Spec 196; doctrine gating → Spec 197; conformance/observer → Spec 198).

**Rejected (with rationale):**
- Replacing the controller fallback ladder with proposer-side guarantees — Foundation #18 mandates the runtime safety net regardless of advisory probing; YAGNI.

## 11. Out of scope (named follow-on / sibling)

- **Spec 196** — generic role constraints + authored route/map semantics (mutually independent).
- **Spec 197** — doctrine-gated plan-template eligibility (mutually independent).
- **Spec 198** — cross-game conformance corpus + observer-safety proofs (mutually independent).
- Deeper-than-one-microturn compound probing.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-26:

- [`archive/tickets/199COMAVAROO-001.md`](../archive/tickets/199COMAVAROO-001.md) — P1 — Bounded compound-availability probe primitive (covers §4.1) — COMPLETED 2026-05-26
- [`archive/tickets/199COMAVAROO-002.md`](../archive/tickets/199COMAVAROO-002.md) — P2 — Proposer integration + trace fields (covers §4.2 + §4.3) — COMPLETED 2026-05-26
- [`tickets/199COMAVAROO-003.md`](../tickets/199COMAVAROO-003.md) — P3 — Architectural invariants + correspondence + FITL witness (covers §7 P3 + §8)
- [`tickets/199COMAVAROO-004.md`](../tickets/199COMAVAROO-004.md) — P4 — Compile-time grant-vocabulary check (covers §4.4)
