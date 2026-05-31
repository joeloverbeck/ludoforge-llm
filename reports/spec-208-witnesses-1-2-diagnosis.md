# Spec 208 Witnesses 1-2 Diagnosis

**Ticket**: `tickets/208FITLARVPQ-001.md`
**Date**: 2026-05-31
**Diagnostic script**: `campaigns/fitl-arvn-agent-evolution/diagnose-plan-controller-domination.mjs`

## Method

The diagnostic imports the compiled probe runner and the two existing Spec 208 probes from `packages/engine/dist/`, loads the production FITL GameDef, and runs each probe with `traceLevel: debug`. It reuses the existing replay-window fixture through the probe definitions, so the sample is the same first 100 aggregate ARVN main-phase matches across seeds 1000-1011.

Commands:

```bash
pnpm -F @ludoforge/engine build
node campaigns/fitl-arvn-agent-evolution/diagnose-plan-controller-domination.mjs
node campaigns/fitl-arvn-agent-evolution/diagnose-plan-controller-domination.mjs > /tmp/spec208-witnesses-1-2-a.txt
node campaigns/fitl-arvn-agent-evolution/diagnose-plan-controller-domination.mjs > /tmp/spec208-witnesses-1-2-b.txt
diff -u /tmp/spec208-witnesses-1-2-a.txt /tmp/spec208-witnesses-1-2-b.txt
```

The `diff` command exited 0, proving the aggregate diagnostic output is byte-identical across reruns.

## Shared Findings

Both probes matched the same 100 ARVN main-phase decisions. Every matched decision had:

- action-family distribution: `coin-operation|movement|patrol`: 100/100
- plan selection distribution: `selected:arvn.patrolGovern:arvn.patrolGovern`: 100/100
- preview requested-ref-count distribution: `0`: 100/100
- `currentTurnImpact` status distribution in the emitted trace: `missing`: 100/100
- `currentTurnImpact` ready share: 0/100

The selected plan template exists in the authored ARVN profile at `data/games/fire-in-the-lake/92-agents.md:1406`; it is a Patrol then Govern plan with a Patrol root and Govern compound step.

The diagnostic also shows this is not because the plan catalog only exposes one template. Across the 100 plan traces, alternative-template mentions were:

- `arvn.patrolGovern`: 133
- `arvn.trainGovern`: 133
- `arvn.assaultRaid`: 57
- `arvn.assaultTransportAssault`: 57

Template filtering was doctrine-driven in this window:

- `arvn.sweepRaid:suppressed:shared.monsoonOperationalRestriction`: 100
- `arvn.assaultRaid:suppressed:buildPoliticalEngine`: 25
- `arvn.assaultTransportAssault:notEnabled:buildPoliticalEngine`: 25
- `arvn.trainTransport:notEnabled:buildPoliticalEngine`: 25

The `patrolSpace` and `governSpace` role bindings were ready on all 100 matches.

## Source Trace

The plan-root behavior is explicit in the source. `PolicyAgent.chooseActionSelectionDecision` proposes a plan, asks `choosePlanSelectedRootDecision` for a plan-root decision, and returns it immediately when present (`packages/engine/src/agents/policy-agent.ts:616-626`). The fallback scalar evaluation path starts only after that early return point (`packages/engine/src/agents/policy-agent.ts:627-634`).

`choosePlanSelectedRootDecision` emits metadata with `previewUsage: emptyPreviewUsage('disabled')`, empty candidate/pruning/tiebreak arrays, and the plan trace (`packages/engine/src/agents/policy-agent-plan-root.ts:40-55`). That matches the diagnostic's 0 requested preview refs.

`currentTurnImpact` is authored in FITL YAML as a turn-shape evaluator sourced from `currentPreviewDrive` with a max synthetic decision bound of 8 and `onPreviewUnavailable: traceOnly` fallback (`data/games/fire-in-the-lake/92-agents.md:2724-2747`). However, turn-shape trace construction is attached to the fallback policy evaluation metadata (`packages/engine/src/agents/policy-eval.ts:973-1026`), which these 100 plan-root-selected decisions never enter.

## Witness 1 Verdict

**Verdict**: L - legitimate trajectory drift requiring distillation.

`arvn-action-distribution-not-dominated` is failing because the post-Spec-190/191 replay window is entirely plan-root-selected Patrol/Govern. The diagnostic exposes viable alternative templates in the plan trace, so the evidence does not point to missing ARVN template wiring or a single-template catalog regression. It points to a seed-window assertion calibrated on an older trajectory: the current 100-decision window is a legitimate plan-controller trajectory that the original `actionFamilyDistributionBelow{family:'any', threshold:0.60}` assertion no longer describes.

**Ticket 003 path**: replace the seed-pinned 0.60 family-share assertion with a property-form invariant that still catches plan-selection collapse. A suitable direction is an architectural probe over the plan proposal trace: assert that ARVN plan evaluation exposes multiple viable template alternatives and that a single selected template dominating a sampled window is accompanied by explicit doctrine/role-binding evidence rather than silent template loss. Do not relax the old 0.60 threshold to the observed 1.000 rate.

## Witness 2 Verdict

**Verdict**: L - legitimate trajectory drift requiring distillation.

`turn-shape-minimum-impact-observed` is failing because `currentTurnImpact` is absent from the plan-root trace on these decisions, not because it evaluates and returns `unknown`, `partial`, `failed`, or `ready=false`. The early plan-root return bypasses fallback scalar evaluation, and the trace path that records turn-shape evaluators lives inside that fallback evaluation. This is a mismatch between the witness's assumed decision source and the current plan-root trajectory.

**Ticket 003 path**: distill the witness to an invariant that covers the intended defect class without requiring plan-root decisions to emit scalar fallback turn-shape evidence. A suitable direction is a subset-aware assertion: on fallback-evaluated ARVN action-selection decisions, `currentTurnImpact` must still be observed with both satisfied and unsatisfied outcomes; on plan-root decisions, the trace must make the plan-root source explicit and must not silently masquerade as scalar turn-shape evidence.

## Foundation Alignment

- Foundation #15: the diagnosis identifies the root mismatch instead of papering over the assertions. The observed failures are tied to plan-root selection and trace-source semantics, not preview-cost drift.
- Foundation #16: ticket 003 should preserve proof by distilling to architectural invariants, not by weakening seed-pinned bounds.
- Foundation #20: no preview/turn-shape status is coerced. The report records `currentTurnImpact` as `missing` from the plan-root trace, distinct from `ready` and from non-ready preview statuses.

## Residual Risk

This ticket does not compare against a pre-Spec-191 checkout. The verdict is therefore based on current-HEAD diagnostic evidence plus the spec's calibration history. Ticket 003 should keep the distillation honest by verifying the new property-form invariant guards the intended defect class and, where practical, sanity-checking it against the pre-Spec-191 baseline.
