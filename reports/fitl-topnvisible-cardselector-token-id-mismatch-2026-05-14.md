# FITL / Spec 170–171 — `matchesCardSelector` Compares Token Instance Id Instead of Card Identity

**Author**: Claude Opus 4.7 (`/improve-loop` skill on `campaigns/fitl-arvn-agent-evolution`)
**Date**: 2026-05-14
**Status**: Architectural-gap halt per Step 7.7 of `improve-loop`. Loop paused at iteration 1 (during the mandatory DIAGNOSE verification probe) awaiting user direction.
**Audience**: Project maintainer (codebase access assumed). Written to be self-contained enough to hand to an external reviewer if desired.
**Predecessor report**: `reports/fitl-arvn-spec-170-discard-zone-coverage-gap-2026-05-14.md` (the spec-170 `visiblePrefix` starvation gap that spec 171 fixed). **This is a different, deeper bug** that spec 171 did not touch and that the spec-170 starvation bug was masking.

---

## 1. TL;DR

The `topNVisible` schedule-observer resolver's `matchesCardSelector` helper identifies a card token by `String(token.id)` — the **token instance id** (e.g. `tok___eventCard_351`) — and looks it up against the event-deck **card-definition ids** (`card-125` … `card-130`). Real Fire in the Lake card tokens carry their card identity in `token.props.cardId`, not `token.id`. The lookup `def.eventDecks[].cards.find(entry => entry.id === tokenId)` therefore **always returns `undefined`**, so tag matching (`cardSelector: { tags: [coup] }`) **always returns `false`**.

Consequence: `schedule.distance.toBoundary.coupEntry.cards` — the Coup-timing schedule ref that specs 169/170/171 built and the cookbook documents — **can never resolve `ready` in a real FITL game.** It always returns `partial.lowerBound`, regardless of whether a Coup card is actually sitting in the visible `[played:none top, lookahead:none top]` sequence.

The bug exists in **two parallel copies** of `matchesCardSelector`:
- `packages/engine/src/agents/policy-runtime.ts:406-423` (TypeScript resolver)
- `packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts:123-141` (WASM host-side parallel copy)

It was introduced in **spec 170** (commit `d552263e6`, ticket `170PARTVISOBS-002`). Spec 171 rewrote the surrounding `resolveVisiblePrefixBoundaryCardDistance` (per-source `take`) but left `matchesCardSelector` unchanged.

Every spec-170 and spec-171 test passes because **every test fixture builds synthetic card tokens whose `.id` IS the card-definition id and whose `.props` is empty** — the exact shape that makes the buggy comparison accidentally succeed. No test exercises the real FITL deck token shape. This is a Foundation #16 violation ("an architectural property must be proven against the real execution path, not an artificial fixture") in the test fixtures themselves.

**Severity**: Architectural — Foundation #15 (Architectural Completeness): a documented, spec-promised, cookbook-exemplified capability is silently non-functional under the production configuration, with no compiler diagnostic, runtime warning, or trace anomaly to alert a profile author.

**The fix is small and unambiguous** (see §7): resolve the card identity via `token.props.cardId` — the engine already has the canonical helper `resolveEventCardTokenId` in `event-execution.ts:246` that does exactly this. The larger work is fixing the test fixtures so the bug class cannot regress.

---

## 2. Background

LudoForge-LLM compiles Structured Game Specifications into GameDef JSON run by a deterministic kernel. Agents author PolicyAgent profiles whose **considerations** score legal moves via typed `ref`s. Spec 169 introduced `schedule.distance.toBoundary.<boundaryId>.cards` (card distance to the next matching card-draw boundary). Spec 170 added the `topNVisible` observer policy so the ref can resolve through public face-up zones. Spec 171 replaced spec 170's `visiblePrefix.zones`+`maxItems` with `visiblePrefix.sources[]`+per-source `take`, fixing a starvation bug (the predecessor report).

FITL's `coupEntry` boundary (`data/games/fire-in-the-lake/30-rules-actions.md:18-33`):

