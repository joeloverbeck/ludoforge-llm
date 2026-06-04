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

---

# Round 2 — 2026-06-04 (HEAD `ff92f88ed`, after CMPSACON-001/002)

CMPSACON-001 (`c9c1d40b`) + CMPSACON-002 (`66e9c7b6`) landed. They turned the cluster-3 **simulator** lanes green (`fitl-rules`, `slow-parity-a/b/c`, `perf`, `performance`, `determinism` runtime-parity + zobrist-123). The CI run on `120ad53e3`'s successor surfaced the remaining failures, collapsing to **2 clusters**:

| Cluster | Lanes | Class | Status | Root cause | Resolution |
|---------|-------|-------|--------|-----------|------------|
| A | `ci` (test step) | test-lane | PR regression (stale snapshots) | Deliberate spec-210 contract changes — `toMoveIdentityKey` appends a `noCompound`/compound segment (default `includeCompound:true`); `deriveChoiceTargetKinds` emits `'value'` for scalar runtime shapes. Author updated `move-identity-extended.test.ts` + the runner type but missed `policy-eval-grouping.test.ts`, `legal-choices.test.ts`, `query-domain-kinds.test.ts`. | FIXED — `ff92f88ed` (5 assertions + 1 test name; user chose "update assertions only", keeping the shipped zone+value behavior) |
| B | `test (fitl-events-shard-c)`, `test (policy-canaries)`, `test (policy-preview-parity)`, advisory `policy-profile-quality (full)` | test-lane / determinism-adjacent | PR regression — **residual of round-1 cluster 3** | Non-constructible compound op+SA still reaches the agent frontier/preview. CMPSACON-001's "tighten publication probe + runtime rollback" fixed the simulator but left preview paths broken: unguarded `publishMicroturn` in `continueChooseNStepInnerPreviewDrive` throws `MICROTURN_CONSTRUCTIBILITY_INVARIANT`; `materializePolicyWasmPreviewStatePatch` throws `IllegalMoveError`; golden-trace parity shows `ready:2→unknownFailed:2` (quality regression) alongside the legit new `role:currentLeader` refs. | DEFERRED — **CMPSACON-003** (untracked ticket) |

## Is the round-1 cluster-3 root cause still active?

**Yes.** CMPSACON-001 did not implement design option A (enumeration-time pruning); it converted the apply-time throw into graceful degradation + simulator rollback. That closed the symptom on the simulator lanes but converted the same non-constructible-compound defect into a **silent preview-quality regression** on the preview/WASM-preview path. The root cause (a compound op+SA whose committed operation cannot construct the paired SA being publishable into the frontier) is unchanged. CMPSACON-003 carries the full diagnosis.

## What did NOT work (round 2)

1. Catching the throw at the preview call sites alone would green `fitl-events-shard-c` and `policy-canaries` but leaves `policy-preview-parity` red — the `ready→unknownFailed` golden-trace regression can't be re-blessed without blessing a quality regression (forbidden by `.claude/rules/testing.md`).
2. Cluster A required fixing **three** test files, not the two visible in the first CI failing-tests block — `query-domain-kinds.test.js` was masked behind the others and surfaced only in the full local unit run.

## Verification (round 2, cluster A)

- Engine unit suite (`ci` test step): 0 fail (was 5 failing assertions across 3 files).
- `pnpm turbo lint typecheck`: 5/5 successful; engine build green.
- Cluster B lanes stay red on the next CI run by design until CMPSACON-003 lands.
