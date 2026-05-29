# 207AGEDECCOS-002: Phase 2 — Bound the chooseNStep continuedDeepening per-decision enumeration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — agent policy preview inner-deepening drive (`policy-agent-inner-preview.ts`, `policy-preview-inner-deepening.ts`); possibly the `arvn-baseline` preview config in FITL game data
**Deps**: `specs/207-fitl-agent-decision-cost-regression.md`

## Problem

Phase 1 (`archive/tickets/207AGEDECCOS-001.md`) localized the ~20–30× within-game per-decision cost drift (Spec 207 §3): it lives entirely in `PolicyAgent.chooseDecision` (last-decile agent ≈569–609ms vs kernel `applyMove` ≈1.5ms flat), in the `chooseNStep` continuedDeepening inner-preview drive — `packages/engine/src/agents/policy-agent-inner-preview.ts` → `runChooseNStepInnerPreview` (broad pass) + `runDeepPass` (deep pass, from `policy-preview-inner-deepening.ts`). It is **not** a leaked/retained cache; it is **per-decision work bounded only by `capClass`** whose realized cost scales with the number of selectable `chooseN` values at the microturn, which grows as the FITL board fills. `advanceToDecisionPoint` iterations (`adp:iterations`) explode to ~3200–3400 per late ARVN `chooseNStep` decision; the largest such decisions cost 2000–4900ms each.

The introducing change is **Spec 191** (commit bisect in §3): pre-191 the per-decision cost is uniformly ~190ms (flat — `deep1024` continuedDeepening was already enabled by a Spec 164 ARVN-campaign tuning commit, so absolute cost was high but did not *drift*); Spec 191's plan-root/plan-proposal rework made early decisions cheap (~190ms → ~11ms) while late decisions exploded (~190ms → ~465ms) and lengthened the ARVN trajectory (163 → 218 decisions). The `deep1024` capClass is a necessary cost-multiplier precondition; the drift cause is the unbounded scaling of the deepening enumeration with the selectable-value set.

This ticket is **Phase 2 — the fix**: bound the per-decision `chooseNStep` continuedDeepening enumeration so its cost no longer scales with the growing selectable-value set / decision index, **without changing decision outcomes** (determinism + replay-identity must hold). Un-skipping the four quarantined witnesses and the full lane verification is Phase 3 (`207AGEDECCOS-003`); this ticket proves the fix self-contained via the checked-in diagnostic.

## Assumption Reassessment (2026-05-29)

1. **Hotspot symbols confirmed**: `policy-agent-inner-preview.ts` exports `createPolicyAgentChooseNStepInnerPreview` (line 475), which calls `runChooseNStepInnerPreview` (line 490) and `runDeepPass` (line 512). `runDeepPass` is imported from `./policy-preview-inner-deepening.js` (line 20). These are the broad/deep passes named in §3.
2. **arvn-baseline config confirmed**: `data/games/fire-in-the-lake/92-agents.md` `arvn-baseline:` (line 3008) declares `inner.chooseNStep: true`, `inner.strategy: continuedDeepening`, `inner.capClass: deep1024`, with `continuedDeepening` broad `depthCap: 4` (line 3026) and deep `depthCap: 16` (line 3028). The `deep1024` capClass occurs exactly once in the file — it is unique to `arvn-baseline`.
3. **Engine fix is primary, not the data lever**: the unbounded-with-board-fill behavior is a general preview-bounding gap on the agent decision path, independent of which profile/game opts into deep continuedDeepening. Lowering `arvn-baseline`'s `capClass` alone would be a symptom patch (Foundation 15) that leaves the scaling behavior in place for any other profile. The architectural fix bounds the enumeration in the engine; the capClass reconsideration is a secondary, optional tuning lever.
4. **Diagnostic available for self-contained acceptance**: `campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs` (checked in by 001) reproduces the drift on seed 1002 and reports the per-decision-index ratio — usable to prove the fix without un-skipping any test.

## Architecture Check

1. **Root-cause fix, not relaxation** (Foundation 15): the fix bounds the deepening enumeration's per-decision work so cost no longer scales with the selectable-value set. It does not touch the `1.75×` ceiling, the probe overhead budgets, the preview caps, or any witness assertion (Spec 207 §4 Non-Goals).
2. **Engine-agnostic** (Foundation 1): the bound is expressed generically in the preview inner-deepening drive (over selectable-value counts / iteration budgets), not as a FITL- or ARVN-specific branch. Any optional `capClass` tuning lives in game-data YAML (`92-agents.md`), per Foundation 2 (rule-authoritative agent config is GameSpecDoc data).
3. **Determinism + replay preserved** (Foundation 8): the fix must not change decision outcomes — only their cost. Bounding the enumeration must be order-deterministic and must yield byte-identical decision sequences. Proven by the determinism lane + four-profile convergence canaries staying byte-identical (verified in full by Phase 3; locally asserted here via replay-identity on the diagnostic config).
4. **Preview signal integrity preserved** (Foundation 20): the fix restores preview *speed* so opponent-margin refs resolve `ready` again; it must not coerce `unknown`→`ready`. A faster bounded preview that no longer exhausts its caps is the integrity-preserving path.