```yaml
phaseBoundaries:
  - id: coupEntry
    kind: phaseEntry
    phaseId: coupVictory
    schedule:
      kind: cardDraw
      deckId: fitl-events-initial-card-pack
      cardSelector:
        tags: [coup]
      observerPolicy:
        kind: topNVisible
        visiblePrefix:
          sources:
            - id: played:none
              take: 1
            - id: lookahead:none
              take: 1
```

The cookbook (`docs/agent-dsl-cookbook.md:343-362`) documents the intended behavior: *"If the next card in `lookahead:none` is a coup card, the ref is ready with distance `1` rather than the spurious `partial.lowerBound: 2`."*

The `fitl-arvn-agent-evolution` campaign was resumed (after the spec-170 → spec-171 fix landed) with a user directive: *"in the latest PR merge, we fixed some issues with the ability to look ahead at incoming cards… prove the current state."* This report is the result of that verification.

---

## 3. Symptom

DIAGNOSE run B added a one-line probe consideration to `arvn-evolved` and ran a 15-seed trace tournament:

```yaml
probeCoupDistance:
  scopes: [move]
  costClass: state
  weight: 1
  value:
    ref: schedule.distance.toBoundary.coupEntry.cards
  scheduleFallback:
    onUnavailable: noContribution
    onPartial:
      visiblePrefixExhausted: useLowerBound
```

Aggregating every candidate's `inputRefs[scheduleDistanceRefId]` resolution across 15 deterministic seeds:

```
candidates with a scheduleDistance inputRefs record: 2467
  status = "ready"   : 0
  status = "partial" : 2467   (all partial.lowerBound = 2)
```

**Zero `ready` resolutions.** A sample record:

```json
{
  "status": "partial",
  "partialKind": "lowerBound",
  "lowerBound": 2,
  "observerPolicy": "topNVisible",
  "visiblePrefixLength": 2,
  "visibleSequenceSources": [
    { "zoneId": "played:none",    "availablePublic": 6, "taken": 1 },
    { "zoneId": "lookahead:none", "availablePublic": 1, "taken": 1 }
  ]
}
```

Note `played:none {availablePublic: 6, taken: 1}` — **spec 171's per-source `take` fix works correctly**: the resolver no longer drowns in accumulated discards; it composes exactly `[played:none top, lookahead:none top]`. The starvation bug the predecessor report described is genuinely fixed. The resolver *scans* the right two cards. It just can never *match* either of them.

---

## 4. Trace Evidence

### 4.1 A Coup card is never observed in any visible slot — for any seat

`campaigns/fitl-arvn-agent-evolution/diagnose-coup-lookahead.mjs` wraps all four agents and, at every `chooseDecision`, inspects the live `played:none` / `lookahead:none` zone contents, classifying each top token against the coup-card-definition id set:

```
seeds=5  totalDecisions=1055
  us:   decisions=207  lookaheadCoup=0  playedCoup=0
  vc:   decisions=254  lookaheadCoup=0  playedCoup=0
  nva:  decisions=196  lookaheadCoup=0  playedCoup=0
  arvn: decisions=398  lookaheadCoup=0  playedCoup=0
seedsWithCoupInLookahead = 0/5
```

This script *itself* used `coupCardIds = Set("card-125".."card-130")` compared against `String(token.id)` — i.e. it reproduced the engine's bug, and (correctly, given the bug) found nothing. That false-negative was the clue: the token ids printed were `tok___eventCard_NNN`, never `card-NNN`.

### 4.2 Real FITL card token shape

`initialState(def, 1000, 4)` — a real FITL initial state — `deck:none` token, dumped raw:

```json
{
  "id": "tok___eventCard_351",
  "type": "__eventCard",
  "props": { "cardId": "card-127", "eventDeckId": "fitl-events-initial-card-pack", "isCoup": true }
}
```

- `token.id` = `"tok___eventCard_351"` — the token **instance** id.
- `token.props.cardId` = `"card-127"` — the card **identity** (matches a `def.eventDecks[0].cards[].id`).
- `token.props.isCoup` = `true` — the coup flag, used correctly elsewhere (see §5.3).

The 6 coup card definitions are `card-125` … `card-130`. No token's `.id` is ever a `card-NNN` string.

