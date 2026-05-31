# Spec 208 Witness 3 Diagnosis

**Ticket**: `archive/tickets/208FITLARVPQ-002.md`
**Date**: 2026-05-31
**Diagnostic script**: `campaigns/fitl-arvn-agent-evolution/diagnose-grant-flow-opponent-margin.mjs`

## Method

The diagnostic reconstructs the skipped `fitl-arvn-may17-equivalent-opponent-preview` probe from `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts`, imports the compiled probe runner from `packages/engine/dist/`, loads the production FITL fixture, and replays the same `fitl-arvn-action-distribution-windows.json` state samples with debug traces.

Commands:

```bash
pnpm -F @ludoforge/engine build
node campaigns/fitl-arvn-agent-evolution/diagnose-grant-flow-opponent-margin.mjs
node campaigns/fitl-arvn-agent-evolution/diagnose-grant-flow-opponent-margin.mjs > /tmp/spec208-witness-3-a.txt
node campaigns/fitl-arvn-agent-evolution/diagnose-grant-flow-opponent-margin.mjs > /tmp/spec208-witness-3-b.txt
diff -u /tmp/spec208-witness-3-a.txt /tmp/spec208-witness-3-b.txt
```

The `diff` command exited 0, proving the aggregate diagnostic output is byte-identical across reruns.

## Findings

The current replay window matched 100 ARVN main-phase decisions across the same 100 fixture samples. The live aggregate was:

- selected action distribution: `patrol`: 100/100
- candidate rows in policy trace: 0
- candidates requesting NVA/VC opponent-margin refs: 0
- ready opponent-margin candidates: 0
- `previewUsage.outcomeBreakdown`: every bucket 0, including `unknownPostGrantCap`, `unknownFreeOperationCap`, and `unknownGrantFlowPartial`
- `grantFlowContinuation.exitCounts`: no trace surface emitted
- opponent / standing ref status distribution: empty

This corrects the draft ticket hypothesis. The current failure is not a live cap-exhaustion distribution over requested NVA/VC refs. It is a decision-source mismatch: the replay window is plan-root Patrol/Govern, so the scalar preview-evaluation path that would emit candidate rows and grant-flow continuation traces is not entered.

The source confirms the shape:

- `packages/engine/src/agents/policy-agent.ts:616-625` proposes a plan, chooses a plan-selected root decision, and returns it before fallback scalar evaluation.
- `packages/engine/src/agents/policy-agent-plan-root.ts:40-52` emits plan-root metadata with `candidates: []` and `previewUsage: emptyPreviewUsage('disabled')`.
- `packages/engine/src/agents/policy-eval.ts:1009-1015` is the scalar fallback metadata path that would emit candidate rows and preview usage when diagnostics are collected.
- `data/games/fire-in-the-lake/92-agents.md:3033-3038` still configures `grantFlowContinuation` as enabled with `postGrant16` and `grantFlow16`; it is simply not exercised by these plan-root decisions.
- `packages/engine/src/agents/policy-preview-inner-deepening.ts:375-430` is the continued-deepening path that resolves post-root options and would report deep pass / grant-flow outcomes when the scalar preview path runs.
- `packages/engine/src/agents/policy-surface.ts:209-223` resolves `victory.currentMargin.*` refs as `victoryCurrentMargin` role refs; no evidence suggests the opponent-margin resolver itself is broken.

Recent history also points to trajectory / decision-source drift rather than an isolated grant-flow resolver regression: the relevant agent/YAML files were touched by the Spec 190/191 plan-root and plan-role work before later FITL profile work, and `reports/spec-208-witnesses-1-2-diagnosis.md` already measured the same 100-window trajectory as plan-root Patrol/Govern.

## Verdict

**Verdict**: L - legitimate post-Spec-191 trajectory drift requiring distillation.

The witness's original assertion requires at least two ready opponent-preview candidates and non-uniform opponent-margin contributions. On the current replay window there are no scalar candidate rows and no requested NVA/VC margin refs, because the plan-root path returns before scalar preview evaluation. That makes the old May-17 assertion calibrated to a decision-source trajectory that no longer exists in this window.

This does not support a Foundation #20-violating fix such as coercing `unknown` to `ready`. It also does not support retuning `postGrant16` / `grantFlow16` caps for this ticket, because the current witness window does not reach those caps at all.

## Ticket 003 Resolution Path

Ticket 003 should distill Witness 3 instead of restoring the old seed-pinned ready-candidate count.

A suitable property-form invariant:

1. First classify the decision source. Plan-root decisions must make their plan-root source explicit and may have preview disabled with no scalar candidate rows.
2. On scalar preview-evaluated ARVN decisions that request opponent/standing margin refs, preserve the Foundation #20 status contract: every NVA/VC/currentLeader/nearestThreat ref is explicitly `ready` or carries its non-ready status (`postGrantCap`, `freeOperationCap`, `grantFlowPartial`, `depthCap`, etc.).
3. When grant-flow preview is exercised, assert cap-class accounting is visible in `previewUsage.outcomeBreakdown` / `grantFlowContinuation.exitCounts` instead of requiring every seed-pinned window to produce ready NVA/VC margins.

Do not relax the old assertion to "0 ready is acceptable" without replacing it with the source-aware bounded-preview property above.

## Foundation Alignment

- Foundation #15: the diagnosis identifies the root mismatch as decision-source drift, not a cap-tuning or resolver symptom.
- Foundation #16: ticket 003 should keep a blocking witness by distilling to a property-form invariant.
- Foundation #20: non-ready preview statuses remain explicit. The current diagnostic reports that no grant-flow status exists in this window, rather than recoding missing preview evidence as ready.

## Residual Risk

This ticket did not run a pre-Spec-191 checkout. The verdict is based on current-HEAD diagnostic evidence, the archived Witnesses 1-2 diagnosis, and the spec's calibration history. Ticket 003 should verify the distilled property against a window that actually exercises scalar preview / grant-flow continuation so the replacement witness still guards grant-flow status accounting.