## What to Change

### 1. Bound the per-decision continuedDeepening enumeration

In `packages/engine/src/agents/policy-agent-inner-preview.ts` (`runChooseNStepInnerPreview`) and `packages/engine/src/agents/policy-preview-inner-deepening.ts` (`runDeepPass`), bound the work performed per decision so it does not scale with the count of selectable `chooseN` values at the microturn. Investigate the `advanceToDecisionPoint` iteration explosion (`adp:iterations` ~3200–3400 in the last decile) — the bound should cap the realized broad/deep enumeration independent of how full the board is, in a deterministic, outcome-preserving way. Preserve the existing `capClass` / `depthCap` semantics for small selectable sets; only the super-linear growth with set size is in scope.

### 2. (Secondary, optional) Reconsider the arvn-baseline capClass

If, after the engine bound, `arvn-baseline`'s `deep1024` / `depthCap: 16` continuedDeepening still dominates cost, evaluate lowering the capClass in `data/games/fire-in-the-lake/92-agents.md` (lines 3016–3028). This is a tuning lever, not the fix — apply only if needed and only if it preserves decision outcomes (re-bless any affected convergence canary only under the `.claude/rules/testing.md` re-bless protocol). Treat as Out of Scope if the engine bound alone restores the ratio.

### 3. Prove the fix via the diagnostic

Re-run `campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs` and confirm the seed-1002 drift ratio falls below `1.75×` with the per-decision cost curve flattened, and that the decision sequence is unchanged (replay-identity).

## Files to Touch

- `packages/engine/src/agents/policy-agent-inner-preview.ts` (modify — bound `runChooseNStepInnerPreview` broad-pass enumeration)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify — bound `runDeepPass` deep-pass enumeration)
- `data/games/fire-in-the-lake/92-agents.md` (modify — *optional* `arvn-baseline` capClass tuning, lines 3016–3028; only if §2 applies)

**Note**: exact bound shape is refined during implementation against the `adp:iterations` profile; the two engine files above are the confirmed hotspot. Additional preview-drive helpers (`advanceToDecisionPoint` owner) may be touched if the iteration cap lives there — `/implement-ticket` should trace `adp:iterations` to its source during Phase 2 reassessment.

## Out of Scope

- **Un-skipping any of the four quarantined witnesses** and the full determinism/canary/`test:all`/`policy-profile-quality` lane verification — that is `207AGEDECCOS-003` (Phase 3).
- **Relaxing** `COST_DRIFT_CEILING` (1.75×), the probe overhead budgets, or the preview budget caps; **re-calibrating** any witness (Spec 207 §4).
- **Coercing** `unknown` preview refs to `ready` (Foundation 20) — the fix restores speed, not coercion.
- Changing decision outcomes for any profile. If the bound alters a decision sequence, the bound is wrong — fix the bound, do not re-bless to hide an outcome change.

## Acceptance Criteria

### Tests That Must Pass

1. `node campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs` reports a seed-1002 drift ratio **< 1.75×** with a flattened per-decision cost curve (last-decile agent cost no longer ~20–30× the first decile).
2. The diagnostic confirms the decision sequence on seed 1002 is **unchanged** vs. pre-fix (replay-identity at the diagnostic config).
3. Determinism lane stays green: `pnpm -F @ludoforge/engine build && node --test "dist/test/determinism/**/*.test.js"`.
4. Engine typecheck + lint clean: `pnpm -F @ludoforge/engine typecheck && pnpm -F @ludoforge/engine lint`.

### Invariants

1. Decision outcomes are unchanged for all four `*-baseline` profiles — the fix changes cost only, not behavior (Foundation 8).
2. The continuedDeepening enumeration is bounded independent of the selectable-value-set size / decision index (no super-linear growth with board fill).
3. No witness bound, budget, or cap is relaxed; no preview ref is coerced (Spec 207 §4, Foundation 20).
4. The bound is expressed generically in the engine, with no FITL/ARVN-specific branch in `agents/` source (Foundation 1).

## Test Plan

### New/Modified Tests

1. `campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs` — re-used (not modified) as the self-contained ratio + replay-identity proof for this ticket.
2. No new `node --test` witness is authored here — the four quarantined witnesses are un-skipped in `207AGEDECCOS-003`. (Attachment rationale noted so the reviewer does not expect the witness un-skips inline.)

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs`
3. `node --test "dist/test/determinism/**/*.test.js"`
4. `pnpm -F @ludoforge/engine typecheck && pnpm -F @ludoforge/engine lint`