### 4.3 Definitive single-token proof

`campaigns/fitl-arvn-agent-evolution/diagnose-cardselector-tokenid-bug.mjs` takes a real FITL initial state, extracts the **real** coup token `tok___eventCard_351` (`props.cardId="card-127"`, `props.isCoup=true`) from the shuffled deck, places it at the top of `lookahead:none`, a real non-coup token in `played:none`, and calls the production resolver `providers.phaseSchedule.resolveScheduleDistance(REF)`:

```json
{
  "kind": "partial",
  "partialKind": "lowerBound",
  "lowerBound": 2,
  "observerPolicy": { "kind": "topNVisible" },
  "visiblePrefixLength": 2,
  "visibleSequenceSources": [
    { "zoneId": "played:none",    "availablePublic": 1, "taken": 1 },
    { "zoneId": "lookahead:none", "availablePublic": 1, "taken": 1 }
  ]
}
```

A real coup token IS the top of `lookahead:none`, the resolver scanned it (`taken: 1`), and still returned `partial.lowerBound: 2` instead of `ready: 1`.

Logic comparison on that same real coup token:

```
CURRENT  matchesCardSelector (uses String(token.id)="tok___eventCard_351")  => false
CORRECTED            logic   (uses token.props.cardId="card-127")           => true
CORRECTED logic on a real non-coup token (props.cardId="card-68")           => false   (no false positives)
```

---

## 5. Root Cause Analysis

### 5.1 The buggy helper (two identical copies)

`packages/engine/src/agents/policy-runtime.ts:406-423`:

```ts
function matchesCardSelector(
  def: GameDef,
  token: Token,
  cardSelector: ...,
): boolean {
  const tokenId = String(token.id);                       // <-- token INSTANCE id
  if (cardSelector.cardIds?.includes(tokenId) === true) {  // <-- compares against card-DEF ids
    return true;
  }
  const requestedTags = cardSelector.tags ?? [];
  if (requestedTags.length === 0) {
    return false;
  }
  const card = (def.eventDecks ?? [])
    .flatMap((deck) => deck.cards)
    .find((entry) => entry.id === tokenId);                // <-- entry.id is a card-DEF id; tokenId never is
  return requestedTags.some((tag) => card?.tags?.includes(tag) === true);
}
```

`packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts:123-141` is a byte-for-byte equivalent copy (spec 171 §2.5 explicitly describes the WASM seam as "a parallel copy of the TS resolver").

Both the `cardSelector.cardIds` branch and the `cardSelector.tags` branch are wrong: `cardIds` in a GameSpec are card-definition ids, and `entry.id` is a card-definition id, but `tokenId = String(token.id)` is a token instance id. The two id spaces never intersect for real game tokens.

### 5.2 Real tokens vs. test tokens

The token's `props.cardId` is set at card-token creation. `compile-event-cards.ts:626` builds the card-index entry `{ deckId, cardId: card.id, tags, metadata }`, and the kernel materializes deck tokens with `props.cardId` carrying the card-definition id while `token.id` is an allocated instance id (`tok___eventCard_<ordinal>`).

The engine already has the **canonical card-identity resolver** — `event-execution.ts:246`:

```ts
const resolveEventCardTokenId = (token: Token): string => {
  const props = token.props as Readonly<Record<string, unknown>>;
  const explicit = props.cardId;
  return typeof explicit === 'string' && explicit.length > 0 ? explicit : String(token.id);
};
```

…used at `event-execution.ts:265` in `resolveCurrentEventCardState` to do **exactly** the lookup `matchesCardSelector` botches:

```ts
const tokenCardId = resolveEventCardTokenId(topToken);
const card = deck.cards.find((candidate) => candidate.id === tokenCardId);
```

`matchesCardSelector` should have used this helper (or its logic) and did not.

### 5.3 The kernel's own coup detection is correct — only the agent-facing resolver is broken

`turn-flow-lifecycle.ts:233`:

```ts
const isCoupCard = (token: Token): boolean => resolveTokenViewFieldValue(token, 'isCoup') === true;
```

