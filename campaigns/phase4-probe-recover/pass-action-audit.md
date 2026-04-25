# Spec 144 I3 Pass-Action Audit

Date: 2026-04-24

Scope: conformance-corpus fallback actions used by the Spec 144 rollback safety net.

## Engine Predicate

The engine-side fallback predicate is generic:

```ts
action.tags?.includes('pass')
```

The engine does not hard-code game ids, action ids, factions, or rule branches. A fallback action must still pass the normal authored legality/applicability pipeline and is published as a normal `actionSelection` decision.

## Corpus Classification

| Game | Fallback action | Source | Tags after audit | Applicability | Decision |
| --- | --- | --- | --- | --- | --- |
| Fire in the Lake | `pass` | `data/games/fire-in-the-lake/30-rules-actions.md:159` | `[pass]` | Main phase, active faction, no params, no authored effects today | Already conforms. |
| Texas Hold'em | `check` | `data/games/texas-holdem/30-rules-actions.md:258` | `[check, pass]` | Betting phases, active player, only when `streetBet == currentBet` | Updated to carry the generic pass tag. |
| Texas Hold'em | `fold` | `data/games/texas-holdem/30-rules-actions.md:243` | `[fold]` | Betting phases, active player | Not tagged as pass; surrender is not the generic no-bet pass fallback. |

Texas Hold'em's verbalization already describes `check` as "Pass without adding chips to the pot" in `data/games/texas-holdem/05-verbalization.md:56`. Adding `pass` to `check` keeps fallback semantics in authored GameSpecDoc data (Foundations #2 and #7) while preserving engine agnosticism (Foundations #1). `fold` remains fold-only because making surrender the generic pass fallback would be a semantic rule change and could cause the fallback to select fold where check is the rule-faithful no-bet pass.

## Grant-Clearing Decision

Rollback does not synthesize a FITL-specific effect and does not modify FITL's `pass` action in this ticket.

Live seed-1001 reassessment disproved the original path (c) assumption: leaving a ready blocking free-operation grant in place after rollback prevented the generic `tags: [pass]` fallback from publishing, so the simulator still terminated as `noLegalMoves`.

Revised decision: rollback applies a generic grant-lifecycle reconciliation for the recovered seat. When it blacklists an action and restores the nearest `actionSelection` frame, it also expires ready blocking free-operation grants (`required` and `skipIfNoLegalCompletion`) for that seat. The fallback pass action still runs through the normal apply pipeline. This keeps the behavior engine-agnostic: rollback does not know FITL action ids or faction rules, and game-authored `pass` / `check` actions still carry the fallback semantics.
