# CMPSACON-003: Non-constructible compound op+SA still reaches the policy preview / WASM preview path

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `kernel/legal-moves.ts` (compound enumeration), `kernel/microturn/publish.ts` (constructibility invariant), `agents/policy-preview-inner-choosenstep.ts`, `agents/policy-preview-inner.ts`, `agents/policy-wasm-preview-drive-state-patch.ts`
**Deps**: archive/tickets/CMPSACON-001.md, archive/tickets/CMPSACON-002.md, archive/specs/210-fitl-behavioral-competence-fixture-corpus.md, docs/FOUNDATIONS.md

## Problem

On branch `implemented-spec-210` (PR #300), after CMPSACON-001/002 landed, three CI lanes still fail — all rooted in the **same** defect CMPSACON-001 was meant to close: a non-constructible compound operation+special-activity move still reaches the agent frontier and the policy-preview machinery.

CMPSACON-001 converted the apply-time `MICROTURN_APPLY_DECISION_CONTINUATION_ILLEGAL` throw into (a) a publication-probe tightening, (b) a `MICROTURN_CONSTRUCTIBILITY_INVARIANT` thrown from `publishMicroturn`, and (c) graceful try/catch degradation + simulator runtime rollback. This fixed the **simulator** lanes (`fitl-rules`, `slow-parity-a/b/c`, `perf`, `performance`, `determinism` runtime-parity + zobrist-123) but left the **preview** path broken in three ways:

1. **`test (fitl-events-shard-c)`** — `fitl-events-sihanouk.test.ts` → "policy-agent frontier evaluation stays inside the executable March mover decisions" fails with `MICROTURN_CONSTRUCTIBILITY_INVARIANT: actionSelection context has no bridgeable continuations`. The throw escapes an **unguarded** `publishMicroturn` call inside `continueChooseNStepInnerPreviewDrive` (`agents/policy-preview-inner-choosenstep.ts:429`). CMPSACON-001 wrapped the *apply* calls in this file but not the *publish* calls (sites at lines 211, 330, 429, 582).

2. **`test (policy-canaries)`** — "ARVN tournament worker-pool determinism" → `seed 1001 must not error`. `materializePolicyWasmPreviewStatePatch` (`agents/policy-wasm-preview-drive-state-patch.ts`) applies a published decision sequence for a `sweep` with empty params and throws `IllegalMoveError: Illegal move: actionId=sweep reason=moveHasIncompleteParams` from `applyPublishedDecision → applyMove → validateDecisionSequenceForMove`. The WASM preview drive was not given the graceful-degradation treatment CMPSACON-001 applied to the TS preview drive.

3. **`test (policy-preview-parity)`** — golden-trace `policy-preview-inner-outcome-parity.test.ts` mismatches fixtures `178-outcome-parity-{1005,1011,1008,1013,1009}.json`. The delta is a **mix** of two unrelated shifts:
   - *Legitimate (re-bless-worthy):* new spec-210 role-based preview refs — `requestedRefCount: 1 → 2`, new `preview.option.{delta.,}victory.currentMargin.role:currentLeader` ref stats.
   - *Quality regression (must NOT be blessed):* `outcomeBreakdown.ready: 2 → 0`, `unknownFailed: 0 → 2`. Previews that used to fully resolve now silently fail — the visible symptom of the non-constructible compound being degraded to a failed preview outcome rather than never being published.

The advisory lane `policy-profile-quality (full)` (continue-on-error) is cancelled/red downstream of the same preview path.

## Assumption Reassessment (2026-06-04)

1. **CMPSACON-001 did not implement enumeration-time pruning (design option A).** Confirmed by its Outcome section: it used "a combined publication-probe tightening plus the existing runtime rollback safety net, rather than a broad rewrite of `legal-moves.ts` enumeration." The prior CI report (`reports/ci-failures-pr-300-2026-06-04.md`) recommended option A as the Foundation 18 primary contract; it remains undone.
2. **CMPSACON-001's verification deferred these heavy lanes to CI.** Its Outcome lists only `fitl-rules` (80/80), `legal-choices-compound`, `zobrist-123`, and a targeted march test. `fitl-events-shard-c`, `policy-canaries`, `policy-preview-parity` were never run locally before push — classic CI-time masking.
3. **The preview is bounded exploration, not real play.** A preview drive legitimately reaches states with no bridgeable continuation; `publishMicroturn` throwing a hard invariant there is wrong. But merely catching the throw (degrade to failed) is *also* wrong because it converts a non-constructible-compound bug into a silent preview-quality regression (the `ready→unknownFailed` parity shift). The fix must keep the non-constructible compound out of the frontier in the first place.
4. **`@test-class` markers.** `fitl-events-sihanouk.test.ts` carries `architectural-invariant` (fix the kernel, do not soften). `policy-preview-inner-outcome-parity.test.ts` is `golden-trace` (re-bless only the legitimate role-ref delta, per `.claude/rules/testing.md`, AND only after the `ready→unknownFailed` regression is gone — never bless the regression).

## Architecture Check

1. **Root cause, not symptom (Foundation 15 + Foundation 18).** The frontier/preview must never see a compound op+SA whose committed operation cannot construct the paired SA. Catching throws at preview call sites is symptom-catching; it makes shard-c and policy-canaries green but leaves the `policy-preview-parity` quality regression (and the agent silently loses real preview signal).
2. **Determinism is sacred (Foundation 8).** The enumeration/publication change must preserve replay identity and incremental-vs-full Zobrist parity across the FITL determinism corpus.
3. **Game-agnosticism (Foundation 1, Foundation 19).** The constructibility check stays generic over op+SA pairings in `legal-moves.ts` / `publish.ts`; no FITL identifiers.
4. **No backwards-compat shims (Foundation 14).** Do not keep `publishMicroturn` throwing-and-catching as the steady-state model for preview. Either the non-constructible compound is never published (option A), or `publishMicroturn` exposes a non-throwing preview mode whose result is consumed deterministically by both the TS and WASM preview drives.

## What to Change

### 1. Prune non-constructible compounds at enumeration (recommended root fix — option A)

In `legal-moves.ts` `compoundVariantsForOperation`, do not emit a compound op+SA variant whose operation resolution cannot leave the paired SA with ≥1 constructible option. This keeps the move off the frontier, so neither the simulator (no rollback needed) nor the preview (no failed outcome) ever sees it. Resolve operation viability within the publication probe budget (Foundation 10 / Foundation 18 publication contract).

### 2. Make preview publication non-throwing (defensive, paired with #1)

Give the preview drives a `publishMicroturn` path that returns a sentinel ("no bridgeable continuation") instead of throwing `MICROTURN_CONSTRUCTIBILITY_INVARIANT`, and have **both** the TS drive (`policy-preview-inner-choosenstep.ts` sites 211/330/429/582, `policy-preview-inner.ts`) and the WASM drive (`policy-wasm-preview-drive-state-patch.ts`) consume it identically so TS↔WASM parity holds. With #1 in place this should be a rarely-hit residual, not the primary mechanism.

### 3. Re-bless the golden trace — legitimate delta only

After #1/#2, regenerate `178-outcome-parity-{seed}.json` so the fixtures pick up the new `role:currentLeader` refs, and **verify** `outcomeBreakdown` returns to `ready: 2 / unknownFailed: 0` (the regression is gone) before re-blessing. Commit body must include `Re-bless golden trace: test/architecture/policy-preview-inner-outcome-parity.test.ts` plus the spec-210 reason.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify — enumeration pruning)
- `packages/engine/src/kernel/microturn/publish.ts` (modify — non-throwing preview publication mode)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` (modify — consume sentinel at publish sites)
- `packages/engine/src/agents/policy-preview-inner.ts` (modify — consume sentinel)
- `packages/engine/src/agents/policy-wasm-preview-drive-state-patch.ts` (modify — graceful degradation parity)
- `packages/engine/test/architecture/fixtures/178-outcome-parity-*.json` (re-bless — legitimate role-ref delta only)
- `packages/engine/test/integration/compound-op-sa-constructibility.test.ts` (new or extend — frontier never contains a non-constructible compound under preview)

## Out of Scope

- The cluster-A unit-snapshot updates (`policy-eval-grouping`, `legal-choices`, `query-domain-kinds`) — landed on PR #300 alongside this ticket's creation.
- The `'value'` ChoiceTargetKind zone/token asymmetry (zone choices report `['zone','value']`) — accepted as the shipped contract for PR #300; revisit only if it causes incorrect plan-template role matching.

## Acceptance Criteria

### Tests That Must Pass

1. `fitl-events-sihanouk.test.ts` → "policy-agent frontier evaluation stays inside the executable March mover decisions" — no `MICROTURN_CONSTRUCTIBILITY_INVARIANT` escapes the inner preview.
2. `policy-canaries` "ARVN tournament worker-pool determinism" — seed 1001 (and all seeds) complete without `IllegalMoveError`.
3. `policy-preview-inner-outcome-parity.test.ts` — passes against re-blessed fixtures whose `outcomeBreakdown` shows the previews resolving `ready`, not `unknownFailed`.
4. Existing suite: `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-c`, `test:integration:policy-canaries`, `test:architecture:policy-preview-parity`.

### Invariants

1. **Constructibility = legality (Foundation 18):** no published move (frontier or preview) is rejected by `applyMove`; preview publication does not throw a hard invariant.
2. **Determinism (Foundation 8):** incremental Zobrist == full recompute; replay identical across the FITL corpus.
3. **TS↔WASM preview parity:** the two preview drives degrade identically on a non-constructible residual.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/compound-op-sa-constructibility.test.ts` — extend to drive the agent preview (chooseNStep inner preview + WASM preview) over a corpus and assert no throw escapes and no `unknownFailed` outcome arises from a non-constructible compound.
2. Re-bless `178-outcome-parity-*.json` (golden-trace) — legitimate role-ref delta only.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/integration/fitl-events-sihanouk.test.js`
2. `pnpm -F @ludoforge/engine test:integration:policy-canaries`
3. `pnpm -F @ludoforge/engine test:architecture:policy-preview-parity`
4. `pnpm turbo lint typecheck build`

## What Did NOT Work (avoid re-exploring)

1. **CMPSACON-001's "tighten publication probe + runtime rollback" approach** — fixed the simulator lanes but left preview producing silent `failed`/`unknownFailed` outcomes (the `policy-preview-parity` regression) and still threw in unguarded preview/WASM publish sites. Symptom-catching, not root-cause closure.
2. **Catching the throw at the preview call sites alone** — would turn `fitl-events-shard-c` and `policy-canaries` green but leaves `policy-preview-parity` red (the `ready→unknownFailed` regression remains; re-blessing it would bless a quality regression, forbidden by `.claude/rules/testing.md`).
3. Prior diagnosis from CMPSACON-001 still holds: the defect is the agent committing an operation resolution incompatible with the paired SA; SA `emptyDomain` at apply is the downstream symptom.