`resolveTokenViewFieldValue(token, 'isCoup')` → `resolveLiteralTokenFieldValue` → `token.props['isCoup']` (`token-view.ts:23-28`). So the **turn-flow lifecycle** (coup handoff, `applyPromotedCoupImmediateEffects`, consecutive-coup-round tracking) correctly identifies coup cards via `props.isCoup`. Coup *phases* fire correctly in real games. **Only the agent-facing `topNVisible` schedule resolver — the thing that lets a PolicyAgent reason about coup timing — is blind.**

`gamedef-runtime.ts:228-245` (`createCardDrawRuntimeState`, the spec-169 hidden-deck `triggeringCardPositions` path) is also correct: it iterates `deck.cards` (card *definitions*) and matches on `card.id` / `card.tags`. The bug is isolated to the `topNVisible` token-scanning path.

### 5.4 Why no test caught it — Foundation #16 violation in the fixtures

Every spec-170/171 test fixture constructs synthetic tokens of the shape `{ id: cardId, type: 'card', props: {} }`:

- `partial-visibility-fitl-coup-distance.test.ts:26-30` — `cardToken = (cardId) => ({ id: asTokenId(cardId), type: 'card', props: {} })`
- `partial-visibility-fitl-production-flow.test.ts:32-36` — identical `cardToken` helper
- The shared fixtures behind `schedule-ref-consideration-trace-topNVisible.test.ts`, `partial-visibility-resolver-correctness.test.ts`, `partial-visibility-no-leak.test.ts`, etc. follow the same `id === cardId` convention.

`partial-visibility-fitl-production-flow.test.ts` is *named* "production-flow" and *does* drive the real `applyTurnFlowInitialReveal` + `applyTurnFlowCardBoundary` lifecycle — but it feeds that lifecycle a synthetic deck of synthetic tokens whose `.id` is the card-definition id and whose `.props` is empty. It exercises the lifecycle *mechanics* (promotion, per-source `take`) but never the real FITL token *shape*. Spec 171 §2.4 explicitly criticized spec 170's test for using an artificial `withVisibleCards` state ("an architectural property must be proven against the real execution path, not an artificial fixture") — and then shipped a replacement test with a *different* artificiality that hides this bug.

When `token.id === cardId` and `props` is empty, `String(token.id)` accidentally equals the card-definition id, so `matchesCardSelector` accidentally works. The bug is invisible to the entire test suite.

---

## 6. Impact

