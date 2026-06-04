# CI Failure Recovery — PR #300 (`implemented-spec-210`) — 2026-06-04

First CI run on the branch (HEAD `120ad53e3`). 13 failing lanes collapsed to **4 root clusters**. Clusters 1, 2, 4 fixed and pushed (`ef185d8`, `4f1a97f`); cluster 3 is a determinism-sacred kernel defect deferred to tickets **CMPSACON-001** / **CMPSACON-002**.

## Cluster table

| # | Cluster | Lanes | Class | Status | Root cause | Resolution |
|---|---------|-------|-------|--------|-----------|------------|
| 1 | Lint: unused import | `ci` (lint step) | lint | PR regression | `asDecisionFrameId` imported but never used in `plan-controller.test.ts` | FIXED — `ef185d8` |
| 2 | Bootstrap fixture drift | `check` | test-lane | PR regression | `runner/src/bootstrap/fitl-game-def.json` drifted from generated output after spec-210 compile changes | FIXED — `4f1a97f` (regenerated) |
| 4 | Runner typecheck (unmasked by #1) | `ci` (typecheck step) | typecheck | PR regression | PR widened kernel `ChoiceTargetKind` to include `'value'`; `resolveChoiceTarget` in `derive-runner-frame.ts` still declared `('zone'\|'token')` | FIXED — `ef185d8` (widen param; resolver already ignores non-zone/token → scalar) |
| 3 | **Compound op+SA non-constructible move** | `perf`, `performance`, `determinism (runtime-parity, zobrist-123)`, `test (fitl-events-shard-c, policy-canaries, policy-preview-parity, fitl-rules, slow-parity-a/b/c)` | determinism-shard / test-lane / perf | PR regression | New compound op+SA enumeration (`legal-moves.ts compoundVariantsForOperation`) publishes `March+Ambush(after)` / `Train+Transport` compounds whose committed operation (0-unit March) cannot construct the paired SA; apply-time guard throws `MICROTURN_APPLY_DECISION_CONTINUATION_ILLEGAL` / `chooseN missing move param binding`. Violates Foundation 18. | DEFERRED — CMPSACON-001, CMPSACON-002 |

## Cluster 3 — diagnosis depth (so the next session does not re-bisect)

Captured ground truth (instrumented `apply.ts` throw site, FITL determinism seed 123):

```
actionId=march  saActionId=ambushNva  saTiming=after
topParams = [3 resolved march decision keys]   ← main fully resolved
saParams  = []                                 ← SA params EMPTY
illegal   = { kind:'illegal', reason:'emptyDomain' }
```

The selected move is a degenerate compound: `march → $targetSpaces=["binh-dinh"]` with `$movingGuerrillas=[]`, `$movingTroops=[]` (moves **zero units**), paired with an Ambush that has no target. `applyMove` correctly rejects the bare march (`moveNotLegalInCurrentState / emptyDomain`).

FITL rules confirm illegality: **3.3.2** (March *moves* pieces *into* spaces) + **4.4.3** (Ambush needs "≥1 Guerrilla that **Marched into**... each space"). A 0-unit March cannot support an Ambush.

### What did NOT work (avoid re-exploring)

1. **"Fall back to pre-main SA discovery"** — REJECTED by measurement: for `ambushNva`, post-main discovery yields 1 option, **pre-main yields 0**. Post-main discovery is correct; pre-main is emptier. The inconsistency is enumeration (SA validated against a partial/alternative main resolution) vs apply (SA given the committed main resolution), not pre- vs post-main.
2. **"Graceful degrade: don't throw on SA `emptyDomain`, fall through to `applyMove`"** — prototyped; removes the `CONTINUATION_ILLEGAL` throw but immediately exposes the next layer: `applyMove` rejects the 0-unit march itself as `moveNotLegalInCurrentState`. Confirms the defect is upstream in enumeration, not in the guard. Each layer's patch reveals the next; the guard is a symptom-catcher.
3. The throw is NOT a binding round-trip bug — the compound-SA binding prefix round-trip (`continuation-bindings.ts` ↔ `rebuildMoveFromFrame`) and the `decisionPath` tagging were verified correct in the probe path (SA decisions correctly tagged `compound.specialActivity`). The defect is that the agent commits an operation resolution incompatible with the paired SA.

### Fix shapes (recorded in CMPSACON-001 for the design decision)

- (A) Prune non-constructible compounds at enumeration (recommended; Foundation 18 publication contract).
- (B) Constrain the operation's chooseN options by the SA requirement during resolution (most faithful, most invasive).
- (C) Foundation 18 runtime safety net: deterministic rollback + blacklist instead of the unconditional throw (residual safety net).

## Verification done locally (clusters 1/2/4)

- `pnpm turbo lint` ✓, `pnpm turbo typecheck` ✓ (3/3), `pnpm turbo build` ✓
- `pnpm -F @ludoforge/runner bootstrap:fixtures:check` ✓
- `plan-controller.test.js` ✓ (1/1); full runner suite ✓ (2019/2019)
- Engine test/determinism/perf lanes remain red on cluster 3 until CMPSACON-001 lands (expected).