- `schedule.distance.toBoundary.coupEntry.cards` is non-functional for FITL: it is a constant `partial.lowerBound: 2` signal. Any consideration reading it via `onPartial.visiblePrefixExhausted: useLowerBound` gets a constant `2`; via `noContribution`/`dropConsideration` gets nothing. It cannot distinguish "Coup imminent" from "Coup far away."
- This invalidates the entire spec-169/170/171 schedule-ref capability **for any game whose card tokens carry identity in `props.cardId`** (i.e. the real card-lifecycle path — all of them). The capability currently works *only* for hand-built synthetic tokens.
- The `fitl-arvn-agent-evolution` campaign cannot author coup-timing-aware ARVN considerations (the prior session's `preferGovernEarlyInCoupCycle` / `preferTrainAsCoupApproaches` direction) until this is fixed — they would all read a constant.
- Three prior campaign lessons (`lessons-global.jsonl` lines 135, 136, 139) asserting the schedule ref is "FUNCTIONAL for FITL arvn-evolved end-to-end" are stale; a `type: negative` correction has been appended to both `lessons.jsonl` and `lessons-global.jsonl`.

---

## 7. Proposed Fix

### 7.1 Core fix (small, unambiguous)

Resolve the card identity via `token.props.cardId` before the deck lookup, in **both** copies of `matchesCardSelector`:

```ts
function matchesCardSelector(def: GameDef, token: Token, cardSelector: ...): boolean {
  const cardId = typeof token.props.cardId === 'string' && token.props.cardId.length > 0
    ? token.props.cardId
    : String(token.id);                       // fallback keeps synthetic-token tests valid
  if (cardSelector.cardIds?.includes(cardId) === true) {
    return true;
  }
  const requestedTags = cardSelector.tags ?? [];
  if (requestedTags.length === 0) {
    return false;
  }
  const card = (def.eventDecks ?? [])
    .flatMap((deck) => deck.cards)
    .find((entry) => entry.id === cardId);
  return requestedTags.some((tag) => card?.tags?.includes(tag) === true);
}
```

The `?? String(token.id)` fallback mirrors the existing canonical `resolveEventCardTokenId` (`event-execution.ts:246`) exactly — it is robustness, not backwards-compat scaffolding, so it is Foundation #14-clean.

**DRY option (preferred):** export `resolveEventCardTokenId` from a shared kernel module and use it in both `matchesCardSelector` copies, eliminating a third copy of the id-resolution logic. Caveat: `lessons-global.jsonl` line 30 records that adding cross-module `agents/ ← kernel/` imports on hot paths has caused V8 deopt regressions in a *perf* campaign. `matchesCardSelector` is on the schedule-ref resolution path (per schedule-reading consideration, per candidate) — not the tightest hot loop, but not free either. If the import is a concern, inline the 3-line identity resolution in each copy instead and add a comment cross-referencing `resolveEventCardTokenId` as the canonical source of truth. Either way the *logic* must be identical to `resolveEventCardTokenId`.

### 7.2 Test fixes (the part that actually prevents regression)

The core fix is two lines. The real work — and the reason this is an *architectural* report, not a one-line ticket — is Foundation #16: the test fixtures must exercise the real token shape.

1. Update the synthetic `cardToken` helpers in `partial-visibility-fitl-coup-distance.test.ts`, `partial-visibility-fitl-production-flow.test.ts`, and the shared partial-visibility fixtures to produce tokens with **distinct** instance ids and `props.cardId` carrying the card-definition id — i.e. the real shape `{ id: asTokenId('tok-…'), type: 'card', props: { cardId } }`. With the *current* buggy resolver these updated fixtures must FAIL (RED), proving they now exercise the bug; with the §7.1 fix they pass (GREEN).
2. Add a regression test that builds a state from the **actual FITL deck tokens** (as `diagnose-cardselector-tokenid-bug.mjs` does: `initialState(def, seed, 4)`, pull a real `props.isCoup === true` token, place it in `lookahead:none`, assert `resolveScheduleDistance` returns `ready: 1`). This closes the gap between "drives the real lifecycle functions" and "uses the real token shape."
3. Confirm the WASM-path bytecode-equivalence test (`policy-bytecode-equivalence-partial-visibility.test.ts`) also uses real-shaped tokens, so the WASM copy of the fix is covered.

### 7.3 Alternatives considered

| Option | Description | Verdict |
|---|---|---|
| **A. Fix `matchesCardSelector` to use `props.cardId`** (§7.1) | Resolve identity correctly at the comparison site. | **Recommended.** Matches the existing canonical `resolveEventCardTokenId`. Minimal, local, correct. |
| B. Normalize tokens upstream (have `readPublicZoneCards` rewrite `token.id`) | Make the buggy comparison accidentally correct by mutating tokens. | Rejected. Mutating token identity to paper over a wrong-field bug; violates immutability and hides the real issue. |
| C. Change card tokens so `token.id === cardId` | Make real tokens look like the test fixtures. | Rejected. Token instance ids must be unique (multiple physical copies / conservation invariant in `assertCardTokenConservation`, `turn-flow-lifecycle.ts:252`). Card identity ≠ token identity by design. |
| D. Leave the resolver, only fix tests | — | Rejected. The capability stays non-functional. |

### 7.4 Foundation alignment of the recommended fix

- **#1 Engine Agnosticism**: `props.cardId` is the generic card-identity convention (`compile-event-cards.ts:626`, `resolveEventCardTokenId`); no FITL-specific logic.
- **#8 Determinism / #10 Bounded computation**: unchanged — still an `O(sum(take))` deterministic scan.
- **#15 Architectural Completeness**: closes a silent partial-coverage gap (works for synthetic tokens, silently fails for real ones).
- **#16 Testing as Proof**: §7.2 makes the fixtures exercise the real execution path; the new regression test proves the property against real FITL deck tokens.

This is a clear single fix with a well-bounded test surface — a strong candidate for a **spec** (or even a tightly-scoped ticket), not an open-ended research report.

---

## 8. Adjacent Concerns

1. **The `cardSelector.cardIds` branch is broken the same way.** FITL's `coupEntry` uses `tags: [coup]`, not `cardIds`, so FITL isn't bitten by it today — but any game (or future FITL boundary) that uses `cardIds` would hit the identical token-id-vs-card-id mismatch. The §7.1 fix repairs both branches at once.
2. **`actionSelection` candidate `scoreContributions: []` trace gap** (pre-existing, noted in `lessons-global.jsonl` line 138). Independent of this bug — the `inputRefs` field IS populated on `actionSelection` candidates, which is how the §3/§4 evidence was gathered — but it remains a separate observability weakness worth its own triage.
3. **Spec 171's "production-flow" test naming is misleading.** A test that drives real lifecycle functions with synthetic tokens should not be presented as proof of production behavior. Worth a brief audit of other "production-flow" / "production-spec" tests for the same synthetic-token shortcut.

---

## 9. Verification / Reproduction Recipe

All three diagnostic scripts are in `campaigns/fitl-arvn-agent-evolution/` (preserved on the campaign worktree branch):

1. `diagnose-cardselector-tokenid-bug.mjs` — the definitive single-token proof (§4.3). Run: `node campaigns/fitl-arvn-agent-evolution/diagnose-cardselector-tokenid-bug.mjs`. Expect `partial.lowerBound: 2` from the production resolver with a real coup token in `lookahead:none`, and `CURRENT => false / CORRECTED => true` from the logic comparison.
2. `diagnose-coup-lookahead.mjs` — the all-seats whole-game scan (§4.1). Run: `node campaigns/fitl-arvn-agent-evolution/diagnose-coup-lookahead.mjs --seeds 5`.
3. `diagnose-action-distribution.mjs` — aggregates `inputRefs` / `scheduleFallbackFired` across a `--trace-default all` tournament (§3).

Post-fix acceptance: script #1 must report `ready: 1`; a `--trace-default all` probe run must produce a non-zero count of `status: "ready"` `inputRefs` records across the 15-seed corpus.

---

## 10. Worktree State and Recommended Next Step

**Branch**: `improve/fitl-arvn-agent-evolution` in `.claude/worktrees/improve-fitl-arvn-agent-evolution/`.

- Baseline committed (`0a8e221b6`, empty — `arvn-evolved` unchanged from main; `compositeScore=-3.4`, `wins=4/15`).
- The DIAGNOSE verification probe (`probeCoupDistance`) was added, measured, and **reverted** — `data/games/fire-in-the-lake/92-agents.md` is back at baseline. No experiment was logged; `results.tsv` carries a `baseline` row and an `arch-gap-001` marker row.
- `campaigns/lessons-global.jsonl` and the campaign `lessons.jsonl` have a new `type: negative` stale-lesson correction (supersedes lines 135/136/139).
- Three `diagnose-*.mjs` scripts added (reusable; should be preserved with the campaign).
- `musings.md` carries the full DIAGNOSE record and the ARCHITECTURAL-GAP HALT entry.

**The campaign is HALTED at iteration 1.** This bug blocks the directive-#1 verification ("prove the current state of the lookahead capability") with a definite negative answer: the capability is still non-functional for FITL, now for this token-id reason rather than the spec-170 starvation reason.

Recommended path: land the §7 fix (spec or scoped ticket), then resume the campaign via the `improve-loop` "Suspended Campaign Resume" path (STATE-EVOLVED stale-baseline recovery — `results.tsv`/`checkpoints.jsonl` cleared, `seed-tier.txt` retained at 15, lessons preserved). Note that the **second, independent user concern** for this campaign — ARVN's action monoculture (65% Govern / 21% Train / ~0% Patrol/Sweep/Advise; see `musings.md` DIAGNOSE entry) — is a DSL-authoring problem, not a code gap, and is workable *now* without waiting for this fix; only the coup-timing-aware sub-strategies depend on it.
